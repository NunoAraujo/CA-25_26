import os
import threading
from typing import Any

import librosa
import numpy as np

from app.services.logging_config import logger

_AUDIO_EMOTION_PIPELINE = None
_AUDIO_EMOTION_LOCK = threading.Lock()
_AUDIO_EMOTION_FAILED = False


def _clamp01(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


def _load_audio_emotion_pipeline():
    global _AUDIO_EMOTION_PIPELINE, _AUDIO_EMOTION_FAILED

    if _AUDIO_EMOTION_PIPELINE is not None or _AUDIO_EMOTION_FAILED:
        return _AUDIO_EMOTION_PIPELINE

    with _AUDIO_EMOTION_LOCK:
        if _AUDIO_EMOTION_PIPELINE is not None or _AUDIO_EMOTION_FAILED:
            return _AUDIO_EMOTION_PIPELINE

        try:
            from transformers import pipeline

            model_id = os.getenv(
                "AUDIO_EMOTION_MODEL_ID",
                "ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition",
            )
            _AUDIO_EMOTION_PIPELINE = pipeline(
                task="audio-classification",
                model=model_id,
                top_k=8,
                device=-1,
            )
            logger.info("Loaded audio emotion model: %s", model_id)
        except Exception as error:
            _AUDIO_EMOTION_FAILED = True
            logger.warning(
                "Failed to initialize audio emotion model, fallback enabled: %s",
                str(error),
            )

    return _AUDIO_EMOTION_PIPELINE


def _map_audio_label(label: str) -> str | None:
    normalized = label.strip().lower()

    if any(key in normalized for key in ["happy", "joy", "positive", "excited"]):
        return "joy"
    if any(key in normalized for key in ["sad", "sadness"]):
        return "sadness"
    if any(key in normalized for key in ["angry", "anger", "frustrat"]):
        return "anger"
    if any(key in normalized for key in ["fear", "anx", "nerv", "stress"]):
        return "anxiety"
    if any(key in normalized for key in ["calm", "neutral", "relax"]):
        return "calm"

    return None


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
        if pitch_diffs.size:
            pitch_contour_reg = float(1.0 / (1.0 + np.std(pitch_diffs)))
        else:
            pitch_contour_reg = 1.0

        periods = 1.0 / np.clip(voiced_f0, a_min=1e-6, a_max=None)
        if periods.size > 1:
            jitter = float(np.mean(np.abs(np.diff(periods))) / np.mean(periods))
        else:
            jitter = 0.0
        voiced_ratio = float(voiced_f0.size / max(1, len(f0)))
    else:
        mean_pitch = 0.0
        pitch_std = 0.0
        min_pitch = 0.0
        max_pitch = 0.0
        pitch_contour_reg = 0.0
        jitter = 0.0
        voiced_ratio = 0.0

    if rms.size > 1 and np.mean(rms) > 0:
        shimmer = float(np.mean(np.abs(np.diff(rms))) / np.mean(rms))
    else:
        shimmer = 0.0

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
    prosody_features: dict[str, Any],
) -> dict[str, float]:
    model = _load_audio_emotion_pipeline()
    scores = {
        "joy": 0.0,
        "sadness": 0.0,
        "anger": 0.0,
        "anxiety": 0.0,
        "calm": 0.0,
        "energy": 0.0,
    }

    if model is not None:
        try:
            predictions = model(audio_path)
            for prediction in predictions:
                label = _map_audio_label(str(prediction.get("label", "")))
                if not label:
                    continue
                score = _clamp01(float(prediction.get("score", 0.0)))
                scores[label] = max(scores[label], score)
        except Exception as error:
            logger.warning("Audio emotion inference failed, using fallback: %s", str(error))

    mean_energy = float(prosody_features.get("meanEnergy", 0.0))
    speech_rate = float(prosody_features.get("speechRate", 0.0))
    pause_ratio = float(prosody_features.get("pauseRatio", 0.0))
    pitch_std = float(prosody_features.get("pitchStdDev", 0.0))

    fallback_energy = _clamp01((mean_energy * 1.8) + (speech_rate / 8.0))
    fallback_anxiety = _clamp01((pause_ratio * 1.15) + (pitch_std / 250.0))
    fallback_sadness = _clamp01(0.15 + pause_ratio * 0.45)
    fallback_anger = _clamp01(0.1 + pitch_std / 300.0)
    fallback_joy = _clamp01(0.2 + (1.0 - pause_ratio) * 0.25)

    scores["joy"] = max(scores["joy"], fallback_joy * 0.5)
    scores["sadness"] = max(scores["sadness"], fallback_sadness * 0.6)
    scores["anger"] = max(scores["anger"], fallback_anger * 0.6)
    scores["anxiety"] = max(scores["anxiety"], fallback_anxiety * 0.65)
    scores["calm"] = _clamp01(max(scores["calm"], 0.55 - scores["anxiety"] * 0.4))
    scores["energy"] = _clamp01(max(scores["energy"], fallback_energy * 0.8))

    return {key: _clamp01(value) for key, value in scores.items()}
