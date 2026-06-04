"""Loads the trained checkpoint once and turns an image into predictions.

Reuses ``src.birdmodel`` for the model, eval transforms, and the from-scratch
Grad-CAM, so the served model is byte-identical to the evaluated one. A single
eager model with Grad-CAM hooks is shared across requests; it is **not**
thread-safe, so the caller (``serve.main``) serializes ``predict`` with a lock.
"""

from __future__ import annotations

import base64
import io
import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from src.birdmodel.data import IMAGENET_MEAN, IMAGENET_STD, build_transforms
from src.birdmodel.gradcam import GradCAM
from src.birdmodel.model import build_model, gradcam_target_layer

DEFAULT_CKPT = os.environ.get("CKPT_PATH", "checkpoints/best.pth")


@dataclass
class Prediction:
    class_index: int
    common_name: str
    probability: float


def _denormalize(tensor: torch.Tensor) -> np.ndarray:
    """Undo ImageNet normalization -> HxWx3 float array in [0, 1]."""
    mean = torch.tensor(IMAGENET_MEAN).view(3, 1, 1)
    std = torch.tensor(IMAGENET_STD).view(3, 1, 1)
    return (tensor.cpu() * std + mean).clamp(0, 1).permute(1, 2, 0).numpy()


def _overlay_png_base64(input_tensor: torch.Tensor, heatmap: np.ndarray) -> str:
    """Blend the Grad-CAM heatmap over the input image -> base64 PNG data URL."""
    import matplotlib.cm as mpl_cm

    base = _denormalize(input_tensor[0])
    colored = mpl_cm.jet(heatmap)[..., :3]
    overlay = (0.5 * base + 0.5 * colored).clip(0, 1)
    img = Image.fromarray((overlay * 255).astype(np.uint8))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


class Predictor:
    """Holds the loaded model and serves single-image predictions."""

    def __init__(self, ckpt_path: str | Path = DEFAULT_CKPT):
        ckpt_path = Path(ckpt_path)
        if not ckpt_path.exists():
            raise FileNotFoundError(
                f"Checkpoint not found at {ckpt_path}. Set CKPT_PATH or train the "
                "model first (see bird-model/README.md)."
            )

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        ckpt = torch.load(ckpt_path, map_location=self.device, weights_only=False)

        self.classes: list[str] = ckpt["classes"]
        self.arch: str = ckpt["arch"]
        self.img_size: int = ckpt.get("img_size", 224)
        self.metrics: dict = ckpt.get("metrics", {})

        model = build_model(self.arch, num_classes=len(self.classes), pretrained=False)
        model.load_state_dict(ckpt["state_dict"])
        self.model = model.to(self.device).eval()

        _, self.eval_tf = build_transforms(self.img_size)
        self.cam = GradCAM(self.model, gradcam_target_layer(self.model, self.arch))

    @property
    def num_classes(self) -> int:
        return len(self.classes)

    def predict(
        self, image: Image.Image, k: int = 5, with_gradcam: bool = True
    ) -> tuple[list[Prediction], str | None]:
        """Return (top-k predictions, Grad-CAM data URL or None).

        Runs a single forward+backward pass: Grad-CAM yields both the softmax
        probabilities (for the top-k list) and the heatmap, so there is no extra
        inference cost when the overlay is requested.
        """
        x = self.eval_tf(image.convert("RGB")).unsqueeze(0).to(self.device)
        _, probs, heatmap = self.cam(x)

        k = min(k, self.num_classes)
        top = torch.topk(probs, k)
        predictions = [
            Prediction(
                class_index=int(idx),
                common_name=self.classes[int(idx)],
                probability=float(prob),
            )
            for prob, idx in zip(top.values.tolist(), top.indices.tolist())
        ]

        gradcam = _overlay_png_base64(x, heatmap) if with_gradcam else None
        return predictions, gradcam
