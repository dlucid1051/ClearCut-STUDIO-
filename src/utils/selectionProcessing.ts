/**
 * Selection processing utilities:
 * - Contiguous 4-way Flood Fill (Magic Wand)
 * - Vector Shape Mask Rasterization (Rectangle, Circle, Star, Diamond)
 * - Selection Inversion and Pixel Deletion with History Integration
 */

export type SelectionShapeType = 'rect' | 'circle' | 'star' | 'diamond';

export interface SelectionData {
  mask: Uint8Array; // 1 if pixel is selected, 0 otherwise. Length = width * height
  width: number;
  height: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  pixelCount: number;
}

export interface ShapeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Standard contiguous flood-fill algorithm (Magic Wand)
 * Uses 4-way connectivity and Euclidean RGBA distance comparison.
 */
export function floodFillSelection(
  canvas: HTMLCanvasElement,
  startX: number,
  startY: number,
  tolerance: number
): SelectionData | null {
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) return null;

  const clampX = Math.max(0, Math.min(width - 1, Math.round(startX)));
  const clampY = Math.max(0, Math.min(height - 1, Math.round(startY)));

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const startIndex = (clampY * width + clampX) * 4;
  const targetR = data[startIndex];
  const targetG = data[startIndex + 1];
  const targetB = data[startIndex + 2];
  const targetA = data[startIndex + 3];

  // Max Euclidean distance in 4D RGBA space is sqrt(4 * 255^2) = 510
  // Tolerance from 1 to 100 maps to 0..255 distance threshold
  const maxDistance = (Math.max(1, Math.min(100, tolerance)) / 100) * 320;
  const maxDistSq = maxDistance * maxDistance;

  const mask = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);

  // Queue for BFS
  // To optimize memory and performance, we use an Int32Array queue
  const queue = new Int32Array(width * height);
  let queueHead = 0;
  let queueTail = 0;

  const startPixel = clampY * width + clampX;
  visited[startPixel] = 1;
  mask[startPixel] = 1;
  queue[queueTail++] = startPixel;

  let minX = clampX;
  let maxX = clampX;
  let minY = clampY;
  let maxY = clampY;
  let pixelCount = 1;

  while (queueHead < queueTail) {
    const currentPixel = queue[queueHead++];
    const cx = currentPixel % width;
    const cy = Math.floor(currentPixel / width);

    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;

    // 4-directional neighbors: Up, Down, Left, Right
    const neighbors = [
      cy > 0 ? (cy - 1) * width + cx : -1,
      cy < height - 1 ? (cy + 1) * width + cx : -1,
      cx > 0 ? cy * width + (cx - 1) : -1,
      cx < width - 1 ? cy * width + (cx + 1) : -1,
    ];

    for (let i = 0; i < 4; i++) {
      const nIdx = neighbors[i];
      if (nIdx === -1 || visited[nIdx] === 1) continue;
      visited[nIdx] = 1;

      const nDataIdx = nIdx * 4;
      const nr = data[nDataIdx];
      const ng = data[nDataIdx + 1];
      const nb = data[nDataIdx + 2];
      const na = data[nDataIdx + 3];

      const dr = nr - targetR;
      const dg = ng - targetG;
      const db = nb - targetB;
      const da = na - targetA;

      const distSq = dr * dr + dg * dg + db * db + da * da;

      if (distSq <= maxDistSq) {
        mask[nIdx] = 1;
        pixelCount++;
        queue[queueTail++] = nIdx;
      }
    }
  }

  return {
    mask,
    width,
    height,
    bounds: { minX, minY, maxX, maxY },
    pixelCount,
  };
}

/**
 * Draws a 5-point star on a 2D canvas context within the given bounds
 */
export function drawStarPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  points = 5,
  innerRatio = 0.42
) {
  ctx.beginPath();
  const step = Math.PI / points;
  let angle = -Math.PI / 2; // start at top point

  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 1 : innerRatio;
    const x = cx + Math.cos(angle) * rx * r;
    const y = cy + Math.sin(angle) * ry * r;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    angle += step;
  }
  ctx.closePath();
}

/**
 * Draws a diamond (rhombus) path on a 2D canvas context
 */
export function drawDiamondPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(x + w, cy);
  ctx.lineTo(cx, y + h);
  ctx.lineTo(x, cy);
  ctx.closePath();
}

/**
 * Rasterizes essential vector shapes into a binary pixel selection mask.
 */
export function rasterizeShapeSelection(
  imageWidth: number,
  imageHeight: number,
  shape: SelectionShapeType,
  rect: ShapeRect
): SelectionData {
  const normX = Math.max(0, Math.min(imageWidth - 1, Math.round(Math.min(rect.x, rect.x + rect.width))));
  const normY = Math.max(0, Math.min(imageHeight - 1, Math.round(Math.min(rect.y, rect.y + rect.height))));
  const normW = Math.max(1, Math.min(imageWidth - normX, Math.round(Math.abs(rect.width))));
  const normH = Math.max(1, Math.min(imageHeight - normY, Math.round(Math.abs(rect.height))));

  const offscreen = document.createElement('canvas');
  offscreen.width = imageWidth;
  offscreen.height = imageHeight;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });

  const mask = new Uint8Array(imageWidth * imageHeight);
  let pixelCount = 0;

  if (ctx) {
    ctx.fillStyle = '#ffffff';
    switch (shape) {
      case 'rect':
        ctx.fillRect(normX, normY, normW, normH);
        break;
      case 'circle': {
        const cx = normX + normW / 2;
        const cy = normY + normH / 2;
        const rx = normW / 2;
        const ry = normH / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'star': {
        const cx = normX + normW / 2;
        const cy = normY + normH / 2;
        const rx = normW / 2;
        const ry = normH / 2;
        drawStarPath(ctx, cx, cy, rx, ry);
        ctx.fill();
        break;
      }
      case 'diamond': {
        drawDiamondPath(ctx, normX, normY, normW, normH);
        ctx.fill();
        break;
      }
    }

    const imgData = ctx.getImageData(0, 0, imageWidth, imageHeight);
    const data = imgData.data;
    const totalPixels = imageWidth * imageHeight;

    for (let i = 0; i < totalPixels; i++) {
      if (data[i * 4 + 3] > 128) {
        mask[i] = 1;
        pixelCount++;
      }
    }
  }

  return {
    mask,
    width: imageWidth,
    height: imageHeight,
    bounds: {
      minX: normX,
      minY: normY,
      maxX: normX + normW,
      maxY: normY + normH,
    },
    pixelCount,
  };
}

/**
 * Erases selected pixels (or inverted selection) to transparent on a cloned canvas.
 */
export function applyDeleteSelection(
  sourceCanvas: HTMLCanvasElement,
  mask: Uint8Array,
  isInverted: boolean
): HTMLCanvasElement {
  const result = document.createElement('canvas');
  result.width = sourceCanvas.width;
  result.height = sourceCanvas.height;

  const ctx = result.getContext('2d');
  if (!ctx) return result;

  // Draw original image first
  ctx.drawImage(sourceCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, result.width, result.height);
  const data = imgData.data;
  const total = result.width * result.height;

  for (let i = 0; i < total; i++) {
    const isSelected = mask[i] === 1;
    const shouldErase = isInverted ? !isSelected : isSelected;

    if (shouldErase) {
      const idx = i * 4;
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = 0; // transparent
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return result;
}

export interface ExtractSelectionOptions {
  sourceCanvas: HTMLCanvasElement;
  mask?: Uint8Array | null;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  isInverted?: boolean;
  bgMode?: 'checker-dark' | 'checker-light' | 'white' | 'dark' | 'custom' | 'split' | 'image';
  customBgColor?: string;
  bgImageElement?: HTMLImageElement | null;
  bgImageFit?: 'cover' | 'contain' | 'stretch';
  bgImageBlur?: number;
}

/**
 * Extracts the cropped bounding box of an active selection into a separate canvas.
 * Pixels outside the active selection (or inside if inverted) have their alpha set to 0.
 * If solid background mode or image background is active, fills behind selected pixels.
 */
export function extractSelectionCanvas(options: ExtractSelectionOptions): HTMLCanvasElement | null {
  const {
    sourceCanvas,
    mask,
    bounds,
    isInverted = false,
    bgMode,
    customBgColor,
    bgImageElement,
    bgImageFit = 'cover',
    bgImageBlur = 0,
  } = options;
  const fullWidth = sourceCanvas.width;
  const fullHeight = sourceCanvas.height;
  if (fullWidth <= 0 || fullHeight <= 0) return null;

  let minX = Math.max(0, Math.min(fullWidth - 1, Math.floor(bounds.minX)));
  let minY = Math.max(0, Math.min(fullHeight - 1, Math.floor(bounds.minY)));
  let maxX = Math.max(minX + 1, Math.min(fullWidth, Math.ceil(bounds.maxX)));
  let maxY = Math.max(minY + 1, Math.min(fullHeight, Math.ceil(bounds.maxY)));

  if (isInverted) {
    minX = 0;
    minY = 0;
    maxX = fullWidth;
    maxY = fullHeight;
  }

  const cropWidth = maxX - minX;
  const cropHeight = maxY - minY;
  if (cropWidth <= 0 || cropHeight <= 0) return null;

  // Determine solid background color if non-checker mode
  let solidBg: string | null = null;
  if (bgMode === 'white') {
    solidBg = '#ffffff';
  } else if (bgMode === 'dark') {
    solidBg = '#000000';
  } else if (bgMode === 'custom') {
    solidBg = customBgColor || '#000000';
  }

  const compCanvas = document.createElement('canvas');
  compCanvas.width = cropWidth;
  compCanvas.height = cropHeight;
  const compCtx = compCanvas.getContext('2d');
  if (!compCtx) return null;

  if (solidBg) {
    compCtx.fillStyle = solidBg;
    compCtx.fillRect(0, 0, cropWidth, cropHeight);
  } else if (bgMode === 'image' && bgImageElement) {
    compCtx.save();
    if (bgImageBlur > 0) {
      compCtx.filter = `blur(${bgImageBlur}px)`;
    }
    // Draw background image fitted to source image dimensions, sliced at selection bounds
    const fullBg = document.createElement('canvas');
    fullBg.width = fullWidth;
    fullBg.height = fullHeight;
    const fullBgCtx = fullBg.getContext('2d');
    if (fullBgCtx) {
      if (bgImageFit === 'stretch') {
        fullBgCtx.drawImage(bgImageElement, 0, 0, fullWidth, fullHeight);
      } else if (bgImageFit === 'contain') {
        const s = Math.min(fullWidth / bgImageElement.width, fullHeight / bgImageElement.height);
        const w = bgImageElement.width * s;
        const h = bgImageElement.height * s;
        fullBgCtx.drawImage(bgImageElement, (fullWidth - w) / 2, (fullHeight - h) / 2, w, h);
      } else {
        const s = Math.max(fullWidth / bgImageElement.width, fullHeight / bgImageElement.height);
        const w = bgImageElement.width * s;
        const h = bgImageElement.height * s;
        fullBgCtx.drawImage(bgImageElement, (fullWidth - w) / 2, (fullHeight - h) / 2, w, h);
      }
      compCtx.drawImage(fullBg, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    }
    compCtx.restore();
  }

  // Draw slice from sourceCanvas
  compCtx.drawImage(
    sourceCanvas,
    minX, minY, cropWidth, cropHeight,
    0, 0, cropWidth, cropHeight
  );

  // If no mask, the entire bounding box is selected
  if (!mask) {
    return compCanvas;
  }

  // Apply mask transparency
  const imgData = compCtx.getImageData(0, 0, cropWidth, cropHeight);
  const data = imgData.data;

  for (let cy = 0; cy < cropHeight; cy++) {
    const imgY = minY + cy;
    const rowOffset = cy * cropWidth;
    const maskRowOffset = imgY * fullWidth;

    for (let cx = 0; cx < cropWidth; cx++) {
      const imgX = minX + cx;
      const maskIdx = maskRowOffset + imgX;
      const isSelected = maskIdx >= 0 && maskIdx < mask.length && mask[maskIdx] === 1;
      const keep = isInverted ? !isSelected : isSelected;

      if (!keep) {
        const pixelIdx = (rowOffset + cx) * 4;
        data[pixelIdx + 3] = 0; // alpha = 0 (transparent)
      }
    }
  }

  compCtx.putImageData(imgData, 0, 0);
  return compCanvas;
}
