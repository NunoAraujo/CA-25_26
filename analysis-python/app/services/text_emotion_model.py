"""
Text emotion analysis via Ollama (qwen2.5:3b-instruct).

Estratégia: Light_Ensemble — combina Advanced_V2 (70%) + Structured (30%)
com post-processing baseado em marcadores lexicais em PT-EU.

Resultado do benchmark (250 textos, incluindo 50 casos ambíguos em PT-EU):
  Accuracy:      76.4%
  F1-Macro:      76.5%
  Top-2 Accuracy: 97.6%
"""
import json
import os
import re
import time
import threading
from typing import Dict

import requests

from app.services.logging_config import logger

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------

_EMOTIONS = ["joy", "sadness", "surprise", "anger", "disgust", "fear", "neutral"]

_OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
_MODEL_NAME = os.getenv("OLLAMA_TEXT_MODEL", "qwen2.5:3b-instruct")
_STRATEGY = os.getenv("OLLAMA_TEXT_STRATEGY", "Light_Ensemble")
_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "120"))

# Lock para evitar pedidos simultâneos ao modelo na mesma instância
_REQUEST_LOCK = threading.Lock()

# ---------------------------------------------------------------------------
# Exemplos few-shot (PT-EU) — extraídos do benchmark do notebook
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
# Comunicação com Ollama
# ---------------------------------------------------------------------------

def _call_ollama(prompt: str, model: str = _MODEL_NAME) -> str:
    """Faz um pedido à API do Ollama e devolve o texto gerado."""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.1},
    }
    try:
        resp = requests.post(
            f"{_OLLAMA_HOST}/api/generate",
            json=payload,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json().get("response", "")
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
    """Extrai um dicionário de distribuição probabilística da resposta do LLM."""
    # Tenta encontrar JSON no texto (o modelo pode responder com texto extra)
    match = re.search(r"\{[^{}]+\}", raw, re.DOTALL)
    if not match:
        logger.warning("Não foi possível extrair JSON da resposta: %s", raw[:200])
        return {e: 1.0 / len(_EMOTIONS) for e in _EMOTIONS}

    try:
        raw_dict = json.loads(match.group())
    except json.JSONDecodeError:
        logger.warning("JSON inválido na resposta: %s", match.group()[:200])
        return {e: 1.0 / len(_EMOTIONS) for e in _EMOTIONS}

    dist = {}
    for emotion in _EMOTIONS:
        val = raw_dict.get(emotion, 0.0)
        try:
            dist[emotion] = float(max(0.0, min(1.0, val)))
        except (TypeError, ValueError):
            dist[emotion] = 0.0

    return _normalize(dist)


def _normalize(dist: Dict[str, float]) -> Dict[str, float]:
    """Normaliza os valores para somarem 1.0."""
    total = sum(dist.values())
    if total <= 0:
        return {e: 1.0 / len(_EMOTIONS) for e in _EMOTIONS}
    return {e: v / total for e, v in dist.items()}


# ---------------------------------------------------------------------------
# Estratégias de prompting
# ---------------------------------------------------------------------------

def _query_advanced_v2(text: str, model: str) -> Dict[str, float]:
    """
    Prompt principal com few-shot, critérios detalhados e distinções ambíguas.
    Vencedor no benchmark de 200 textos limpos (F1=78.8%).
    """
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
    """
    Prompt estruturado que força análise interna antes de responder.
    Usado como complemento no Light_Ensemble.
    """
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
    """
    Ajustes leves baseados em marcadores lexicais em PT-EU.
    Não substitui o modelo — apenas desempata casos ambíguos.
    """
    t = text.lower()

    boosts = {
        "surprise": ["surpresa", "inesperad", "não estava à espera", "nem acreditei", "choque"],
        "fear":     ["medo", "assust", "ameaç", "pânico", "ansios", "perigo", "tremia", "aperto no peito"],
        "anger":    ["furioso", "revolt", "irrit", "enganado", "injust", "raiva", "falta de respeito"],
        "disgust":  ["nojo", "nojento", "repulsa", "enoj", "nauseabundo", "vomit"],
    }
    amounts = {"surprise": 0.08, "fear": 0.08, "anger": 0.06, "disgust": 0.06}

    for emotion, markers in boosts.items():
        if any(m in t for m in markers):
            dist[emotion] = dist.get(emotion, 0.0) + amounts[emotion]

    return _normalize(dist)


# ---------------------------------------------------------------------------
# Light Ensemble — estratégia vencedora do benchmark
# ---------------------------------------------------------------------------

def _light_ensemble(text: str, model: str) -> Dict[str, float]:
    """
    Combina Advanced_V2 (70%) + Structured (30%) com post-processing.
    Melhor resultado nos casos ambíguos do benchmark (F1=76.5%, Acc=76.4%).
    """
    d1 = _query_advanced_v2(text, model)
    d2 = _query_structured(text, model)
    combined = {e: 0.70 * d1.get(e, 0.0) + 0.30 * d2.get(e, 0.0) for e in _EMOTIONS}
    return _normalize(_post_process(combined, text))


# ---------------------------------------------------------------------------
# Fallback — devolve zeros se o Ollama não estiver disponível
# ---------------------------------------------------------------------------

def _fallback_scores() -> Dict[str, float]:
    return {e: 0.0 for e in _EMOTIONS}


# ---------------------------------------------------------------------------
# Interface pública (mantém compatibilidade com o resto da API)
# ---------------------------------------------------------------------------

_STRATEGIES = {
    "Light_Ensemble": _light_ensemble,
    "Advanced_V2": _query_advanced_v2,
    "ZeroShot": lambda text, model: _query_advanced_v2(text, model),  # alias simples
}


def analyze_text_emotions(transcription: str | None) -> Dict[str, float]:
    """
    Analisa as emoções de um texto de transcrição.

    Devolve um dicionário {emoção: probabilidade} normalizado para as 7 emoções.
    Em caso de falha (Ollama indisponível, timeout, etc.) devolve zeros.

    Esta função é thread-safe e compatível com a assinatura original.
    """
    text = (transcription or "").strip()
    if not text:
        return _fallback_scores()

    strategy_name = _STRATEGY
    strategy_fn = _STRATEGIES.get(strategy_name, _light_ensemble)
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
