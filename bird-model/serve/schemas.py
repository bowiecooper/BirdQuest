"""Pydantic response models — the contract the React frontend consumes."""

from __future__ import annotations

from pydantic import BaseModel


class SpeciesPrediction(BaseModel):
    class_index: int  # maps to species.class_index in the Supabase catalog
    common_name: str
    probability: float


class ModelInfo(BaseModel):
    arch: str
    num_classes: int
    top1: float | None = None
    top5: float | None = None


class PredictResponse(BaseModel):
    predictions: list[SpeciesPrediction]
    gradcam: str | None = None  # base64 PNG data URL for the top-1, or null
    model: ModelInfo


class SpeciesEntry(BaseModel):
    class_index: int
    common_name: str


class HealthResponse(BaseModel):
    status: str
    device: str
