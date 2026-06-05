// Mirrors the FastAPI inference contract (bird-model/serve/schemas.py).

export interface SpeciesPrediction {
  class_index: number;
  common_name: string;
  probability: number;
}

export interface ModelInfo {
  arch: string;
  num_classes: number;
  top1: number | null;
  top5: number | null;
}

export interface PredictResponse {
  predictions: SpeciesPrediction[];
  gradcam: string | null; // base64 PNG data URL for the top-1, or null
  model: ModelInfo;
}
