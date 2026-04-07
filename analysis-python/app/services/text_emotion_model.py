import os
import threading
from importlib import import_module
from collections import Counter

from app.services.logging_config import logger

_TEXT_LABELS = ["joy", "sadness", "anger", "anxiety", "calm", "energy"]

_LEXICON = {
    "joy": {
        "feliz",
        "alegre",
        "contente",
        "grato",
        "gratid",
        "esperanca",
        "otimo",
        "bom",
        "leve",
        "animado",
    },
    "sadness": {
        "triste",
        "desanimado",
        "sozinho",
        "vazio",
        "cansado",
        "chorei",
        "desmotivado",
        "desesperanca",
        "saudade",
    },
    "anger": {
        "raiva",
        "irritado",
        "frustrado",
        "odio",
        "nervoso",
        "revoltado",
        "injusto",
        "furioso",
    },
    "anxiety": {
        "ansioso",
        "ansiedade",
        "preocupado",
        "medo",
        "aperto",
        "tenso",
        "panico",
        "inseguro",
        "acelerado",
    },
    "calm": {
        "calmo",
        "tranquilo",
        "sereno",
        "respirar",
        "paz",
        "equilibrio",
        "centrado",
        "presenca",
    },
    "energy": {
        "energia",
        "disposto",
        "forca",
        "vontade",
        "ativo",
        "foco",
        "produtivo",
        "acordado",
    },
}

_ZERO_SHOT_PIPELINE = None
_ZERO_SHOT_LOCK = threading.Lock()
_ZERO_SHOT_FAILED = False


def _clamp01(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


def _tokenize(text: str) -> list[str]:
    sanitized = "".join(ch.lower() if ch.isalnum() else " " for ch in text)
    return [token for token in sanitized.split() if token]


def _lexical_scores(text: str) -> dict[str, float]:
    tokens = _tokenize(text)
    if not tokens:
        return dict.fromkeys(_TEXT_LABELS, 0.0)

    counts = Counter(tokens)
    token_count = len(tokens)
    scores: dict[str, float] = {}

    for label in _TEXT_LABELS:
        hits = sum(counts[word] for word in _LEXICON[label] if word in counts)
        scores[label] = _clamp01((hits / max(1, token_count)) * 3.0)

    return scores


def _load_zero_shot_pipeline():
    global _ZERO_SHOT_PIPELINE, _ZERO_SHOT_FAILED

    if _ZERO_SHOT_PIPELINE is not None or _ZERO_SHOT_FAILED:
        return _ZERO_SHOT_PIPELINE

    with _ZERO_SHOT_LOCK:
        if _ZERO_SHOT_PIPELINE is not None or _ZERO_SHOT_FAILED:
            return _ZERO_SHOT_PIPELINE

        try:
            pipeline = getattr(import_module("transformers"), "pipeline")

            model_id = os.getenv(
                "TEXT_EMOTION_MODEL_ID",
                "joeddav/xlm-roberta-large-xnli",
            )
            _ZERO_SHOT_PIPELINE = pipeline(
                "zero-shot-classification",
                model=model_id,
                device=-1,
            )
            logger.info("Loaded zero-shot text emotion model: %s", model_id)
        except Exception as error:
            _ZERO_SHOT_FAILED = True
            logger.warning(
                "Failed to initialize zero-shot text model, lexical fallback only: %s",
                str(error),
            )

    return _ZERO_SHOT_PIPELINE


def _zero_shot_scores(text: str) -> dict[str, float]:
    classifier = _load_zero_shot_pipeline()
    if classifier is None:
        return dict.fromkeys(_TEXT_LABELS, 0.0)

    labels = ["joy", "sadness", "anger", "anxiety", "calm", "energy"]

    try:
        result = classifier(
            text,
            labels,
            multi_label=True,
            hypothesis_template="This text expresses {}.",
        )

        scores = dict.fromkeys(_TEXT_LABELS, 0.0)
        for label, score in zip(result.get("labels", []), result.get("scores", [])):
            key = str(label).strip().lower()
            if key in scores:
                scores[key] = _clamp01(float(score))

        return scores
    except Exception as error:
        logger.warning("Zero-shot text emotion inference failed: %s", str(error))
        return dict.fromkeys(_TEXT_LABELS, 0.0)


def analyze_text_emotions(transcription: str | None) -> dict[str, float]:
    text = (transcription or "").strip()
    if not text:
        return {
            "joy": 0.0,
            "sadness": 0.0,
            "anger": 0.0,
            "anxiety": 0.0,
            "calm": 0.35,
            "energy": 0.2,
        }

    lexical = _lexical_scores(text)
    zero_shot = _zero_shot_scores(text)

    has_zero_shot_signal = any(value > 0.0 for value in zero_shot.values())
    lexical_weight = 0.45 if has_zero_shot_signal else 1.0
    model_weight = 0.55 if has_zero_shot_signal else 0.0

    return {
        label: _clamp01(
            lexical_weight * lexical[label] + model_weight * zero_shot[label],
        )
        for label in _TEXT_LABELS
    }
