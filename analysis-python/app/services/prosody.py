"""
Prosody emotion classification using WavLM embeddings + trained SVC artifact.

Pipeline (mirrors late_fusion_echomind_LOCAL_v2_disambiguated.ipynb):
  audio → safe_load_audio → trim_silence → chunked WavLM embeddings
        → mean+std per chunk → average → SVC (joblib artifact) → distribution

The artifact (prosody_final_artifact_v5_SSL_WAVLM_RBF_RECOVERED.joblib) was
trained by the project author and is the same model used in the benchmark.
"""
import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import librosa
import numpy as np

from app.services.logging_config import logger

# ---------------------------------------------------------------------------
# Constants (match the notebook)
# ---------------------------------------------------------------------------

CANONICAL_EMOTIONS: List[str] = ["joy", "sadness", "surprise", "anger", "disgust", "fear", "neutral"]

SSL_MAX_SECONDS_PER_CHUNK = 12.0
SSL_CHUNK_OVERLAP_SECONDS = 1.0

# ---------------------------------------------------------------------------
# Artifact & model caches (loaded once, thread-safe)
# ---------------------------------------------------------------------------

_ARTIFACT: Optional[Dict] = None
_ARTIFACT_FAILED: bool = False
_ARTIFACT_LOCK = threading.Lock()

_SSL_CACHE: Dict = {}
_SSL_LOCK = threading.Lock()


def _normalize_distribution(dist: Dict[str, float]) -> Dict[str, float]:
    out = {e: max(0.0, float(dist.get(e, 0.0))) for e in CANONICAL_EMOTIONS}
    total = sum(out.values())
    if total <= 0:
        return {e: (1.0 if e == "neutral" else 0.0) for e in CANONICAL_EMOTIONS}
    return {e: out[e] / total for e in CANONICAL_EMOTIONS}


# ---------------------------------------------------------------------------
# Artifact loading
# ---------------------------------------------------------------------------

def _get_artifact() -> Optional[Dict]:
    global _ARTIFACT, _ARTIFACT_FAILED

    if _ARTIFACT is not None or _ARTIFACT_FAILED:
        return _ARTIFACT

    with _ARTIFACT_LOCK:
        if _ARTIFACT is not None or _ARTIFACT_FAILED:
            return _ARTIFACT

        artifact_path = Path(
            os.getenv(
                "PROSODY_ARTIFACT_PATH",
                "/app/prosody_artifact/prosody_final_artifact_v5_SSL_WAVLM_RBF_RECOVERED.joblib",
            )
        )

        if not artifact_path.exists():
            logger.warning(
                "Prosody artifact not found at %s — audio emotion will return zeros.",
                artifact_path,
            )
            _ARTIFACT_FAILED = True
            return None

        try:
            _ARTIFACT = joblib.load(artifact_path)
            logger.info(
                "Prosody artifact loaded: model=%s  feature_set=%s  emotions=%s",
                _ARTIFACT.get("model_name") or _ARTIFACT.get("final_model_name"),
                _ARTIFACT.get("feature_set") or _ARTIFACT.get("selected_strategy"),
                _ARTIFACT.get("emotions"),
            )
        except Exception as exc:
            logger.warning("Failed to load prosody artifact: %s", exc)
            _ARTIFACT_FAILED = True

    return _ARTIFACT


# ---------------------------------------------------------------------------
# WavLM embedding extraction (mirrors notebook Cell 12)
# ---------------------------------------------------------------------------

def _safe_load_audio(path: str, sr: int = 16000):
    y, sr_out = librosa.load(path, sr=sr, mono=True)
    y = np.asarray(y, dtype=np.float32)
    y = np.nan_to_num(y, nan=0.0, posinf=0.0, neginf=0.0)
    if len(y) == 0:
        raise ValueError(f"Loaded audio is empty: {path}")
    return y, sr_out


def _trim_silence(y: np.ndarray, top_db: int = 30) -> np.ndarray:
    try:
        yt, _ = librosa.effects.trim(y, top_db=top_db)
        return yt.astype(np.float32) if len(yt) else y.astype(np.float32)
    except Exception:
        return y.astype(np.float32)


def _iter_chunks(y: np.ndarray, sr: int):
    max_len = int(SSL_MAX_SECONDS_PER_CHUNK * sr)
    overlap = int(SSL_CHUNK_OVERLAP_SECONDS * sr)

    if len(y) <= max_len:
        yield y
        return

    step = max(1, max_len - overlap)
    start = 0
    while start < len(y):
        end = min(len(y), start + max_len)
        chunk = y[start:end]
        if len(chunk) > int(0.25 * sr):
            yield chunk
        if end >= len(y):
            break
        start += step


def _load_ssl_model(model_name: str = "microsoft/wavlm-base"):
    with _SSL_LOCK:
        if model_name in _SSL_CACHE:
            return _SSL_CACHE[model_name]

        import torch
        from transformers import AutoFeatureExtractor, AutoModel

        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info("Loading WavLM model %s on %s", model_name, device)

        feature_extractor = AutoFeatureExtractor.from_pretrained(model_name)
        model = AutoModel.from_pretrained(model_name).to(device)
        model.eval()

        _SSL_CACHE[model_name] = (feature_extractor, model, device)
        return _SSL_CACHE[model_name]


def _extract_ssl_embedding(
    audio_path: str,
    model_name: str = "microsoft/wavlm-base",
    target_sr: int = 16000,
) -> np.ndarray:
    import torch

    feature_extractor, model, device = _load_ssl_model(model_name)

    y, sr = _safe_load_audio(audio_path, sr=target_sr)
    y = _trim_silence(y)

    embs = []
    for chunk in _iter_chunks(y, sr):
        inputs = feature_extractor(chunk, sampling_rate=sr, return_tensors="pt", padding=True)
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            out = model(**inputs)
            h = out.last_hidden_state.squeeze(0)
            mean = h.mean(dim=0).detach().cpu().numpy()
            std = h.std(dim=0).detach().cpu().numpy()

        # wavlm-base: 768 mean + 768 std = 1536 dims
        embs.append(np.concatenate([mean, std]).astype(np.float32))

    if not embs:
        raise RuntimeError(f"Could not extract SSL embedding from {audio_path}")

    return np.vstack(embs).mean(axis=0).astype(np.float32)


# ---------------------------------------------------------------------------
# SVC classification using artifact (mirrors notebook Cell 12)
# ---------------------------------------------------------------------------

def _get_model_classes(model):
    if hasattr(model, "classes_"):
        return model.classes_
    if hasattr(model, "named_steps") and "clf" in model.named_steps:
        clf = model.named_steps["clf"]
        if hasattr(clf, "classes_"):
            return clf.classes_
    return None


def _classify_with_artifact(audio_path: str, artifact: Dict) -> Dict[str, float]:
    svc_model = artifact.get("model") or artifact.get("final_model")
    if svc_model is None:
        raise RuntimeError("Prosody artifact missing 'model'/'final_model'")

    ssl_model_name = artifact.get("ssl_model_name", "microsoft/wavlm-base")
    ssl_sample_rate = int(artifact.get("ssl_sample_rate", 16000))

    emb = _extract_ssl_embedding(
        audio_path,
        model_name=ssl_model_name,
        target_sr=ssl_sample_rate,
    ).reshape(1, -1)

    if not hasattr(svc_model, "predict_proba"):
        raise RuntimeError("Prosody SVC model does not support predict_proba")

    proba = svc_model.predict_proba(emb)[0]

    # Map class indices → emotion labels using artifact's idx_to_label
    idx_to_label: Dict[int, str] = {
        int(k): v for k, v in artifact.get("idx_to_label", {}).items()
    }
    artifact_emotions: List[str] = artifact.get("emotions", CANONICAL_EMOTIONS)
    classes = _get_model_classes(svc_model)

    dist: Dict[str, float] = {e: 0.0 for e in CANONICAL_EMOTIONS}

    if classes is not None:
        for cls, p in zip(classes, proba):
            cls_int = int(cls)
            emo = idx_to_label.get(cls_int)
            if emo is None and 0 <= cls_int < len(artifact_emotions):
                emo = artifact_emotions[cls_int]
            if emo in dist:
                dist[emo] += float(p)
    else:
        for i, p in enumerate(proba):
            if i < len(artifact_emotions):
                emo = artifact_emotions[i]
                if emo in dist:
                    dist[emo] += float(p)

    return _normalize_distribution(dist)


# ---------------------------------------------------------------------------
# Public API — called by analysis_tasks.py
# ---------------------------------------------------------------------------

def classify_audio_emotions(
    audio_path: str,
    prosody_features: dict[str, Any],  # kept for API compat, not used by WavLM path
) -> Dict[str, float]:
    """
    Classifies audio emotion using WavLM embeddings + trained SVC artifact.

    Falls back to zeros if the artifact is unavailable.
    The prosody_features arg is kept for backward API compatibility.
    """
    artifact = _get_artifact()

    if artifact is None:
        logger.warning("Prosody artifact not available — returning zero scores.")
        return {e: 0.0 for e in CANONICAL_EMOTIONS}

    try:
        return _classify_with_artifact(audio_path, artifact)
    except Exception as exc:
        logger.warning("Prosody WavLM classification failed: %s — returning zeros.", exc)
        return {e: 0.0 for e in CANONICAL_EMOTIONS}


def extract_prosody_features(audio_path: str) -> dict[str, Any]:
    """
    Kept for API compatibility. Returns minimal metadata.
    The actual feature extraction now happens inside classify_audio_emotions
    via WavLM embeddings fed to the SVC artifact.
    """
    try:
        y, sr = librosa.load(audio_path, sr=16000, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
    except Exception:
        duration = 0.0

    return {"duration": duration}
