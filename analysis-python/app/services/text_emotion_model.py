"""
Text emotion analysis via Ollama (qwen2.5:3b-instruct).

Final strategy from the late-fusion notebook:
    Light_Ensemble_Disambiguated

It keeps the previous Light_Ensemble base:
    Advanced_V2 (70%) + Structured (30%) + lexical post-processing
and adds a conservative semantic disambiguation layer for the most common
negative-emotion confusions observed in the final tests:
    sadness vs anger
    sadness vs fear

The function exposed to the rest of the app is:
    analyze_text_emotions(transcription) -> normalized distribution over 7 emotions
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
import unicodedata
from typing import Dict

import requests

from app.services.logging_config import logger

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------

_EMOTIONS = ["joy", "sadness", "surprise", "anger", "disgust", "fear", "neutral"]

_OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
_MODEL_NAME = os.getenv("OLLAMA_TEXT_MODEL", "qwen2.5:3b-instruct")
_STRATEGY = os.getenv("OLLAMA_TEXT_STRATEGY", "Light_Ensemble_Disambiguated")
_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "120"))

_REQUEST_LOCK = threading.Lock()

# ---------------------------------------------------------------------------
# Exemplos few-shot PT-EU
# ---------------------------------------------------------------------------

_FEW_SHOT_EXAMPLES = [
    {
        "text": "Hoje recebi uma promoção no trabalho! Estava à espera há meses e finalmente aconteceu.",
        "dist": {"joy": 0.90, "sadness": 0.01, "surprise": 0.05, "anger": 0.01, "disgust": 0.01, "fear": 0.01, "neutral": 0.01},
    },
    {
        "text": "O meu avô faleceu esta manhã. Estava à espera, mas mesmo assim é muito difícil.",
        "dist": {"joy": 0.01, "sadness": 0.88, "surprise": 0.02, "anger": 0.01, "disgust": 0.01, "fear": 0.05, "neutral": 0.02},
    },
    {
        "text": "Cheguei a casa e havia uma festa surpresa para mim. Não estava mesmo nada à espera.",
        "dist": {"joy": 0.30, "sadness": 0.01, "surprise": 0.62, "anger": 0.01, "disgust": 0.01, "fear": 0.03, "neutral": 0.02},
    },
    {
        "text": "O vizinho voltou a estacionar em frente à garagem. Já é a terceira vez esta semana.",
        "dist": {"joy": 0.01, "sadness": 0.05, "surprise": 0.02, "anger": 0.82, "disgust": 0.06, "fear": 0.01, "neutral": 0.03},
    },
    {
        "text": "Vi algo no restaurante que me tirou completamente o apetite. Estava podre.",
        "dist": {"joy": 0.01, "sadness": 0.02, "surprise": 0.03, "anger": 0.08, "disgust": 0.82, "fear": 0.02, "neutral": 0.02},
    },
    {
        "text": "Ouvi um barulho estranho em casa à noite. Fiquei em pânico, não sabia o que era.",
        "dist": {"joy": 0.01, "sadness": 0.02, "surprise": 0.08, "anger": 0.01, "disgust": 0.01, "fear": 0.85, "neutral": 0.02},
    },
    {
        "text": "Trabalhei, fiz o jantar e fui dormir. Dia normal.",
        "dist": {"joy": 0.05, "sadness": 0.05, "surprise": 0.02, "anger": 0.01, "disgust": 0.01, "fear": 0.01, "neutral": 0.85},
    },
]


def _few_shot_block() -> str:
    lines = []
    for ex in _FEW_SHOT_EXAMPLES:
        lines.append(f'Texto: "{ex["text"]}"')
        lines.append(f"JSON: {json.dumps(ex['dist'], ensure_ascii=False)}")
        lines.append("")
    return "\n".join(lines).strip()


# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------


def _normalize(dist: Dict[str, float]) -> Dict[str, float]:
    clean = {emotion: max(0.0, float(dist.get(emotion, 0.0))) for emotion in _EMOTIONS}
    total = sum(clean.values())
    if total <= 0:
        return {e: 1.0 / len(_EMOTIONS) for e in _EMOTIONS}
    return {e: v / total for e, v in clean.items()}


def _strip_accents_lower(text: str) -> str:
    text = str(text).lower()
    return "".join(
        char for char in unicodedata.normalize("NFD", text)
        if unicodedata.category(char) != "Mn"
    )


# ---------------------------------------------------------------------------
# Comunicação com Ollama
# ---------------------------------------------------------------------------


def _call_ollama(prompt: str, model: str = _MODEL_NAME) -> str:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.1},
    }
    try:
        response = requests.post(
            f"{_OLLAMA_HOST}/api/generate",
            json=payload,
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
        return str(response.json().get("response", ""))
    except requests.exceptions.ConnectionError as exc:
        logger.error("Ollama não está acessível em %s: %s", _OLLAMA_HOST, exc)
        raise
    except requests.exceptions.Timeout:
        logger.error("Timeout a chamar Ollama (%ss) para modelo %s", _TIMEOUT, model)
        raise


# ---------------------------------------------------------------------------
# Parsing da resposta
# ---------------------------------------------------------------------------


def _parse_distribution(raw: str) -> Dict[str, float]:
    match = re.search(r"\{[^{}]+\}", raw, re.DOTALL)
    if not match:
        logger.warning("Não foi possível extrair JSON da resposta: %s", raw[:200])
        return {e: 1.0 / len(_EMOTIONS) for e in _EMOTIONS}

    try:
        raw_dict = json.loads(match.group())
    except json.JSONDecodeError:
        logger.warning("JSON inválido na resposta: %s", match.group()[:200])
        return {e: 1.0 / len(_EMOTIONS) for e in _EMOTIONS}

    dist: Dict[str, float] = {}
    for emotion in _EMOTIONS:
        try:
            dist[emotion] = float(max(0.0, min(1.0, raw_dict.get(emotion, 0.0))))
        except (TypeError, ValueError):
            dist[emotion] = 0.0

    return _normalize(dist)


# ---------------------------------------------------------------------------
# Estratégias de prompting
# ---------------------------------------------------------------------------


def _query_advanced_v2(text: str, model: str) -> Dict[str, float]:
    emotions_list = ", ".join(_EMOTIONS)
    prompt = f"""És um classificador de emoções para relatos diários em português europeu.

Objetivo: devolver uma distribuição probabilística pelas 7 classes:
{emotions_list}.

Critérios principais:
- joy: alegria, satisfação, entusiasmo, orgulho, alívio positivo.
- sadness: perda, vazio, desânimo, choro, sofrimento emocional.
- surprise: acontecimento inesperado, choque, espanto, reação de incredulidade.
- anger: injustiça, frustração, irritação, revolta, traição.
- disgust: nojo, repulsa, desprezo moral ou físico.
- fear: ameaça, ansiedade intensa, insegurança, perigo, pânico.
- neutral: rotina, relato factual, ausência de emoção dominante.

Distingue especialmente:
- fear vs surprise: fear envolve ameaça/ansiedade; surprise envolve inesperado/espanto.
- anger vs disgust: anger envolve revolta/frustração; disgust envolve repulsa/nojo.
- sadness vs anger: sadness envolve perda/desânimo; anger envolve injustiça, frustração ou revolta.
- sadness vs fear: sadness envolve sofrimento/perda; fear envolve ansiedade, ameaça, insegurança ou alerta.
- sadness vs neutral: sadness tem sofrimento/perda; neutral é factual/rotineiro.

Exemplos:
{_few_shot_block()}

Agora classifica o texto seguinte.
Responde apenas com JSON válido, sem explicações.

Texto:
{text}

JSON:""".strip()

    raw = _call_ollama(prompt, model)
    return _parse_distribution(raw)


def _query_structured(text: str, model: str) -> Dict[str, float]:
    emotions_list = ", ".join(_EMOTIONS)
    prompt = f"""Tarefa: classificação emocional de um relato diário transcrito.

Analisa internamente os seguintes aspetos, mas NÃO escrevas a análise:
1. Evento principal do relato.
2. Valência emocional: positiva, negativa ou neutra.
3. Presença de ameaça, perda, injustiça, repulsa ou surpresa.
4. Emoção dominante entre: {emotions_list}.

Formato obrigatório da resposta:
{{"joy": 0.0, "sadness": 0.0, "surprise": 0.0, "anger": 0.0, "disgust": 0.0, "fear": 0.0, "neutral": 0.0}}

Texto:
{text}

Resposta JSON:""".strip()

    raw = _call_ollama(prompt, model)
    return _parse_distribution(raw)


def _post_process(dist: Dict[str, float], text: str) -> Dict[str, float]:
    t = _strip_accents_lower(text)

    boosts = {
        "surprise": ["surpresa", "inesperad", "nao estava a espera", "nem acreditei", "choque", "espanto"],
        "fear": ["medo", "assust", "ameac", "panico", "ansios", "perigo", "tremia", "aperto no peito"],
        "anger": ["furioso", "revolt", "irrit", "enganado", "injust", "raiva", "falta de respeito", "frustr"],
        "disgust": ["nojo", "nojento", "repulsa", "enoj", "nauseabundo", "vomit", "rejeicao"],
    }
    amounts = {"surprise": 0.08, "fear": 0.08, "anger": 0.06, "disgust": 0.06}

    adjusted = dict(dist)
    for emotion, markers in boosts.items():
        if any(marker in t for marker in markers):
            adjusted[emotion] = adjusted.get(emotion, 0.0) + amounts[emotion]

    return _normalize(adjusted)


def _semantic_disambiguation(dist: Dict[str, float], text: str) -> Dict[str, float]:
    """Conservative sadness/anger/fear disambiguation from the final notebook.

    It only activates when sadness is the current top class, another negative
    emotion already has relevant probability, and strong lexical markers are
    present in the transcript.
    """
    d = _normalize(dist)
    t = _strip_accents_lower(text)

    anger_markers = [
        "irrit", "frustr", "revolt", "injust", "raiva",
        "falta de respeito", "nao foi respeitado", "tratado de forma injust",
    ]
    fear_markers = [
        "ansiedad", "ansios", "preocup", "insegur", "alerta", "perigo",
        "ameac", "panico", "correr mal", "corpo tenso", "tenso",
    ]

    top = max(d, key=d.get)

    if top == "sadness" and any(marker in t for marker in anger_markers) and d.get("anger", 0.0) >= 0.12:
        d["anger"] = max(d["anger"], d["sadness"] + 0.45)
        d["sadness"] *= 0.75

    if top == "sadness" and any(marker in t for marker in fear_markers) and d.get("fear", 0.0) >= 0.12:
        d["fear"] = max(d["fear"], d["sadness"] + 0.50)
        d["sadness"] *= 0.70

    return _normalize(d)


# ---------------------------------------------------------------------------
# Light Ensemble
# ---------------------------------------------------------------------------


def _light_ensemble(text: str, model: str) -> Dict[str, float]:
    d1 = _query_advanced_v2(text, model)
    d2 = _query_structured(text, model)
    combined = {e: 0.70 * d1.get(e, 0.0) + 0.30 * d2.get(e, 0.0) for e in _EMOTIONS}
    return _normalize(_post_process(combined, text))


def _light_ensemble_disambiguated(text: str, model: str) -> Dict[str, float]:
    return _semantic_disambiguation(_light_ensemble(text, model), text)


# ---------------------------------------------------------------------------
# Interface pública
# ---------------------------------------------------------------------------


def _fallback_scores() -> Dict[str, float]:
    # Zeros are intentional: the fusion layer will normalize and rely more on prosody.
    return {e: 0.0 for e in _EMOTIONS}


_STRATEGIES = {
    "Light_Ensemble_Disambiguated": _light_ensemble_disambiguated,
    "Light_Ensemble": _light_ensemble,
    "Advanced_V2": _query_advanced_v2,
    "ZeroShot": lambda text, model: _query_advanced_v2(text, model),
}


def analyze_text_emotions(transcription: str | None) -> Dict[str, float]:
    text = (transcription or "").strip()
    if not text:
        return _fallback_scores()

    strategy_name = _STRATEGY
    strategy_fn = _STRATEGIES.get(strategy_name, _light_ensemble_disambiguated)
    model = _MODEL_NAME

    try:
        with _REQUEST_LOCK:
            start = time.perf_counter()
            scores = strategy_fn(text, model)
            elapsed = time.perf_counter() - start
            logger.info(
                "Text emotion [%s/%s] em %.1fs — %s",
                model,
                strategy_name,
                elapsed,
                max(scores, key=scores.get),
            )
            return scores
    except Exception as exc:
        logger.warning(
            "Falha na análise de emoção de texto (%s/%s): %s",
            model,
            strategy_name,
            exc,
        )
        return _fallback_scores()


def get_text_model_info() -> dict[str, str]:
    return {
        "model": _MODEL_NAME,
        "strategy": _STRATEGY,
        "host": _OLLAMA_HOST,
        "emotions": ",".join(_EMOTIONS),
    }
