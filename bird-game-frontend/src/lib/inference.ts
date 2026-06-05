import type { PredictResponse } from '../types/predict.ts';

const API_URL = import.meta.env.VITE_INFERENCE_API_URL || 'http://localhost:8000';

/** Send an image to the FastAPI service and get top-5 predictions + Grad-CAM. */
export async function predict(
  image: Blob,
  filename = 'photo.jpg',
): Promise<PredictResponse> {
  const form = new FormData();
  form.append('file', image, filename);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/predict`, { method: 'POST', body: form });
  } catch {
    throw new Error(
      `Could not reach the inference service at ${API_URL}. ` +
        'Is it running? (cd bird-model && uvicorn serve.main:app --port 8000)',
    );
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`Prediction failed: ${detail}`);
  }

  return (await res.json()) as PredictResponse;
}
