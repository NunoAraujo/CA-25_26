from typing import Any


def clamp01(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


def classify_emotions(transcription: str, prosody: dict[str, Any]) -> dict[str, float]:
    text = (transcription or "").lower()
    positive_hits = sum(
        word in text
        for word in ["bem", "feliz", "calmo", "otimo", "bom"]
    )
    sadness_hits = sum(
        word in text
        for word in ["triste", "cansado", "sozinho", "desanimado"]
    )
    anxiety_hits = sum(
        word in text
        for word in ["ansioso", "preocupado", "nervoso", "medo"]
    )
    anger_hits = sum(word in text for word in ["raiva", "irritado", "frustrado"])

    mean_energy = float(prosody.get("meanEnergy", 0.0))
    speech_rate = float(prosody.get("speechRate", 0.0))
    pause_ratio = float(prosody.get("pauseRatio", 0.0))
    pitch_std = float(prosody.get("pitchStdDev", 0.0))

    energy_signal = clamp01((mean_energy * 1.8) + (speech_rate / 8.0))
    anxiety_signal = clamp01((pause_ratio * 1.2) + (pitch_std / 220.0))

    joy = clamp01(0.3 + positive_hits * 0.12 + (1.0 - pause_ratio) * 0.15)
    sadness = clamp01(0.15 + sadness_hits * 0.15 + pause_ratio * 0.3)
    anger = clamp01(0.08 + anger_hits * 0.18 + pitch_std / 280.0)
    anxiety = clamp01(0.12 + anxiety_hits * 0.16 + anxiety_signal * 0.5)
    calm = clamp01(0.5 + positive_hits * 0.08 - anxiety * 0.45 - anger * 0.2)
    energy = clamp01(0.2 + energy_signal * 0.75)

    return {
        "joy": joy,
        "sadness": sadness,
        "anger": anger,
        "anxiety": anxiety,
        "calm": calm,
        "energy": energy,
    }
