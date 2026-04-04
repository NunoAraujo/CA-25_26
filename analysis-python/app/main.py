from fastapi import FastAPI, Path
import asyncio
from pydantic import BaseModel
from typing import Annotated, Any
import logging
import httpx
from pythonjsonlogger import jsonlogger

# Setup JSON logging
logger = logging.getLogger()
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter()
logHandler.setFormatter(formatter)
logger.addHandler(logHandler)
logger.setLevel(logging.INFO)

app = FastAPI(
    title="Audio Journaling Analysis Engine",
    description="Portuguese-first audio analysis service for emotion detection",
    version="0.1.0",
)

# Request/Response models
class AnalysisRequest(BaseModel):
    jobId: str
    journalId: str
    audioUrl: str
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
    errorMessage: str | None = None


task_store: dict[str, dict[str, Any]] = {}
running_tasks: set[asyncio.Task[Any]] = set()


def build_fake_analysis_result() -> dict[str, Any]:
    return {
        "transcription": "Hoje senti mais calma durante o dia e terminei com energia moderada.",
        "emotionVector": {
            "joy": 0.62,
            "sadness": 0.12,
            "anger": 0.07,
            "anxiety": 0.21,
            "calm": 0.74,
            "energy": 0.56,
        },
        "prosodyFeatures": {
            "meanPitchHz": 195.2,
            "pitchStdDev": 32.8,
            "minPitchHz": 121.4,
            "maxPitchHz": 289.7,
            "pitchContourReg": 0.68,
            "meanEnergy": 0.52,
            "energyStdDev": 0.15,
            "speechRate": 2.9,
            "pauseRatio": 0.24,
            "mfccMean": [0.12, -0.08, 0.04],
            "spectralCentroid": 1960.1,
            "spectralSpread": 1412.5,
            "jitter": 0.012,
            "shimmer": 0.03,
            "voicedRatio": 0.73,
        },
    }


async def notify_node_callback(callback_url: str, payload: dict[str, Any]) -> None:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(callback_url, json=payload)
        response.raise_for_status()


async def run_analysis_task(
    task_id: str,
    journal_id: str,
    callback_url: str | None,
    duration_seconds: float,
) -> None:
    task_store[task_id] = {
        "taskId": task_id,
        "status": "processing",
        "progress": 15,
        "transcription": None,
        "emotionVector": None,
        "errorMessage": None,
    }

    try:
        wait_seconds = max(1.0, min(5.0, duration_seconds / 10.0))
        await asyncio.sleep(wait_seconds)

        result = build_fake_analysis_result()

        task_store[task_id] = {
            "taskId": task_id,
            "status": "complete",
            "progress": 100,
            "transcription": result["transcription"],
            "emotionVector": result["emotionVector"],
            "errorMessage": None,
        }

        if callback_url:
            await notify_node_callback(
                callback_url,
                {
                    "status": "complete",
                    "transcription": result["transcription"],
                    "emotionVector": result["emotionVector"],
                    "prosodyFeatures": result["prosodyFeatures"],
                },
            )
            logger.info(
                f"Analysis callback sent for journal {journal_id} (task {task_id})"
            )
        else:
            logger.warning(
                f"No callback URL provided for journal {journal_id} (task {task_id})"
            )
    except Exception as error:
        message = str(error)
        task_store[task_id] = {
            "taskId": task_id,
            "status": "failed",
            "progress": 100,
            "transcription": None,
            "emotionVector": None,
            "errorMessage": message,
        }

        if callback_url:
            try:
                await notify_node_callback(
                    callback_url,
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

# Health check
@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ready",
        "models_loaded": ["whisper", "emotion_classifier"],
        "gpu_available": False,
    }

# Analysis endpoint (placeholder)
@app.post("/api/v1/analyze", response_model=AnalysisResponse, status_code=202)
async def analyze(request: AnalysisRequest):
    """Submit audio for analysis (transcription + prosody + emotion)."""
    logger.info(f"Received analysis request for journal {request.journalId}")
    task_id = f"task-{request.jobId}"

    task_store[task_id] = {
        "taskId": task_id,
        "status": "queued",
        "progress": 0,
        "transcription": None,
        "emotionVector": None,
        "errorMessage": None,
    }

    background_task = asyncio.create_task(
        run_analysis_task(
            task_id=task_id,
            journal_id=request.journalId,
            callback_url=request.callbackUrl,
            duration_seconds=request.duration,
        )
    )
    running_tasks.add(background_task)
    background_task.add_done_callback(running_tasks.discard)
    
    return AnalysisResponse(
        taskId=task_id,
        status="queued",
        estimatedSeconds=30,
    )

# Status endpoint (placeholder)
@app.get("/api/v1/analyze/{taskId}", response_model=StatusResponse)
async def get_status(taskId: Annotated[str, Path()]):  # noqa: N803
    """Get analysis status and results."""
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

# Root endpoint
@app.get("/")
async def root():
    return {
        "service": "Audio Journaling Analysis Engine",
        "version": "0.1.0",
        "endpoints": {
            "health": "/health",
            "analyze": "/api/v1/analyze",
            "status": "/api/v1/analyze/{taskId}",
        },
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
