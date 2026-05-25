from __future__ import annotations

import asyncio
import math
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

CANONICAL_EMOTIONS = ["joy", "sadness", "surprise", "anger", "disgust", "fear", "neutral"]
SEMANTIC_WEIGHT = float(os.getenv("SEMANTIC_WEIGHT", "0.70"))
PROSODY_WEIGHT = float(os.getenv("PROSODY_WEIGHT", "0.30"))
MODEL_VERSION = "0.5.0-late-fusion-wavlm-ollama-disambiguated"


def _normalize_distribution(scores: dict[str, float] | None) -> dict[str, float]:
    values = {
        emotion: max(0.0, float((scores or {}).get(emotion, 0.0)))
        for emotion in CANONICAL_EMOTIONS
    }
    total = sum(values.values())
    if total <= 0:
        return {emotion: 1.0 / len(CANONICAL_EMOTIONS) for emotion in CANONICAL_EMOTIONS}
    return {emotion: value / total for emotion, value in values.items()}


def _entropy_confidence(dist: dict[str, float]) -> float:
    values = [max(1e-12, float(dist.get(emotion, 0.0))) for emotion in CANONICAL_EMOTIONS]
    entropy = -sum(value * math.log(value) for value in values)
    max_entropy = math.log(len(CANONICAL_EMOTIONS))
    return max(0.0, min(1.0, 1.0 - entropy / max_entropy))


def _ranking(dist: dict[str, float]) -> list[dict[str, Any]]:
    return [
        {"emotion": emotion, "probability": round(float(probability), 4)}
        for emotion, probability in sorted(dist.items(), key=lambda item: item[1], reverse=True)
    ]


def _adaptive_weights(
    semantic_scores: dict[str, float],
    prosody_scores: dict[str, float],
) -> tuple[float, float, dict[str, float]]:
    semantic_conf = _entropy_confidence(semantic_scores)
    prosody_conf = _entropy_confidence(prosody_scores)

    # The text model is stronger in validation, so it starts with higher weight.
    # Confidence adjusts the weights slightly without letting prosody dominate.
    semantic_raw = SEMANTIC_WEIGHT * (0.5 + semantic_conf)
    prosody_raw = PROSODY_WEIGHT * (0.5 + prosody_conf)
    total = semantic_raw + prosody_raw

    if total <= 0:
        text_weight = SEMANTIC_WEIGHT
    else:
        text_weight = semantic_raw / total

    text_weight = max(0.60, min(0.85, text_weight))
    audio_weight = 1.0 - text_weight

    return text_weight, audio_weight, {
        "text": semantic_conf,
        "audio": prosody_conf,
    }


def _fuse_emotion_scores(
    semantic_scores: dict[str, float],
    prosody_scores: dict[str, float],
) -> dict[str, Any]:
    semantic = _normalize_distribution(semantic_scores)
    prosody = _normalize_distribution(prosody_scores)
    text_weight, audio_weight, modality_confidence = _adaptive_weights(semantic, prosody)

    fused = {
        emotion: (text_weight * semantic[emotion]) + (audio_weight * prosody[emotion])
        for emotion in CANONICAL_EMOTIONS
    }
    fused = _normalize_distribution(fused)

    ranking = _ranking(fused)
    final_emotion = ranking[0]["emotion"]
    final_confidence = float(fused[final_emotion])

    return {
        "emotionVector": fused,
        "finalEmotion": final_emotion,
        "finalConfidence": final_confidence,
        "topEmotions": ranking,
        "fusionWeights": {
            "text": text_weight,
            "audio": audio_weight,
        },
        "fusionDetails": {
            "strategy": "adaptive_weighted_late_fusion",
            "baseWeights": {
                "text": SEMANTIC_WEIGHT,
                "audio": PROSODY_WEIGHT,
            },
            "entropyConfidence": {
                "text": modality_confidence["text"],
                "audio": modality_confidence["audio"],
                "final": _entropy_confidence(fused),
            },
            "ranking": ranking,
        },
    }


def _empty_task(task_id: str, status: str, progress: int) -> dict[str, Any]:
    return {
        "taskId": task_id,
        "status": status,
        "progress": progress,
        "transcription": None,
        "transcriptionModelKey": None,
        "transcriptionModelId": None,
        "emotionVector": None,
        "semanticScores": None,
        "prosodyScores": None,
        "prosodyFeatures": None,
        "finalEmotion": None,
        "finalConfidence": None,
        "topEmotions": None,
        "fusionWeights": None,
        "fusionDetails": None,
        "modelVersion": None,
        "errorMessage": None,
    }


def queue_task(task_id: str) -> None:
    task_store[task_id] = _empty_task(task_id, "queued", 0)


def get_task_status(task_id: str) -> dict[str, Any] | None:
    return task_store.get(task_id)


async def run_analysis_task(task_id: str, request: AnalysisRequest) -> None:
    temp_audio_path: str | None = None
    task_store[task_id] = _empty_task(task_id, "processing", 10)

    try:
        temp_audio_path = await asyncio.to_thread(
            fetch_audio_to_tempfile,
            request.audioObjectKey,
            request.audioUrl,
            request.audioFormat,
        )
        task_store[task_id]["progress"] = 30

        transcription_result = await asyncio.to_thread(
            transcribe_audio,
            temp_audio_path,
            request.language,
            request.transcriptionModelKey,
        )
        task_store[task_id]["progress"] = 50

        semantic_scores = await asyncio.to_thread(
            analyze_text_emotions,
            transcription_result.text,
        )
        task_store[task_id]["progress"] = 68

        prosody_features = await asyncio.to_thread(extract_prosody_features, temp_audio_path)
        prosody_scores = await asyncio.to_thread(
            classify_audio_emotions,
            temp_audio_path,
            prosody_features,
        )
        task_store[task_id]["progress"] = 86

        fusion = _fuse_emotion_scores(semantic_scores, prosody_scores)
        model_version = f"{MODEL_VERSION}|asr={transcription_result.model_key}"

        complete_payload = {
            "taskId": task_id,
            "status": "complete",
            "progress": 100,
            "transcription": transcription_result.text,
            "transcriptionModelKey": transcription_result.model_key,
            "transcriptionModelId": transcription_result.model_id,
            "emotionVector": fusion["emotionVector"],
            "semanticScores": _normalize_distribution(semantic_scores),
            "prosodyScores": _normalize_distribution(prosody_scores),
            "prosodyFeatures": prosody_features,
            "finalEmotion": fusion["finalEmotion"],
            "finalConfidence": fusion["finalConfidence"],
            "topEmotions": fusion["topEmotions"],
            "fusionWeights": fusion["fusionWeights"],
            "fusionDetails": fusion["fusionDetails"],
            "modelVersion": model_version,
            "errorMessage": None,
        }
        task_store[task_id] = complete_payload

        if request.callbackUrl:
            await notify_node_callback(
                request.callbackUrl,
                {
                    "status": "complete",
                    "transcription": transcription_result.text,
                    "transcriptionModelKey": transcription_result.model_key,
                    "transcriptionModelId": transcription_result.model_id,
                    "emotionVector": fusion["emotionVector"],
                    "semanticScores": _normalize_distribution(semantic_scores),
                    "prosodyScores": _normalize_distribution(prosody_scores),
                    "prosodyFeatures": prosody_features,
                    "finalEmotion": fusion["finalEmotion"],
                    "finalConfidence": fusion["finalConfidence"],
                    "topEmotions": fusion["topEmotions"],
                    "fusionWeights": fusion["fusionWeights"],
                    "fusionDetails": fusion["fusionDetails"],
                    "semanticWeight": fusion["fusionWeights"]["text"],
                    "prosodyWeight": fusion["fusionWeights"]["audio"],
                    "modelVersion": model_version,
                },
            )
            logger.info(
                "Analysis callback sent for journal %s (task %s) using ASR %s; final=%s",
                request.journalId,
                task_id,
                transcription_result.model_key,
                fusion["finalEmotion"],
            )
        else:
            logger.warning(
                "No callback URL provided for journal %s (task %s)",
                request.journalId,
                task_id,
            )
    except Exception as error:
        message = str(error).strip() or "Analysis processing failed"
        failed_payload = _empty_task(task_id, "failed", 100)
        failed_payload["errorMessage"] = message
        task_store[task_id] = failed_payload

        if request.callbackUrl:
            try:
                await notify_node_callback(
                    request.callbackUrl,
                    {
                        "status": "failed",
                        "errorMessage": message,
                        "modelVersion": MODEL_VERSION,
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
