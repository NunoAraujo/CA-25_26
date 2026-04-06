from typing import Any

import librosa
import numpy as np


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
