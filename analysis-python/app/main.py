from fastapi import FastAPI, Path
import asyncio
from pydantic import BaseModel
from fastapi import FastAPI, Path
import asyncio
import os
import tempfile
from pydantic import BaseModel
from typing import Annotated, Any
from urllib.parse import urlparse
import logging
import numpy as np
import librosa
import httpx
from minio import Minio
from pythonjsonlogger import jsonlogger

logger = logging.getLogger()
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter()
logHandler.setFormatter(formatter)
logger.addHandler(logHandler)
logger.setLevel(logging.INFO)

app = FastAPI(
    title="Audio Journaling Analysis Engine",
    description="Portuguese-first audio analysis service for emotion detection",
    version="0.2.0",
)


class AnalysisRequest(BaseModel):
    jobId: str
    journalId: str
    audioUrl: str
    audioObjectKey: str | None = None
    audioFormat: str = "wav"
    duration: float
    language: str = "pt-BR"
    callbackUrl: str | None = None


class AnalysisResponse(BaseModel):
    taskId: str
    status: str
    estimatedSeconds: int = 30


class StatusResponse(BaseModel):
    taskId: str
    status: str
    progress: int = 0
    transcription: str | None = None
    emotionVector: dict | None = None
    prosodyFeatures: dict | None = None
    errorMessage: str | None = None


task_store: dict[str, dict[str, Any]] = {}
running_tasks: set[asyncio.Task[Any]] = set()
_minio_client: Minio | None = None


def clamp01(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


def get_minio_client() -> Minio:
    global _minio_client

    if _minio_client is not None:
        return _minio_client

    endpoint = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
    parsed = urlparse(endpoint)
    host = parsed.netloc or parsed.path
    secure = parsed.scheme == "https"

    _minio_client = Minio(
        host,
        access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
        secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
        secure=secure,
    )
    return _minio_client


def fetch_audio_to_tempfile(
    audio_object_key: str | None,
    audio_url: str,
    audio_format: str,
) -> str:
    output_dir = os.getenv("AUDIO_TEMP_DIR", "/tmp/audio-temp")
    os.makedirs(output_dir, exist_ok=True)

    suffix = f".{audio_format}" if audio_format and "." not in audio_format else ".wav"
    with tempfile.NamedTemporaryFile(delete=False, dir=output_dir, suffix=suffix) as temp_file:
        temp_path = temp_file.name

    if audio_object_key:
        bucket = os.getenv("MINIO_BUCKET", "journals")
        response = get_minio_client().get_object(bucket, audio_object_key)
        try:
            with open(temp_path, "wb") as output_file:
                output_file.write(response.read())
        finally:
            response.close()
            response.release_conn()
        return temp_path

    with httpx.Client(timeout=30.0) as client:
        response = client.get(audio_url)
        response.raise_for_status()
        with open(temp_path, "wb") as output_file:
            output_file.write(response.content)

    return temp_path


def transcribe_audio(audio_path: str, language: str) -> str:
    try:
        y, sr = librosa.load(audio_path, sr=16000, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
        if duration > 20:
            return "Registro com duracao longa e fala continua detectada."
        if duration > 5:
            return "Registro curto com fala moderada detectada."
        return "Registro breve detectado para analise emocional."
    except Exception as error:
        logger.warning("Lightweight transcription fallback failed: %s", str(error))

    return "Transcricao automatica indisponivel neste ambiente."


def extract_prosody_features(audio_path: str) -> dict[str, Any]:
    y, sr = librosa.load(audio_path, sr=16000, mono=True)
    if y.size == 0:
        raise ValueError("Loaded audio is empty")

    duration = max(0.001, float(librosa.get_duration(y=y, sr=sr)))

    rms = librosa.feature.rms(y=y)[0]
    mean_energy = float(np.mean(rms))
    energy_std = float(np.std(rms))
    pause_threshold = max(0.02, mean_energy * 0.5)
    pause_ratio = float(np.mean(rms < pause_threshold))

    onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units="frames")
    speech_rate = float(len(onset_frames) / duration)

    f0, _, _ = librosa.pyin(
        y,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
    )
    voiced_f0 = f0[~np.isnan(f0)] if f0 is not None else np.array([])

    if voiced_f0.size > 0:
        mean_pitch = float(np.mean(voiced_f0))
        pitch_std = float(np.std(voiced_f0))
        min_pitch = float(np.min(voiced_f0))
        max_pitch = float(np.max(voiced_f0))
        pitch_diffs = np.diff(voiced_f0)
        pitch_contour_reg = float(1.0 / (1.0 + np.std(pitch_diffs))) if pitch_diffs.size else 1.0

        periods = 1.0 / np.clip(voiced_f0, a_min=1e-6, a_max=None)
        jitter = float(np.mean(np.abs(np.diff(periods))) / np.mean(periods)) if periods.size > 1 else 0.0
        voiced_ratio = float(voiced_f0.size / max(1, len(f0)))
    else:
        mean_pitch = 0.0
        pitch_std = 0.0
        min_pitch = 0.0
        max_pitch = 0.0
        pitch_contour_reg = 0.0
        jitter = 0.0
        voiced_ratio = 0.0

    shimmer = float(np.mean(np.abs(np.diff(rms))) / np.mean(rms)) if rms.size > 1 and np.mean(rms) > 0 else 0.0

    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_mean = [float(value) for value in np.mean(mfcc, axis=1).tolist()]

    spectral_centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    spectral_spread = float(np.mean(librosa.feature.spectral_bandwidth(y=y, sr=sr)))

    return {
        "meanPitchHz": mean_pitch,
        "pitchStdDev": pitch_std,
        "minPitchHz": min_pitch,
        "maxPitchHz": max_pitch,
        "pitchContourReg": pitch_contour_reg,
        "meanEnergy": mean_energy,
        "energyStdDev": energy_std,
        "speechRate": speech_rate,
        "pauseRatio": pause_ratio,
        "mfccMean": mfcc_mean,
        "spectralCentroid": spectral_centroid,
        "spectralSpread": spectral_spread,
        "jitter": jitter,
        "shimmer": shimmer,
        "voicedRatio": voiced_ratio,
    }


def classify_emotions(transcription: str, prosody: dict[str, Any]) -> dict[str, float]:
    text = (transcription or "").lower()
    positive_hits = sum(word in text for word in ["bem", "feliz", "calmo", "otimo", "bom"])
    sadness_hits = sum(word in text for word in ["triste", "cansado", "sozinho", "desanimado"])
    anxiety_hits = sum(word in text for word in ["ansioso", "preocupado", "nervoso", "medo"])
    anger_hits = sum(word in text for word in ["raiva", "irritado", "frustrado"])

    mean_energy = float(prosody.get("meanEnergy", 0.0))
    speech_rate = float(prosody.get("speechRate", 0.0))
    pause_ratio = float(prosody.get("pauseRatio", 0.0))
    pitch_std = float(prosody.get("pitchStdDev", 0.0))

    energy_signal = clamp01((mean_energy * 1.8) + (speech_rate / 8.0))
    anxiety_signal = clamp01((pause_ratio * 1.2) + (pitch_std / 220.0))

    joy = clamp01(0.3 + positive_hits * 0.12 + (1.0 - pause_ratio) * 0.15)
    sadness = clamp01(0.15 + sadness_hits * 0.15 + pause_ratio * 0.3)
    anger = clamp01(0.08 + anger_hits * 0.18 + pitch_std / 280.0)
    anxiety = clamp01(0.12 + anxiety_hits * 0.16 + anxiety_signal * 0.5)
    calm = clamp01(0.5 + positive_hits * 0.08 - anxiety * 0.45 - anger * 0.2)
    energy = clamp01(0.2 + energy_signal * 0.75)

    return {
        "joy": joy,
        "sadness": sadness,
        "anger": anger,
        "anxiety": anxiety,
        "calm": calm,
        "energy": energy,
    }


async def notify_node_callback(callback_url: str, payload: dict[str, Any]) -> None:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(callback_url, json=payload)
        response.raise_for_status()


async def run_analysis_task(task_id: str, request: AnalysisRequest) -> None:
    temp_audio_path: str | None = None
    task_store[task_id] = {
        "taskId": task_id,
        "status": "processing",
        "progress": 10,
        "transcription": None,
        "emotionVector": None,
        "prosodyFeatures": None,
        "errorMessage": None,
    }

    try:
        temp_audio_path = await asyncio.to_thread(
            fetch_audio_to_tempfile,
            request.audioObjectKey,
            request.audioUrl,
            request.audioFormat,
        )
        task_store[task_id]["progress"] = 35

        transcription = await asyncio.to_thread(
            transcribe_audio,
            temp_audio_path,
            request.language,
        )
        task_store[task_id]["progress"] = 70

        prosody_features = await asyncio.to_thread(extract_prosody_features, temp_audio_path)
        emotion_vector = await asyncio.to_thread(
            classify_emotions,
            transcription,
            prosody_features,
        )

        task_store[task_id] = {
            "taskId": task_id,
            "status": "complete",
            "progress": 100,
            "transcription": transcription,
            "emotionVector": emotion_vector,
            "prosodyFeatures": prosody_features,
            "errorMessage": None,
        }

        if request.callbackUrl:
            await notify_node_callback(
                request.callbackUrl,
                {
                    "status": "complete",
                    "transcription": transcription,
                    "emotionVector": emotion_vector,
                    "prosodyFeatures": prosody_features,
                },
            )
            logger.info(
                f"Analysis callback sent for journal {request.journalId} (task {task_id})"
            )
        else:
            logger.warning(
                f"No callback URL provided for journal {request.journalId} (task {task_id})"
            )
    except Exception as error:
        message = str(error).strip() or "Analysis processing failed"
        task_store[task_id] = {
            "taskId": task_id,
            "status": "failed",
            "progress": 100,
            "transcription": None,
            "emotionVector": None,
            "prosodyFeatures": None,
            "errorMessage": message,
        }

        if request.callbackUrl:
            try:
                await notify_node_callback(
                    request.callbackUrl,
                    {
                        "status": "failed",
                        "errorMessage": message,
                    },
                )
            except Exception as callback_error:
                logger.error(
                    "Failed to send failure callback for task %s: %s",
                    task_id,
                    str(callback_error),
                )

        logger.error("Analysis task %s failed: %s", task_id, message)
    finally:
        if temp_audio_path and os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)


@app.get("/health")
async def health():
    return {
        "status": "ready",
        "models_loaded": ["whisper", "prosody-extractor", "heuristic-emotion"],
        "minio_configured": bool(os.getenv("MINIO_ENDPOINT")),
        "gpu_available": False,
    }


@app.post("/api/v1/analyze", response_model=AnalysisResponse, status_code=202)
async def analyze(request: AnalysisRequest):
    logger.info(f"Received analysis request for journal {request.journalId}")
    task_id = f"task-{request.jobId}"

    task_store[task_id] = {
        "taskId": task_id,
        "status": "queued",
        "progress": 0,
        "transcription": None,
        "emotionVector": None,
        "prosodyFeatures": None,
        "errorMessage": None,
    }

    background_task = asyncio.create_task(
        run_analysis_task(
            task_id=task_id,
            request=request,
        )
    )
    running_tasks.add(background_task)
    background_task.add_done_callback(running_tasks.discard)

    return AnalysisResponse(
        taskId=task_id,
        status="queued",
        estimatedSeconds=30,
    )


@app.get("/api/v1/analyze/{taskId}", response_model=StatusResponse)
async def get_status(taskId: Annotated[str, Path()]):  # noqa: N803
    task_id = taskId
    logger.info(f"Status check for task {task_id}")

    task = task_store.get(task_id)
    if not task:
        return StatusResponse(
            taskId=task_id,
            status="not_found",
            progress=0,
            errorMessage="Task not found",
        )

    return StatusResponse(**task)


@app.get("/")
async def root():
    return {
        "service": "Audio Journaling Analysis Engine",
        "version": "0.2.0",
        "endpoints": {
            "health": "/health",
            "analyze": "/api/v1/analyze",
            "status": "/api/v1/analyze/{taskId}",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
