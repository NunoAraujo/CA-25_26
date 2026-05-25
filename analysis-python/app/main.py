import asyncio
import os
from typing import Annotated

import torch
from fastapi import FastAPI, Path

from app.models.schemas import AnalysisRequest, AnalysisResponse, StatusResponse
from app.models.task_store import running_tasks
from app.services.analysis_tasks import MODEL_VERSION, get_task_status, queue_task, run_analysis_task
from app.services.logging_config import logger
from app.services.prosody import get_prosody_model_info
from app.services.text_emotion_model import get_text_model_info
from app.services.transcription import get_selected_asr_model, list_available_asr_models

app = FastAPI(
    title="Audio Journaling Analysis Engine",
    description="Portuguese-first audio analysis service for multimodal emotion detection",
    version="0.5.0",
)


@app.get("/health")
async def health():
    selected_asr = get_selected_asr_model()
    text_model = get_text_model_info()
    prosody_model = get_prosody_model_info()
    return {
        "status": "ready",
        "version": "0.5.0",
        "modelVersion": MODEL_VERSION,
        "models_loaded": [
            f"asr:{selected_asr['key']}",
            f"text:{text_model['model']}+{text_model['strategy']}",
            "prosody:microsoft/wavlm-base+svc-rbf",
            "fusion:adaptive-weighted-late-fusion",
        ],
        "selected_asr_model": selected_asr,
        "available_asr_models": list_available_asr_models(),
        "text_model": text_model,
        "prosody_model": prosody_model,
        "minio_configured": bool(os.getenv("MINIO_ENDPOINT")),
        "gpu_available": torch.cuda.is_available(),
    }


@app.get("/api/v1/asr/models")
async def asr_models():
    return {
        "selected": get_selected_asr_model(),
        "models": list_available_asr_models(),
    }


@app.post("/api/v1/analyze", response_model=AnalysisResponse, status_code=202)
async def analyze(request: AnalysisRequest):
    logger.info("Received analysis request for journal %s", request.journalId)
    task_id = f"task-{request.jobId}"

    queue_task(task_id)

    background_task = asyncio.create_task(
        run_analysis_task(
            task_id=task_id,
            request=request,
        )
    )
    running_tasks.add(background_task)
    background_task.add_done_callback(running_tasks.discard)

    return AnalysisResponse(
        taskId=task_id,
        status="queued",
        estimatedSeconds=60,
    )


@app.get("/api/v1/analyze/{taskId}", response_model=StatusResponse)
async def get_status(taskId: Annotated[str, Path()]):  # noqa: N803
    task_id = taskId
    logger.info("Status check for task %s", task_id)

    task = get_task_status(task_id)
    if not task:
        return StatusResponse(
            taskId=task_id,
            status="not_found",
            progress=0,
            errorMessage="Task not found",
        )

    return StatusResponse(**task)


@app.get("/")
async def root():
    return {
        "service": "Audio Journaling Analysis Engine",
        "version": "0.5.0",
        "modelVersion": MODEL_VERSION,
        "endpoints": {
            "health": "/health",
            "asr_models": "/api/v1/asr/models",
            "analyze": "/api/v1/analyze",
            "status": "/api/v1/analyze/{taskId}",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
