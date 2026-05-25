"""
Prosody emotion analysis used by the final EchoMind late-fusion pipeline.

This module replaces the older generic HuggingFace audio-classification model with
exactly the artefact validated in the final notebook:

    audio -> WavLM base embeddings -> SVC RBF predict_proba -> 7 Ekman+neutral scores

The public functions keep the previous names so the rest of the FastAPI service can
continue to call:

    extract_prosody_features(audio_path)
    classify_audio_emotions(audio_path, prosody_features)

Required model artefact:
    prosody_final_artifact_v5_SSL_WAVLM_RBF_RECOVERED.joblib

Recommended environment variable:
    PROSODY_ARTIFACT_PATH=/absolute/path/to/prosody_final_artifact_v5_SSL_WAVLM_RBF_RECOVERED.joblib
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any

import joblib
import librosa
import numpy as np
import torch
from transformers import AutoFeatureExtractor, AutoModel

from app.services.logging_config import logger

CANONICAL_EMOTIONS = [
    "joy",
    "sadness",
    "surprise",
    "anger",
    "disgust",
    "fear",
    "neutral",
]

_DEFAULT_ARTIFACT_RELATIVE_PATH = (
    "app/models/prosody_outputs_v5/prosody_final_artifact_v5_SSL_WAVLM_RBF_RECOVERED.joblib"
)

_PROSODY_LOCK = threading.Lock()
_PROSODY_ARTIFACT: dict[str, Any] | None = None
_WAVLM_EXTRACTOR: AutoFeatureExtractor | None = None
_WAVLM_MODEL: AutoModel | None = None
_WAVLM_DEVICE: torch.device | None = None


def _clamp01(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


def _normalize_distribution(scores: dict[str, float]) -> dict[str, float]:
    clean = {emotion: max(0.0, float(scores.get(emotion, 0.0))) for emotion in CANONICAL_EMOTIONS}
    total = sum(clean.values())
    if total <= 0:
        return {emotion: 1.0 / len(CANONICAL_EMOTIONS) for emotion in CANONICAL_EMOTIONS}
    return {emotion: value / total for emotion, value in clean.items()}


def _resolve_artifact_path() -> Path:
    raw = os.getenv("PROSODY_ARTIFACT_PATH", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()

    candidates = [
        Path.cwd() / _DEFAULT_ARTIFACT_RELATIVE_PATH,
        Path.cwd() / "app" / "models" / "prosody_outputs_v5" / "prosody_final_artifact_v5_SSL_WAVLM_RBF_RECOVERED.joblib",
        Path.cwd() / "prosody_outputs_v5" / "prosody_final_artifact_v5_SSL_WAVLM_RBF_RECOVERED.joblib",
        Path.cwd().parent / _DEFAULT_ARTIFACT_RELATIVE_PATH,
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()

    # Return the recommended default even if it does not exist, so the error is explicit.
    return (Path.cwd() / _DEFAULT_ARTIFACT_RELATIVE_PATH).resolve()


def _load_prosody_artifact() -> dict[str, Any]:
    global _PROSODY_ARTIFACT

    if _PROSODY_ARTIFACT is not None:
        return _PROSODY_ARTIFACT

    with _PROSODY_LOCK:
        if _PROSODY_ARTIFACT is not None:
            return _PROSODY_ARTIFACT

        artifact_path = _resolve_artifact_path()
        if not artifact_path.exists():
            raise FileNotFoundError(
                "Prosody artefact not found. Set PROSODY_ARTIFACT_PATH to "
                "prosody_final_artifact_v5_SSL_WAVLM_RBF_RECOVERED.joblib. "
                f"Tried: {artifact_path}"
            )

        artifact = joblib.load(artifact_path)
        if "model" not in artifact:
            raise ValueError(f"Invalid prosody artefact: missing 'model' in {artifact_path}")

        emotions = artifact.get("emotions") or artifact.get("labels")
        if not emotions:
            raise ValueError(f"Invalid prosody artefact: missing emotions list in {artifact_path}")

        _PROSODY_ARTIFACT = artifact
        logger.info(
            "Loaded final prosody artefact from %s — feature_set=%s model=%s emotions=%s",
            artifact_path,
            artifact.get("feature_set"),
            artifact.get("model_name"),
            emotions,
        )
        return _PROSODY_ARTIFACT


def _load_wavlm() -> tuple[AutoFeatureExtractor, AutoModel, torch.device]:
    global _WAVLM_EXTRACTOR, _WAVLM_MODEL, _WAVLM_DEVICE

    artifact = _load_prosody_artifact()
    model_name = str(artifact.get("ssl_model_name") or os.getenv("PROSODY_SSL_MODEL", "microsoft/wavlm-base"))

    if _WAVLM_EXTRACTOR is not None and _WAVLM_MODEL is not None and _WAVLM_DEVICE is not None:
        return _WAVLM_EXTRACTOR, _WAVLM_MODEL, _WAVLM_DEVICE

    with _PROSODY_LOCK:
        if _WAVLM_EXTRACTOR is not None and _WAVLM_MODEL is not None and _WAVLM_DEVICE is not None:
            return _WAVLM_EXTRACTOR, _WAVLM_MODEL, _WAVLM_DEVICE

        device_name = os.getenv("PROSODY_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
        device = torch.device(device_name)

        extractor = AutoFeatureExtractor.from_pretrained(model_name)
        model = AutoModel.from_pretrained(model_name)
        model.to(device)
        model.eval()

        _WAVLM_EXTRACTOR = extractor
        _WAVLM_MODEL = model
        _WAVLM_DEVICE = device
        logger.info("Loaded WavLM model %s on %s", model_name, device)
        return extractor, model, device


def _load_waveform_for_model(audio_path: str) -> tuple[np.ndarray, int]:
    artifact = _load_prosody_artifact()
    sample_rate = int(artifact.get("ssl_sample_rate") or os.getenv("PROSODY_SAMPLE_RATE", "16000"))

    waveform, sr = librosa.load(audio_path, sr=sample_rate, mono=True)
    waveform = waveform.astype(np.float32)

    if waveform.size == 0:
        raise ValueError("Loaded audio is empty")

    # Same spirit as the notebook: remove leading/trailing silence, but preserve
    # the original waveform if trimming removes too much.
    try:
        trimmed, _ = librosa.effects.trim(waveform, top_db=30)
        if trimmed.size >= sample_rate * 0.5:
            waveform = trimmed.astype(np.float32)
    except Exception as error:
        logger.warning("Audio trim failed, using untrimmed audio: %s", error)

    return waveform, sample_rate


def _iter_chunks(waveform: np.ndarray, sample_rate: int) -> list[np.ndarray]:
    artifact = _load_prosody_artifact()
    max_seconds = float(artifact.get("ssl_max_seconds_per_chunk") or os.getenv("PROSODY_CHUNK_SECONDS", "12.0"))
    overlap_seconds = float(artifact.get("ssl_chunk_overlap_seconds") or os.getenv("PROSODY_CHUNK_OVERLAP_SECONDS", "1.0"))

    chunk_size = max(1, int(max_seconds * sample_rate))
    overlap = max(0, int(overlap_seconds * sample_rate))
    step = max(1, chunk_size - overlap)

    if len(waveform) <= chunk_size:
        return [waveform]

    chunks: list[np.ndarray] = []
    start = 0
    while start < len(waveform):
        chunk = waveform[start : start + chunk_size]
        if chunk.size >= sample_rate * 0.25:
            chunks.append(chunk)
        if start + chunk_size >= len(waveform):
            break
        start += step

    return chunks or [waveform]


def _extract_wavlm_embedding(audio_path: str) -> np.ndarray:
    extractor, model, device = _load_wavlm()
    waveform, sample_rate = _load_waveform_for_model(audio_path)
    chunks = _iter_chunks(waveform, sample_rate)

    chunk_embeddings: list[np.ndarray] = []

    for chunk in chunks:
        inputs = extractor(
            chunk,
            sampling_rate=sample_rate,
            return_tensors="pt",
            padding=True,
        )
        inputs = {key: value.to(device) for key, value in inputs.items()}

        with torch.no_grad():
            outputs = model(**inputs)
            hidden = outputs.last_hidden_state.squeeze(0)
            mean = hidden.mean(dim=0)
            std = hidden.std(dim=0)
            embedding = torch.cat([mean, std], dim=0).detach().cpu().numpy().astype(np.float32)
            chunk_embeddings.append(embedding)

    if not chunk_embeddings:
        raise ValueError("No WavLM embeddings extracted")

    return np.mean(np.stack(chunk_embeddings, axis=0), axis=0).astype(np.float32)


def extract_prosody_features(audio_path: str) -> dict[str, Any]:
    """Extract interpretable acoustic features for logging/explainability.

    These features are not the main classifier anymore; the final classifier uses
    WavLM embeddings + SVC. We keep this function because the frontend/backend
    already stores `prosodyFeatures` and it is useful for debugging.
    """
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


def classify_audio_emotions(
    audio_path: str,
    prosody_features: dict[str, Any] | None = None,
) -> dict[str, float]:
    """Classify emotion from voice using the final WavLM+SVC artefact.

    Returns a normalized distribution over:
    joy, sadness, surprise, anger, disgust, fear, neutral.
    """
    artifact = _load_prosody_artifact()
    model = artifact["model"]
    artifact_emotions = list(artifact.get("emotions") or CANONICAL_EMOTIONS)

    embedding = _extract_wavlm_embedding(audio_path).reshape(1, -1)

    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(embedding)[0]
    else:
        pred = int(model.predict(embedding)[0])
        probabilities = np.zeros(len(artifact_emotions), dtype=np.float32)
        probabilities[pred] = 1.0

    raw_scores: dict[str, float] = {emotion: 0.0 for emotion in CANONICAL_EMOTIONS}
    for idx, score in enumerate(probabilities):
        if idx >= len(artifact_emotions):
            continue
        emotion = str(artifact_emotions[idx])
        if emotion in raw_scores:
            raw_scores[emotion] = _clamp01(float(score))

    scores = _normalize_distribution(raw_scores)
    logger.info(
        "Prosody emotion [WavLM+SVC] — %s",
        max(scores, key=scores.get),
    )
    return scores


def get_prosody_model_info() -> dict[str, Any]:
    """Used by /health to report the currently configured prosody model."""
    artifact_path = _resolve_artifact_path()
    info: dict[str, Any] = {
        "artifactPath": str(artifact_path),
        "artifactExists": artifact_path.exists(),
        "type": "wavlm-base+svc-rbf",
        "emotions": CANONICAL_EMOTIONS,
    }
    if artifact_path.exists():
        try:
            artifact = _load_prosody_artifact()
            info.update(
                {
                    "featureSet": artifact.get("feature_set"),
                    "modelName": artifact.get("model_name"),
                    "sslModelName": artifact.get("ssl_model_name", "microsoft/wavlm-base"),
                    "sslEmbeddingDim": artifact.get("ssl_embedding_dim"),
                }
            )
        except Exception as error:
            info["loadError"] = str(error)
    return info
