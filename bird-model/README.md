# BirdQuest — Bird Species Classifier (CUB-200-2011)

Fine-grained bird-species image classifier and the ML core of BirdQuest. Trains a
transfer-learning model on **CUB-200-2011** (200 species, ~11,788 images), the
standard fine-grained visual classification benchmark, and exposes top-5
predictions + Grad-CAM explainability for the app.

## Stack
- PyTorch + torchvision (CUDA), EfficientNet-B0 backbone (ResNet-50 optional)
- Two-stage transfer learning, mixed precision (AMP) — tuned for a 4GB GPU
- Grad-CAM (implemented from scratch) for interpretability

## Setup
```bash
cd bird-model
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
.venv/bin/python -m pip install -r requirements.txt

# Confirm the GPU is visible (WSL2 passthrough)
.venv/bin/python scripts/check_env.py
```

## Data
```bash
.venv/bin/python scripts/download_cub.py        # downloads + extracts to data/CUB_200_2011
```

## Train
```bash
.venv/bin/python -m src.birdmodel.train --data data/CUB_200_2011
# 4GB GPU defaults: efficientnet_b0, batch 16, accum 2 (effective batch 32), AMP.
# If you hit CUDA OOM: lower --batch-size to 8 and raise --accum-steps to 4.
```
Best checkpoint (weights + class names + metrics) is saved to `checkpoints/best.pth`.

## Evaluate
```bash
.venv/bin/python -m src.birdmodel.eval --ckpt checkpoints/best.pth --data data/CUB_200_2011
# writes checkpoints/metrics.md (top-1/top-5 + most-confused species pairs)
```

## Explain (Grad-CAM)
```bash
.venv/bin/python -m src.birdmodel.gradcam --ckpt checkpoints/best.pth --image some_bird.jpg
# prints top-5 and saves a heatmap overlay to checkpoints/gradcam.png
```

## Serve (FastAPI)
The trained checkpoint is served to the React app by a FastAPI service in `serve/`,
which reuses the model code in `src/birdmodel` (no duplicated logic).
```bash
.venv/bin/python -m pip install -r requirements.txt   # adds fastapi/uvicorn
.venv/bin/python -m uvicorn serve.main:app --reload --port 8000
```
Endpoints:
| Method | Path | Returns |
|--------|------|---------|
| GET | `/health` | `{status, device}` |
| GET | `/` | model card: `arch`, `num_classes`, `top1`, `top5` |
| GET | `/species` | the 200 class names + `class_index` (maps to the species catalog) |
| POST | `/predict` | multipart `file` -> top-5 `{class_index, common_name, probability}` + Grad-CAM overlay (base64 PNG); `?gradcam=false` to skip |

```bash
curl -F file=@some_bird.jpg http://localhost:8000/predict | jq '.predictions'
.venv/bin/python -m pytest serve/test_predict.py -v    # smoke tests
```
Config via env: `CKPT_PATH` (default `checkpoints/best.pth`), `ALLOWED_ORIGINS`
(CORS, default `http://localhost:3000`), `MAX_UPLOAD_MB` (default 50).

Deploy: `docker build -t birdquest-api . && docker run -p 8000:8000 birdquest-api`
(CPU-only image; runs on Hugging Face Spaces / Render / Fly).

## Layout
```
scripts/check_env.py     GPU / CUDA sanity check
scripts/download_cub.py  dataset download + extract
src/birdmodel/data.py    CUB-200 Dataset + dataloaders + transforms
src/birdmodel/model.py   backbone factory, freeze/unfreeze, Grad-CAM target layer
src/birdmodel/train.py   two-stage training loop (AMP, checkpointing)
src/birdmodel/eval.py    top-1/top-5, confusion matrix, hardest pairs
src/birdmodel/gradcam.py from-scratch Grad-CAM + overlay
serve/predictor.py       loads best.pth once; predict() -> top-5 + Grad-CAM
serve/main.py            FastAPI app (/health, /, /species, /predict)
serve/schemas.py         Pydantic response models (the frontend contract)
serve/test_predict.py    TestClient smoke tests
Dockerfile               CPU-only deploy image
```

Next: Supabase schema + RLS, TypeScript React frontend wired to `POST /predict`.
See ../PLAN.md.
