import os
import threading
import time
from dataclasses import asdict, dataclass
from typing import Any

import librosa

from app.services.logging_config import logger


@dataclass(frozen=True)
class AsrModelConfig:
    key: str
    model_id: str
    provider: str
    label: str
    notes: str


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    model_key: str
    model_id: str
    provider: str
    latency_ms: float
    used_fallback: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_ASR_PIPELINES: dict[str, Any] = {}
_ASR_PIPELINE_LOCK = threading.Lock()
_ASR_INIT_FAILED: set[str] = set()

_ASR_MODEL_CATALOG: dict[str, AsrModelConfig] = {
    "whisper_tiny": AsrModelConfig(
        key="whisper_tiny",
        model_id="openai/whisper-tiny",
        provider="huggingface-transformers",
        label="Whisper Tiny",
        notes="Muito leve e rápido, mas normalmente menos preciso em português.",
    ),
    "whisper_base": AsrModelConfig(
        key="whisper_base",
        model_id="openai/whisper-base",
        provider="huggingface-transformers",
        label="Whisper Base",
        notes="Bom baseline inicial para comparar com small/medium.",
    ),
    "whisper_small": AsrModelConfig(
        key="whisper_small",
        model_id="openai/whisper-small",
        provider="huggingface-transformers",
        label="Whisper Small",
        notes="Equilíbrio habitual entre custo e qualidade para português.",
    ),
    "whisper_medium": AsrModelConfig(
        key="whisper_medium",
        model_id="openai/whisper-medium",
        provider="huggingface-transformers",
        label="Whisper Medium",
        notes="Mais pesado, mas normalmente melhora a qualidade face ao small.",
    ),
    "whisper_large_v3": AsrModelConfig(
        key="whisper_large_v3",
        model_id="openai/whisper-large-v3",
        provider="huggingface-transformers",
        label="Whisper Large v3",
        notes="Versão grande completa, mais pesada mas potencialmente mais precisa em português.",
    ),
    "whisper_large_v3_turbo": AsrModelConfig(
        key="whisper_large_v3_turbo",
        model_id="openai/whisper-large-v3-turbo",
        provider="huggingface-transformers",
        label="Whisper Large v3 Turbo",
        notes="Candidato forte para testes finais de qualidade em português.",
    ),
}


def list_available_asr_models() -> list[dict[str, str]]:
    return [asdict(config) for config in _ASR_MODEL_CATALOG.values()]


def _resolve_asr_model_config(model_key: str | None = None) -> AsrModelConfig:
    requested_key = (model_key or os.getenv("ASR_MODEL_KEY", "whisper_small")).strip()

    if requested_key in _ASR_MODEL_CATALOG:
        return _ASR_MODEL_CATALOG[requested_key]

    if requested_key == "custom":
        custom_model_id = os.getenv("WHISPER_MODEL_ID", "openai/whisper-small").strip()
        return AsrModelConfig(
            key="custom",
            model_id=custom_model_id,
            provider="huggingface-transformers",
            label="Custom Whisper",
            notes="Modelo personalizado definido via WHISPER_MODEL_ID.",
        )

    if "/" in requested_key:
        logger.warning(
            "ASR_MODEL_KEY recebeu um model id direto (%s). Vou tratá-lo como custom.",
            requested_key,
        )
        return AsrModelConfig(
            key="custom_direct",
            model_id=requested_key,
            provider="huggingface-transformers",
            label="Direct model id",
            notes="Modelo definido diretamente no ASR_MODEL_KEY.",
        )

    logger.warning(
        "ASR model key '%s' não é conhecido. Vou usar whisper_small.",
        requested_key,
    )
    return _ASR_MODEL_CATALOG["whisper_small"]


def get_selected_asr_model() -> dict[str, str]:
    return asdict(_resolve_asr_model_config())


def _load_asr_pipeline(model_key: str | None = None):
    config = _resolve_asr_model_config(model_key)

    if config.key in _ASR_PIPELINES:
        return _ASR_PIPELINES[config.key]

    if config.key in _ASR_INIT_FAILED:
        return None

    with _ASR_PIPELINE_LOCK:
        if config.key in _ASR_PIPELINES:
            return _ASR_PIPELINES[config.key]

        if config.key in _ASR_INIT_FAILED:
            return None

        try:
            from transformers import pipeline

            _ASR_PIPELINES[config.key] = pipeline(
                task="automatic-speech-recognition",
                model=config.model_id,
                device=-1,
            )
            logger.info("Loaded ASR model %s (%s)", config.key, config.model_id)
        except Exception as error:
            _ASR_INIT_FAILED.add(config.key)
            logger.warning(
                "Failed to initialize ASR model %s (%s): %s",
                config.key,
                config.model_id,
                str(error),
            )

    return _ASR_PIPELINES.get(config.key)


def _normalize_language(language: str | None) -> str:
    value = (language or "").strip().lower()
    if value in {"pt", "pt-br", "pt-pt", "portuguese"}:
        return "portuguese"
    if value in {"en", "en-us", "english"}:
        return "english"
    return "portuguese"


def _fallback_transcription(audio_path: str) -> str:
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


def transcribe_audio(
    audio_path: str,
    language: str,
    model_key: str | None = None,
) -> TranscriptionResult:
    config = _resolve_asr_model_config(model_key)
    started_at = time.perf_counter()
    asr = _load_asr_pipeline(config.key)

    if asr is not None:
        try:
            y, sr = librosa.load(audio_path, sr=16000, mono=True)
            duration = float(librosa.get_duration(y=y, sr=sr))
            return_timestamps = duration > 30

            result = asr(
                audio_path,
                return_timestamps=return_timestamps,
                generate_kwargs={
                    "task": "transcribe",
                    "language": _normalize_language(language),
                },
            )
            text = ""
            if isinstance(result, dict):
                text = str(result.get("text") or "").strip()

            if text:
                latency_ms = (time.perf_counter() - started_at) * 1000.0
                return TranscriptionResult(
                    text=text,
                    model_key=config.key,
                    model_id=config.model_id,
                    provider=config.provider,
                    latency_ms=latency_ms,
                    used_fallback=False,
                )
        except Exception as error:
            logger.warning(
                "ASR transcription failed for %s (%s), using fallback: %s",
                config.key,
                config.model_id,
                str(error),
            )

    fallback_text = _fallback_transcription(audio_path)
    latency_ms = (time.perf_counter() - started_at) * 1000.0
    return TranscriptionResult(
        text=fallback_text,
        model_key=config.key,
        model_id=config.model_id,
        provider=config.provider,
        latency_ms=latency_ms,
        used_fallback=True,
    )
