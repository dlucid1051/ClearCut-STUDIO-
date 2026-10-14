/**
 * Utility functions for mask touch-up (Eraser and Restore Brush tools).
 * - Eraser: clears pixels to transparent RGBA(0,0,0,0)
 * - Restore Brush: samples original image pixels inside the brush path and paints them back
 */

export interface DrawPoint {
  x: number;
  y: number;
}

// Reusable scratch canvas for performant compositing without allocating every frame
let scratchCanvas: HTMLCanvasElement | null = null;

function getScratchCanvas(width: number, height: number): HTMLCanvasElement {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas');
  }
  if (scratchCanvas.width !== width || scratchCanvas.height !== height) {
    scratchCanvas.width = Math.max(1, width);
    scratchCanvas.height = Math.max(1, height);
  }
  return scratchCanvas;
}

/**
 * Creates an initial original canvas aligned with cutout dimensions
 */
export function createOriginalCanvas(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, targetWidth);
  canvas.height = Math.max(1, targetHeight);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

/**
 * Applies an eraser stroke between p0 and p1 onto targetCtx with optional hardness (0 to 100).
 */
export function applyEraserStroke(
  targetCtx: CanvasRenderingContext2D,
  p0: DrawPoint,
  p1: DrawPoint,
  brushSize: number,
  hardness: number = 100,
  targetWidth?: number,
  targetHeight?: number
): void {
  const radius = Math.max(1, brushSize / 2);
  const blurRadius = hardness < 98 ? Math.max(1, ((100 - hardness) / 100) * radius * 0.75) : 0;

  if (blurRadius <= 0) {
    targetCtx.save();
    targetCtx.globalCompositeOperation = 'destination-out';
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.lineWidth = Math.max(1, brushSize);

    if (p0.x === p1.x && p0.y === p1.y) {
      targetCtx.beginPath();
      targetCtx.arc(p0.x, p0.y, radius, 0, Math.PI * 2);
      targetCtx.fill();
    } else {
      targetCtx.beginPath();
      targetCtx.moveTo(p0.x, p0.y);
      targetCtx.lineTo(p1.x, p1.y);
      targetCtx.stroke();
    }
    targetCtx.restore();
    return;
  }

  // Soft eraser stroke via scratch canvas
  const canvasW = targetWidth || targetCtx.canvas.width;
  const canvasH = targetHeight || targetCtx.canvas.height;

  const pad = Math.ceil(radius + blurRadius * 2 + 4);
  const minX = Math.floor(Math.max(0, Math.min(p0.x, p1.x) - pad));
  const minY = Math.floor(Math.max(0, Math.min(p0.y, p1.y) - pad));
  const maxX = Math.ceil(Math.min(canvasW, Math.max(p0.x, p1.x) + pad));
  const maxY = Math.ceil(Math.min(canvasH, Math.max(p0.y, p1.y) + pad));

  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  if (bboxW <= 0 || bboxH <= 0) return;

  const scratch = getScratchCanvas(bboxW, bboxH);
  const sctx = scratch.getContext('2d');
  if (!sctx) return;

  sctx.clearRect(0, 0, bboxW, bboxH);

  sctx.save();
  sctx.filter = `blur(${blurRadius}px)`;
  sctx.fillStyle = '#ffffff';
  sctx.strokeStyle = '#ffffff';
  sctx.lineWidth = Math.max(1, brushSize);
  sctx.lineCap = 'round';
  sctx.lineJoin = 'round';

  const localP0 = { x: p0.x - minX, y: p0.y - minY };
  const localP1 = { x: p1.x - minX, y: p1.y - minY };

  if (p0.x === p1.x && p0.y === p1.y) {
    sctx.beginPath();
    sctx.arc(localP0.x, localP0.y, radius, 0, Math.PI * 2);
    sctx.fill();
  } else {
    sctx.beginPath();
    sctx.moveTo(localP0.x, localP0.y);
    sctx.lineTo(localP1.x, localP1.y);
    sctx.stroke();
  }
  sctx.restore();

  // Composite the blurred shape as destination-out onto targetCtx
  targetCtx.save();
  targetCtx.globalCompositeOperation = 'destination-out';
  targetCtx.drawImage(scratch, 0, 0, bboxW, bboxH, minX, minY, bboxW, bboxH);
  targetCtx.restore();
}

/**
 * Applies a restore stroke between p0 and p1:
 * Pulls original pixels from originalSource and paints them onto targetCtx with optional hardness (0 to 100).
 */
export function applyRestoreStroke(
  targetCtx: CanvasRenderingContext2D,
  originalSource: HTMLCanvasElement | HTMLImageElement,
  p0: DrawPoint,
  p1: DrawPoint,
  brushSize: number,
  targetWidth: number,
  targetHeight: number,
  hardness: number = 100
): void {
  const radius = Math.max(1, brushSize / 2);
  const blurRadius = hardness < 98 ? Math.max(1, ((100 - hardness) / 100) * radius * 0.75) : 0;
  const pad = Math.ceil(radius + blurRadius * 2 + 4);

  const minX = Math.floor(Math.max(0, Math.min(p0.x, p1.x) - pad));
  const minY = Math.floor(Math.max(0, Math.min(p0.y, p1.y) - pad));
  const maxX = Math.ceil(Math.min(targetWidth, Math.max(p0.x, p1.x) + pad));
  const maxY = Math.ceil(Math.min(targetHeight, Math.max(p0.y, p1.y) + pad));

  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  if (bboxW <= 0 || bboxH <= 0) return;

  const scratch = getScratchCanvas(bboxW, bboxH);
  const sctx = scratch.getContext('2d');
  if (!sctx) return;

  // Clear scratch canvas
  sctx.clearRect(0, 0, bboxW, bboxH);

  // 1. Draw mask stroke (white alpha) on scratch with optional blur
  sctx.save();
  if (blurRadius > 0) {
    sctx.filter = `blur(${blurRadius}px)`;
  }
  sctx.globalCompositeOperation = 'source-over';
  sctx.fillStyle = '#ffffff';
  sctx.strokeStyle = '#ffffff';
  sctx.lineWidth = Math.max(1, brushSize);
  sctx.lineCap = 'round';
  sctx.lineJoin = 'round';

  const localP0 = { x: p0.x - minX, y: p0.y - minY };
  const localP1 = { x: p1.x - minX, y: p1.y - minY };

  if (p0.x === p1.x && p0.y === p1.y) {
    sctx.beginPath();
    sctx.arc(localP0.x, localP0.y, radius, 0, Math.PI * 2);
    sctx.fill();
  } else {
    sctx.beginPath();
    sctx.moveTo(localP0.x, localP0.y);
    sctx.lineTo(localP1.x, localP1.y);
    sctx.stroke();
  }
  sctx.restore();

  // 2. Composite original pixels into the stroke mask shape
  sctx.save();
  sctx.globalCompositeOperation = 'source-in';
  sctx.drawImage(originalSource, minX, minY, bboxW, bboxH, 0, 0, bboxW, bboxH);
  sctx.restore();

  // 3. Draw the masked original pixels onto target canvas
  targetCtx.save();
  targetCtx.globalCompositeOperation = 'source-over';
  targetCtx.drawImage(scratch, 0, 0, bboxW, bboxH, minX, minY, bboxW, bboxH);
  targetCtx.restore();
}
