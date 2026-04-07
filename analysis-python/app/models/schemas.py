from typing import Any

from pydantic import BaseModel


class AnalysisRequest(BaseModel):
    jobId: str
    journalId: str
    audioUrl: str
    audioObjectKey: str | None = None
    audioFormat: str = "wav"
    duration: float
    language: str = "pt-BR"
    callbackUrl: str | None = None


class AnalysisResponse(BaseModel):
    taskId: str
    status: str
    estimatedSeconds: int = 30


class StatusResponse(BaseModel):
    taskId: str
    status: str
    progress: int = 0
    transcription: str | None = None
    emotionVector: dict | None = None
    semanticScores: dict | None = None
    prosodyScores: dict | None = None
    prosodyFeatures: dict | None = None
    errorMessage: str | None = None


TaskPayload = dict[str, Any]
