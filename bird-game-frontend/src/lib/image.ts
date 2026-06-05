/**
 * Downscale a copy of an image for inference. The model only sees 224px, so
 * sending a 40 MB original is wasteful — we shrink the longest side to `maxDim`
 * and re-encode as JPEG. The full-resolution original is still what we upload to
 * Storage; this copy is only for the /predict call.
 *
 * Falls back to the original file if the browser can't decode it (e.g. HEIC) or
 * it's already small enough.
 */
export async function downscaleForInference(
  file: File,
  maxDim = 1024,
  quality = 0.9,
): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // imageOrientation respects EXIF so sideways phone photos predict upright.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file; // undecodable here — let the server try the original
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  if (scale === 1) {
    bitmap.close();
    return file; // already within budget
  }

  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', quality);
  });
}
