from __future__ import annotations

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
        model_id="tiny",
        provider="openai-whisper",
        label="Whisper Tiny",
        notes="Muito leve e rápido, mas normalmente menos preciso em português.",
    ),
    "whisper_base": AsrModelConfig(
        key="whisper_base",
        model_id="base",
        provider="openai-whisper",
        label="Whisper Base",
        notes="Baseline leve.",
    ),
    "whisper_small": AsrModelConfig(
        key="whisper_small",
        model_id="small",
        provider="openai-whisper",
        label="Whisper Small",
        notes="Equilíbrio habitual entre custo e qualidade.",
    ),
    "whisper_medium": AsrModelConfig(
        key="whisper_medium",
        model_id="medium",
        provider="openai-whisper",
        label="Whisper Medium",
        notes="Mais pesado, mas normalmente melhor que small.",
    ),
    "whisper_large_v3": AsrModelConfig(
        key="whisper_large_v3",
        model_id="large-v3",
        provider="openai-whisper",
        label="Whisper Large v3",
        notes="Versão grande completa.",
    ),
    "whisper_large_v3_turbo": AsrModelConfig(
        key="whisper_large_v3_turbo",
        model_id="turbo",
        provider="openai-whisper",
        label="Whisper Large v3 Turbo",
        notes="Modelo usado no notebook final de late fusion.",
    ),
    "hf_whisper_large_v3_turbo": AsrModelConfig(
        key="hf_whisper_large_v3_turbo",
        model_id="openai/whisper-large-v3-turbo",
        provider="huggingface-transformers",
        label="HF Whisper Large v3 Turbo",
        notes="Alternativa via transformers, se preferires HuggingFace.",
    ),
}


def list_available_asr_models() -> list[dict[str, str]]:
    return [asdict(config) for config in _ASR_MODEL_CATALOG.values()]


def _resolve_asr_model_config(model_key: str | None = None) -> AsrModelConfig:
    requested_key = (model_key or os.getenv("ASR_MODEL_KEY", "whisper_large_v3_turbo")).strip()

    if requested_key in _ASR_MODEL_CATALOG:
        return _ASR_MODEL_CATALOG[requested_key]

    if requested_key == "custom":
        custom_model_id = os.getenv("WHISPER_MODEL_ID", "turbo").strip()
        custom_provider = os.getenv("WHISPER_PROVIDER", "openai-whisper").strip()
        return AsrModelConfig(
            key="custom",
            model_id=custom_model_id,
            provider=custom_provider,
            label="Custom Whisper",
            notes="Modelo personalizado definido por WHISPER_MODEL_ID/WHISPER_PROVIDER.",
        )

    if "/" in requested_key:
        logger.warning(
            "ASR_MODEL_KEY recebeu um model id direto (%s). Vou tratá-lo como HuggingFace custom.",
            requested_key,
        )
        return AsrModelConfig(
            key="custom_direct",
            model_id=requested_key,
            provider="huggingface-transformers",
            label="Direct model id",
            notes="Modelo definido diretamente no ASR_MODEL_KEY.",
        )

    logger.warning("ASR model key '%s' não é conhecido. Vou usar whisper_large_v3_turbo.", requested_key)
    return _ASR_MODEL_CATALOG["whisper_large_v3_turbo"]


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
            if config.provider == "openai-whisper":
                import whisper

                _ASR_PIPELINES[config.key] = whisper.load_model(config.model_id)
                logger.info("Loaded OpenAI Whisper model %s (%s)", config.key, config.model_id)
            else:
                from transformers import pipeline

                _ASR_PIPELINES[config.key] = pipeline(
                    task="automatic-speech-recognition",
                    model=config.model_id,
                    device=-1,
                )
                logger.info("Loaded HF ASR model %s (%s)", config.key, config.model_id)
        except Exception as error:
            _ASR_INIT_FAILED.add(config.key)
            logger.warning(
                "Failed to initialize ASR model %s (%s/%s): %s",
                config.key,
                config.provider,
                config.model_id,
                str(error),
            )

    return _ASR_PIPELINES.get(config.key)


def _normalize_language_for_openai_whisper(language: str | None) -> str:
    value = (language or "").strip().lower()
    if value in {"pt", "pt-br", "pt-pt", "portuguese", "português", "portugues"}:
        return "pt"
    if value in {"en", "en-us", "english", "inglês", "ingles"}:
        return "en"
    return "pt"


def _normalize_language_for_hf(language: str | None) -> str:
    value = (language or "").strip().lower()
    if value in {"pt", "pt-br", "pt-pt", "portuguese", "português", "portugues"}:
        return "portuguese"
    if value in {"en", "en-us", "english", "inglês", "ingles"}:
        return "english"
    return "portuguese"


def _fallback_transcription(audio_path: str) -> str:
    try:
        y, sr = librosa.load(audio_path, sr=16000, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
        if duration > 20:
            return "Registo com duração longa e fala contínua detetada."
        if duration > 5:
            return "Registo curto com fala moderada detetada."
        return "Registo breve detetado para análise emocional."
    except Exception as error:
        logger.warning("Lightweight transcription fallback failed: %s", str(error))
        return "Transcrição automática indisponível neste ambiente."


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
            if config.provider == "openai-whisper":
                result = asr.transcribe(
                    audio_path,
                    task="transcribe",
                    language=_normalize_language_for_openai_whisper(language),
                    fp16=False,
                    verbose=False,
                )
                text = str(result.get("text") or "").strip() if isinstance(result, dict) else ""
            else:
                y, sr = librosa.load(audio_path, sr=16000, mono=True)
                duration = float(librosa.get_duration(y=y, sr=sr))
                return_timestamps = duration > 30

                result = asr(
                    audio_path,
                    return_timestamps=return_timestamps,
                    generate_kwargs={
                        "task": "transcribe",
                        "language": _normalize_language_for_hf(language),
                    },
                )
                text = str(result.get("text") or "").strip() if isinstance(result, dict) else ""

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
                "ASR transcription failed for %s (%s/%s), using fallback: %s",
                config.key,
                config.provider,
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
