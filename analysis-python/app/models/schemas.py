from typing import Any

from pydantic import BaseModel


class AnalysisRequest(BaseModel):
    jobId: str
    journalId: str
    audioUrl: str
    audioObjectKey: str | None = None
    audioFormat: str = "wav"
    duration: float
    language: str = "pt-PT"
    transcriptionModelKey: str | None = None
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
    transcriptionModelKey: str | None = None
    transcriptionModelId: str | None = None
    emotionVector: dict | None = None
    semanticScores: dict | None = None
    prosodyScores: dict | None = None
    prosodyFeatures: dict | None = None
    finalEmotion: str | None = None
    finalConfidence: float | None = None
    topEmotions: list[dict[str, Any]] | None = None
    fusionWeights: dict | None = None
    fusionDetails: dict | None = None
    modelVersion: str | None = None
    errorMessage: str | None = None


TaskPayload = dict[str, Any]
