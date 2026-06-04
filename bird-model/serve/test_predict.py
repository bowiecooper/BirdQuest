"""Smoke tests for the inference service.

Run from the bird-model/ directory:
    .venv/bin/python -m pytest serve/test_predict.py -v

Skips automatically if the checkpoint is missing (e.g. on a fresh clone before
training), so the suite never hard-fails for a reason unrelated to the API.
"""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from .predictor import DEFAULT_CKPT

pytestmark = pytest.mark.skipif(
    not Path(DEFAULT_CKPT).exists(),
    reason=f"checkpoint {DEFAULT_CKPT} not present",
)


@pytest.fixture(scope="module")
def client():
    from .main import app

    with TestClient(app) as c:  # triggers lifespan -> loads the model once
        yield c


def _sample_image_bytes() -> bytes:
    """A real bird photo if the dataset is present, else a synthetic image."""
    images = Path("data/CUB_200_2011/images")
    if images.exists():
        for p in images.rglob("*.jpg"):
            return p.read_bytes()
    buf = io.BytesIO()
    Image.new("RGB", (400, 300), (120, 140, 90)).save(buf, format="JPEG")
    return buf.getvalue()


def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["device"] in ("cuda", "cpu")


def test_species_catalog(client):
    species = client.get("/species").json()
    assert len(species) == 200
    assert species[0]["class_index"] == 0
    assert all(s["common_name"] for s in species)


def test_predict_returns_top5_and_gradcam(client):
    resp = client.post(
        "/predict", files={"file": ("bird.jpg", _sample_image_bytes(), "image/jpeg")}
    )
    assert resp.status_code == 200
    body = resp.json()

    assert len(body["predictions"]) == 5
    probs = [p["probability"] for p in body["predictions"]]
    assert probs == sorted(probs, reverse=True)  # descending
    assert all(0.0 <= p <= 1.0 for p in probs)
    assert body["predictions"][0]["class_index"] < 200

    assert body["gradcam"].startswith("data:image/png;base64,")
    assert body["model"]["num_classes"] == 200


def test_predict_can_skip_gradcam(client):
    resp = client.post(
        "/predict?gradcam=false",
        files={"file": ("bird.jpg", _sample_image_bytes(), "image/jpeg")},
    )
    assert resp.status_code == 200
    assert resp.json()["gradcam"] is None


def test_predict_rejects_non_image(client):
    resp = client.post(
        "/predict", files={"file": ("notes.txt", b"hello", "text/plain")}
    )
    assert resp.status_code == 400
