import asyncio
import os
from typing import Any

from app.models.schemas import AnalysisRequest
from app.models.task_store import task_store
from app.services.callbacks import notify_node_callback
from app.services.logging_config import logger
from app.services.prosody import classify_audio_emotions, extract_prosody_features
from app.services.storage import fetch_audio_to_tempfile
from app.services.text_emotion_model import analyze_text_emotions
from app.services.transcription import transcribe_audio

SEMANTIC_WEIGHT = 0.7
PROSODY_WEIGHT = 0.3
MODEL_VERSION = "0.5.0-ekman-late-fusion-wavlm"

# All 7 canonical emotions (matches notebook CANONICAL_EMOTIONS)
_CANONICAL_EMOTIONS = ["joy", "sadness", "surprise", "anger", "disgust", "fear", "neutral"]


def _fuse_emotion_scores(
    semantic_scores: dict[str, float],
    prosody_scores: dict[str, float],
) -> dict[str, float]:
    """
    Fixed-weight late fusion: 0.7 × text + 0.3 × prosody.
    Matches the base weights from the notebook benchmark.
    """
    result: dict[str, float] = {}
    for label in _CANONICAL_EMOTIONS:
        semantic = float(semantic_scores.get(label, 0.0))
        prosody = float(prosody_scores.get(label, 0.0))
        result[label] = max(0.0, min(1.0, (semantic * SEMANTIC_WEIGHT) + (prosody * PROSODY_WEIGHT)))
    return result


def queue_task(task_id: str) -> None:
    task_store[task_id] = {
        "taskId": task_id,
        "status": "queued",
        "progress": 0,
        "transcription": None,
        "transcriptionModelKey": None,
        "transcriptionModelId": None,
        "emotionVector": None,
        "semanticScores": None,
        "prosodyScores": None,
        "prosodyFeatures": None,
        "errorMessage": None,
    }


def get_task_status(task_id: str) -> dict[str, Any] | None:
    return task_store.get(task_id)


async def run_analysis_task(task_id: str, request: AnalysisRequest) -> None:
    temp_audio_path: str | None = None
    task_store[task_id] = {
        "taskId": task_id,
        "status": "processing",
        "progress": 10,
        "transcription": None,
        "transcriptionModelKey": None,
        "transcriptionModelId": None,
        "emotionVector": None,
        "semanticScores": None,
        "prosodyScores": None,
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

        transcription_result = await asyncio.to_thread(
            transcribe_audio,
            temp_audio_path,
            request.language,
            request.transcriptionModelKey,
        )
        task_store[task_id]["progress"] = 55

        prosody_features = await asyncio.to_thread(extract_prosody_features, temp_audio_path)
        prosody_scores = await asyncio.to_thread(
            classify_audio_emotions,
            temp_audio_path,
            prosody_features,
        )
        semantic_scores = await asyncio.to_thread(
            analyze_text_emotions,
            transcription_result.text,
        )
        emotion_vector = _fuse_emotion_scores(semantic_scores, prosody_scores)
        model_version = f"{MODEL_VERSION}|asr={transcription_result.model_key}"

        task_store[task_id] = {
            "taskId": task_id,
            "status": "complete",
            "progress": 100,
            "transcription": transcription_result.text,
            "transcriptionModelKey": transcription_result.model_key,
            "transcriptionModelId": transcription_result.model_id,
            "emotionVector": emotion_vector,
            "semanticScores": semantic_scores,
            "prosodyScores": prosody_scores,
            "prosodyFeatures": prosody_features,
            "errorMessage": None,
        }

        if request.callbackUrl:
            await notify_node_callback(
                request.callbackUrl,
                {
                    "status": "complete",
                    "transcription": transcription_result.text,
                    "transcriptionModelKey": transcription_result.model_key,
                    "transcriptionModelId": transcription_result.model_id,
                    "emotionVector": emotion_vector,
                    "semanticScores": semantic_scores,
                    "prosodyScores": prosody_scores,
                    "prosodyFeatures": prosody_features,
                    "semanticWeight": SEMANTIC_WEIGHT,
                    "prosodyWeight": PROSODY_WEIGHT,
                    "modelVersion": model_version,
                },
            )
            logger.info(
                "Analysis callback sent for journal %s (task %s) using ASR %s",
                request.journalId,
                task_id,
                transcription_result.model_key,
            )
        else:
            logger.warning(
                "No callback URL provided for journal %s (task %s)",
                request.journalId,
                task_id,
            )
    except Exception as error:
        message = str(error).strip() or "Analysis processing failed"
        task_store[task_id] = {
            "taskId": task_id,
            "status": "failed",
            "progress": 100,
            "transcription": None,
            "transcriptionModelKey": None,
            "transcriptionModelId": None,
            "emotionVector": None,
            "semanticScores": None,
            "prosodyScores": None,
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
