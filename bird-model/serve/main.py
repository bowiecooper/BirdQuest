"""FastAPI inference service.

    cd bird-model
    .venv/bin/python -m uvicorn serve.main:app --reload --port 8000

Endpoints:
    GET  /health    liveness + device
    GET  /          model card (arch, accuracy, class count)
    GET  /species   the 200 class names + indices (maps to the species catalog)
    POST /predict   multipart image -> top-5 species + Grad-CAM overlay
"""

from __future__ import annotations

import asyncio
import io
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError

from .predictor import Predictor
from .schemas import (
    HealthResponse,
    ModelInfo,
    PredictResponse,
    SpeciesEntry,
    SpeciesPrediction,
)

MAX_UPLOAD_MB = float(os.environ.get("MAX_UPLOAD_MB", "10"))
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

# A single eager model with Grad-CAM hooks is shared across requests and is not
# thread-safe, so we serialize inference. Fine for a single-worker demo service.
_inference_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.predictor = Predictor()  # loads the checkpoint once at startup
    yield


app = FastAPI(
    title="BirdQuest Inference API",
    description="Fine-grained bird-species classifier (CUB-200) with Grad-CAM.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _model_info(predictor: Predictor) -> ModelInfo:
    return ModelInfo(
        arch=predictor.arch,
        num_classes=predictor.num_classes,
        top1=predictor.metrics.get("top1"),
        top5=predictor.metrics.get("top5"),
    )


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", device=app.state.predictor.device.type)


@app.get("/", response_model=ModelInfo)
async def root() -> ModelInfo:
    return _model_info(app.state.predictor)


@app.get("/species", response_model=list[SpeciesEntry])
async def species() -> list[SpeciesEntry]:
    return [
        SpeciesEntry(class_index=i, common_name=name)
        for i, name in enumerate(app.state.predictor.classes)
    ]


@app.post("/predict", response_model=PredictResponse)
async def predict(
    file: UploadFile = File(...),
    gradcam: bool = Query(True, description="Include the Grad-CAM overlay."),
) -> PredictResponse:
    if file.content_type is None or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413, detail=f"Image exceeds {MAX_UPLOAD_MB:g} MB limit."
        )

    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Could not decode image.")

    predictor: Predictor = app.state.predictor
    async with _inference_lock:
        preds, overlay = await run_in_threadpool(
            predictor.predict, image, 5, gradcam
        )

    return PredictResponse(
        predictions=[SpeciesPrediction(**p.__dict__) for p in preds],
        gradcam=overlay,
        model=_model_info(predictor),
    )
