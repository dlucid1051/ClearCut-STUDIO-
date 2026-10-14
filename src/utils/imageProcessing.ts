/**
 * Image processing utilities for resizing, cropping, rotating, flipping,
 * WebP conversion, and fallback edge-color matting.
 */

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Format bytes to readable string (e.g. 240 KB, 1.4 MB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Loads an image from a Blob or URL into an HTMLImageElement
 */
export function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    img.onload = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      if (typeof src !== 'string') URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Creates an HTMLCanvasElement initialized with the given image element
 */
export function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(img, 0, 0);
  }
  return canvas;
}

/**
 * Clones a canvas
 */
export function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  const ctx = copy.getContext('2d');
  if (ctx) {
    ctx.drawImage(source, 0, 0);
  }
  return copy;
}

/**
 * Resizes a canvas to new dimensions using high-quality smoothing
 */
export function resizeCanvas(
  source: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  const result = document.createElement('canvas');
  result.width = Math.max(1, Math.round(targetWidth));
  result.height = Math.max(1, Math.round(targetHeight));
  const ctx = result.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, result.width, result.height);
  }
  return result;
}

/**
 * Crops a canvas based on crop coordinates
 */
export function cropCanvas(source: HTMLCanvasElement, crop: CropRect): HTMLCanvasElement {
  const result = document.createElement('canvas');
  const cropW = Math.max(1, Math.round(crop.width));
  const cropH = Math.max(1, Math.round(crop.height));
  result.width = cropW;
  result.height = cropH;

  const ctx = result.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      source,
      Math.round(crop.x),
      Math.round(crop.y),
      cropW,
      cropH,
      0,
      0,
      cropW,
      cropH
    );
  }
  return result;
}

/**
 * Rotates a canvas by 90 degrees clockwise or counterclockwise
 */
export function rotateCanvas(source: HTMLCanvasElement, degrees: 90 | -90 | 180): HTMLCanvasElement {
  const result = document.createElement('canvas');
  if (degrees === 90 || degrees === -90) {
    result.width = source.height;
    result.height = source.width;
  } else {
    result.width = source.width;
    result.height = source.height;
  }

  const ctx = result.getContext('2d');
  if (!ctx) return source;

  ctx.translate(result.width / 2, result.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);

  return result;
}

/**
 * Flips canvas horizontally or vertically
 */
export function flipCanvas(source: HTMLCanvasElement, horizontal: boolean, vertical: boolean): HTMLCanvasElement {
  const result = document.createElement('canvas');
  result.width = source.width;
  result.height = source.height;
  const ctx = result.getContext('2d');
  if (!ctx) return source;

  ctx.save();
  ctx.translate(horizontal ? source.width : 0, vertical ? source.height : 0);
  ctx.scale(horizontal ? -1 : 1, vertical ? -1 : 1);
  ctx.drawImage(source, 0, 0);
  ctx.restore();

  return result;
}

/**
 * Converts a canvas to a WebP blob with a specified quality (0.01 - 1.0)
 */
export function canvasToWebpBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode image to WebP format'));
      },
      'image/webp',
      Math.min(1, Math.max(0.01, quality))
    );
  });
}

/**
 * Converts a canvas to a PNG blob (lossless alpha)
 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode image to PNG format'));
    }, 'image/png');
  });
}

/**
 * Converts a canvas to a JPEG blob with an optional solid background color fill
 */
export function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality = 0.90,
  backgroundColor = '#ffffff'
): Promise<Blob> {
  const flattened = document.createElement('canvas');
  flattened.width = canvas.width;
  flattened.height = canvas.height;
  const ctx = flattened.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas context not available'));

  // Fill solid background since JPEG does not support transparency
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, flattened.width, flattened.height);
  ctx.drawImage(canvas, 0, 0);

  return new Promise((resolve, reject) => {
    flattened.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode image to JPEG format'));
      },
      'image/jpeg',
      Math.min(1, Math.max(0.01, quality))
    );
  });
}

/**
 * Copies an image directly to the system clipboard (Standard PWA & desktop practice).
 * Works across Windows, macOS, Chrome, Edge, Safari, Firefox.
 */
export async function copyImageToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.write) {
    return false;
  }
  try {
    const pngBlob = await canvasToPngBlob(canvas);
    const clipboardItem = new ClipboardItem({ 'image/png': pngBlob });
    await navigator.clipboard.write([clipboardItem]);
    return true;
  } catch (err) {
    console.warn('Clipboard image write failed:', err);
    return false;
  }
}

/**
 * Converts and downloads a Blob directly to the device Downloads folder.
 * Operates 100% locally in the browser with zero server roundtrips, ensuring:
 * - Real .png, .jpg, .webp, and .ico files are saved
 * - Complete offline functionality
 * - Instant download without network latency or server errors
 */
export async function downloadBlob(
  blob: Blob,
  filename: string
): Promise<{ method: 'download'; success: boolean }> {
  const lower = filename.toLowerCase();
  const mime =
    blob.type ||
    (lower.endsWith('.webp')
      ? 'image/webp'
      : lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
      ? 'image/jpeg'
      : lower.endsWith('.ico')
      ? 'image/x-icon'
      : 'application/octet-stream');

  const typedBlob = blob.type === mime ? blob : new Blob([blob], { type: mime });
  const url = URL.createObjectURL(typedBlob);

  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  // Keep the blob URL valid for 60 seconds so the device download manager
  // has ample time to stream and write the file before revocation.
  setTimeout(() => {
    try {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
  }, 60000);

  return { method: 'download', success: true };
}

/**
 * Native Web Share dialog for users who specifically choose to share
 * to social media, Windows Share Charm, Google Drive, Gmail, or another installed app.
 */
export async function shareImageBlob(
  blob: Blob,
  filename: string
): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }

  try {
    const lower = filename.toLowerCase();
    const mime =
      blob.type ||
      (lower.endsWith('.webp')
        ? 'image/webp'
        : lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
        ? 'image/jpeg'
        : lower.endsWith('.ico')
        ? 'image/x-icon'
        : 'application/octet-stream');

    const file = new File([blob], filename, { type: mime });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: filename,
      });
      return true;
    }
  } catch (err: unknown) {
    const errorObj = err as { name?: string };
    if (errorObj?.name !== 'AbortError') {
      console.warn('Web Share failed:', err);
    }
  }

  return false;
}

/**
 * Fallback Edge & Color Keying Background Extraction:
 * In case AI model wasm fails (e.g. low-memory mobile device or initial offline setup),
 * this smart canvas algorithm extracts foreground using corner color keying,
 * luminance thresholding, and alpha feathering.
 */
export function fallbackSmartBackgroundRemoval(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const output = document.createElement('canvas');
  output.width = w;
  output.height = h;

  const ctx = output.getContext('2d');
  if (!ctx) return sourceCanvas;

  ctx.drawImage(sourceCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Sample corner colors (top-left, top-right, bottom-left, bottom-right)
  const samplePixel = (x: number, y: number) => {
    const idx = (y * w + x) * 4;
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
  };

  const corners = [
    samplePixel(2, 2),
    samplePixel(w - 3, 2),
    samplePixel(2, h - 3),
    samplePixel(w - 3, h - 3),
  ];

  const avgBg = {
    r: Math.round(corners.reduce((s, c) => s + c.r, 0) / 4),
    g: Math.round(corners.reduce((s, c) => s + c.g, 0) / 4),
    b: Math.round(corners.reduce((s, c) => s + c.b, 0) / 4),
  };

  const tolerance = 48;
  const feather = 24;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const dr = r - avgBg.r;
    const dg = g - avgBg.g;
    const db = b - avgBg.b;
    const dist = Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114);

    if (dist < tolerance) {
      data[i + 3] = 0; // Fully transparent
    } else if (dist < tolerance + feather) {
      const alphaFactor = (dist - tolerance) / feather;
      data[i + 3] = Math.round(data[i + 3] * alphaFactor);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return output;
}
