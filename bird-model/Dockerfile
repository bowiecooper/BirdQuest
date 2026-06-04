# CPU-only image for the BirdQuest inference service.
# Builds a self-contained container that serves serve.main:app — suitable for
# Hugging Face Spaces, Render, Fly, etc. (no GPU required; the model runs fine on
# CPU for single-image demo inference).
FROM python:3.12-slim

WORKDIR /app

# System libs Pillow/torchvision need at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install the CPU build of torch first (smaller, no CUDA), then the rest.
RUN pip install --no-cache-dir torch torchvision \
        --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Only what the service needs at runtime: model code, the service, the weights.
COPY src/ ./src/
COPY serve/ ./serve/
COPY checkpoints/best.pth ./checkpoints/best.pth

ENV CKPT_PATH=checkpoints/best.pth
# Spaces/Render inject $PORT; default to 8000 locally.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn serve.main:app --host 0.0.0.0 --port ${PORT}"]
