import os
import threading
import unicodedata
from importlib import import_module
from collections import Counter

from app.services.logging_config import logger

_TEXT_LABELS = ["joy", "sadness", "anger", "fear", "disgust", "surprise"]

_LEXICON = {
    "joy": {
        "feliz",
        "alegre",
        "contente",
        "grato",
        "gratidao",
        "otimo",
        "bom",
        "leve",
        "animado",
        "satisfeito",
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
        "abatido",
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
        "zangado",
    },
    "fear": {
        "medo",
        "ansioso",
        "ansiedade",
        "preocupado",
        "panico",
        "inseguro",
        "receio",
        "tenso",
        "assustado",
    },
    "disgust": {
        "nojo",
        "aversao",
        "repulsa",
        "asco",
        "enojado",
        "rejeicao",
        "detesto",
        "desgosto",
    },
    "surprise": {
        "surpresa",
        "surpreso",
        "inesperado",
        "espanto",
        "chocado",
        "uau",
        "imprevisivel",
        "admirado",
    },
}

_ZERO_SHOT_PIPELINE = None
_ZERO_SHOT_LOCK = threading.Lock()
_ZERO_SHOT_FAILED = False


def _clamp01(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


def _tokenize(text: str) -> list[str]:
    normalized = unicodedata.normalize("NFD", text)
    without_marks = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    sanitized = "".join(ch.lower() if ch.isalnum() else " " for ch in without_marks)
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


def _load_zero_shot_tokenizer(transformers, model_id: str):
    auto_tokenizer = getattr(transformers, "AutoTokenizer")

    if "xlm-roberta" in model_id.lower():
        xlm_roberta_fast_tokenizer = getattr(transformers, "XLMRobertaTokenizerFast")
        try:
            return xlm_roberta_fast_tokenizer.from_pretrained(model_id)
        except Exception as error:
            logger.warning(
                "XLMRobertaTokenizerFast failed for %s, retrying with AutoTokenizer: %s",
                model_id,
                str(error),
            )

    try:
        return auto_tokenizer.from_pretrained(model_id, use_fast=False)
    except Exception as error:
        if "xlm-roberta" not in model_id.lower():
            raise error

        xlm_roberta_tokenizer = getattr(transformers, "XLMRobertaTokenizer")
        logger.warning(
            "AutoTokenizer failed for %s, retrying with XLMRobertaTokenizer: %s",
            model_id,
            str(error),
        )
        return xlm_roberta_tokenizer.from_pretrained(model_id)


def _load_zero_shot_pipeline():
    global _ZERO_SHOT_PIPELINE, _ZERO_SHOT_FAILED

    if _ZERO_SHOT_PIPELINE is not None or _ZERO_SHOT_FAILED:
        return _ZERO_SHOT_PIPELINE

    with _ZERO_SHOT_LOCK:
        if _ZERO_SHOT_PIPELINE is not None or _ZERO_SHOT_FAILED:
            return _ZERO_SHOT_PIPELINE

        try:
            transformers = import_module("transformers")
            pipeline = getattr(transformers, "pipeline")
            auto_model = getattr(transformers, "AutoModelForSequenceClassification")

            model_id = os.getenv(
                "TEXT_EMOTION_MODEL_ID",
                "joeddav/xlm-roberta-large-xnli",
            )
            tokenizer = _load_zero_shot_tokenizer(transformers, model_id)
            model = auto_model.from_pretrained(model_id)
            _ZERO_SHOT_PIPELINE = pipeline(
                "zero-shot-classification",
                model=model,
                tokenizer=tokenizer,
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

    labels = ["joy", "sadness", "anger", "fear", "disgust", "surprise"]

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
        return {label: 0.0 for label in _TEXT_LABELS}

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
