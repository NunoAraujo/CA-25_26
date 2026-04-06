import asyncio
import os
from typing import Any

from app.models.schemas import AnalysisRequest
from app.models.task_store import task_store
from app.services.callbacks import notify_node_callback
from app.services.emotions import classify_emotions
from app.services.logging_config import logger
from app.services.prosody import extract_prosody_features
from app.services.storage import fetch_audio_to_tempfile
from app.services.transcription import transcribe_audio


def queue_task(task_id: str) -> None:
    task_store[task_id] = {
        "taskId": task_id,
        "status": "queued",
        "progress": 0,
        "transcription": None,
        "emotionVector": None,
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
                "Analysis callback sent for journal %s (task %s)",
                request.journalId,
                task_id,
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
