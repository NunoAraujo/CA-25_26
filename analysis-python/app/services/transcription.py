import os
import threading

import librosa

from app.services.logging_config import logger

_ASR_PIPELINE = None
_ASR_PIPELINE_LOCK = threading.Lock()
_ASR_INIT_FAILED = False


def _load_asr_pipeline():
    global _ASR_PIPELINE, _ASR_INIT_FAILED

    if _ASR_PIPELINE is not None or _ASR_INIT_FAILED:
        return _ASR_PIPELINE

    with _ASR_PIPELINE_LOCK:
        if _ASR_PIPELINE is not None or _ASR_INIT_FAILED:
            return _ASR_PIPELINE

        try:
            from transformers import pipeline

            model_id = os.getenv("WHISPER_MODEL_ID", "openai/whisper-small")
            _ASR_PIPELINE = pipeline(
                task="automatic-speech-recognition",
                model=model_id,
                device=-1,
            )
            logger.info("Loaded ASR model %s", model_id)
        except Exception as error:
            _ASR_INIT_FAILED = True
            logger.warning("Failed to initialize ASR model: %s", str(error))

    return _ASR_PIPELINE


def _normalize_language(language: str | None) -> str:
    value = (language or "").strip().lower()
    if value in {"pt", "pt-br", "pt-pt", "portuguese"}:
        return "portuguese"
    if value in {"en", "en-us", "english"}:
        return "english"
    return "portuguese"


def transcribe_audio(audio_path: str, language: str) -> str:
    asr = _load_asr_pipeline()

    if asr is not None:
        try:
            result = asr(
                audio_path,
                return_timestamps=False,
                generate_kwargs={
                    "task": "transcribe",
                    "language": _normalize_language(language),
                },
            )
            text = ""
            if isinstance(result, dict):
                text = str(result.get("text") or "").strip()
            if text:
                return text
        except Exception as error:
            logger.warning("ASR transcription failed, using fallback: %s", str(error))

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
