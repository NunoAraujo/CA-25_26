import librosa

from app.services.logging_config import logger


def transcribe_audio(audio_path: str, language: str) -> str:
    del language

    try:
        y, sr = librosa.load(audio_path, sr=16000, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
        if duration > 20:
            return "Registro com duracao longa e fala continua detectada."
        if duration > 5:
            return "Registro curto com fala moderada detectada."
        return "Registro breve detectado para analise emocional."
    except Exception as error:
        logger.warning("Lightweight transcription fallback failed: %s", str(error))

    return "Transcricao automatica indisponivel neste ambiente."
