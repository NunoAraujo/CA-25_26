import asyncio
import os
from typing import Annotated

from fastapi import FastAPI, Path

from app.models.schemas import AnalysisRequest, AnalysisResponse, StatusResponse
from app.models.task_store import running_tasks
from app.services.analysis_tasks import get_task_status, queue_task, run_analysis_task
from app.services.logging_config import logger
from app.services.transcription import get_selected_asr_model, list_available_asr_models

app = FastAPI(
    title="Audio Journaling Analysis Engine",
    description="Portuguese-first audio analysis service for emotion detection",
    version="0.3.0",
)


@app.get("/health")
async def health():
    selected_asr = get_selected_asr_model()
    return {
        "status": "ready",
        "models_loaded": [
            f"asr:{selected_asr['key']}",
            "prosody-extractor",
            "heuristic-emotion",
        ],
        "selected_asr_model": selected_asr,
        "available_asr_models": list_available_asr_models(),
        "minio_configured": bool(os.getenv("MINIO_ENDPOINT")),
        "gpu_available": False,
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
        estimatedSeconds=30,
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
        "version": "0.3.0",
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
