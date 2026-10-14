/**
 * Windows .ICO Binary File Generator
 * Generates valid multi-resolution Windows Icon files (.ico) containing PNG-encoded frames.
 * Supports standard resolutions: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256.
 */

export interface IcoExportOptions {
  sizes?: number[]; // e.g. [16, 32, 48, 64, 128, 256]
}

export const STANDARD_ICO_SIZES = [16, 32, 48, 64, 128, 256];

/**
 * Resizes a source canvas to a specific square dimension and returns PNG blob/ArrayBuffer.
 */
async function canvasToPngBuffer(sourceCanvas: HTMLCanvasElement, size: number): Promise<Uint8Array> {
  const offscreen = document.createElement('canvas');
  offscreen.width = size;
  offscreen.height = size;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get 2d context for icon resize');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Calculate centered contain fit
  const sWidth = sourceCanvas.width;
  const sHeight = sourceCanvas.height;
  const scale = Math.min(size / sWidth, size / sHeight);
  const drawWidth = Math.round(sWidth * scale);
  const drawHeight = Math.round(sHeight * scale);
  const dx = Math.round((size - drawWidth) / 2);
  const dy = Math.round((size - drawHeight) / 2);

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(sourceCanvas, dx, dy, drawWidth, drawHeight);

  return new Promise<Uint8Array>((resolve, reject) => {
    offscreen.toBlob((blob) => {
      if (!blob) return reject(new Error('Failed to create PNG blob for size ' + size));
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer))).catch(reject);
    }, 'image/png');
  });
}

/**
 * Packs multiple PNG images into a single binary .ICO file Blob.
 */
export async function generateIcoBlob(
  sourceCanvas: HTMLCanvasElement,
  options: IcoExportOptions = {}
): Promise<Blob> {
  const sizes = options.sizes && options.sizes.length > 0 ? options.sizes : STANDARD_ICO_SIZES;
  const sortedSizes = [...new Set(sizes)].sort((a, b) => a - b);

  // Generate PNG buffers for each size
  const pngBuffers: { size: number; buffer: Uint8Array }[] = [];
  for (const size of sortedSizes) {
    const buffer = await canvasToPngBuffer(sourceCanvas, size);
    pngBuffers.push({ size, buffer });
  }

  const numImages = pngBuffers.length;
  // Header: 6 bytes
  // Directory entries: 16 bytes per image
  const headerAndDirSize = 6 + 16 * numImages;

  // Calculate offsets and total byte size
  let currentOffset = headerAndDirSize;
  const entries: {
    width: number;
    height: number;
    sizeInBytes: number;
    offset: number;
    buffer: Uint8Array;
  }[] = [];

  for (const item of pngBuffers) {
    entries.push({
      width: item.size >= 256 ? 0 : item.size, // 0 indicates 256px in ICO spec
      height: item.size >= 256 ? 0 : item.size,
      sizeInBytes: item.buffer.byteLength,
      offset: currentOffset,
      buffer: item.buffer,
    });
    currentOffset += item.buffer.byteLength;
  }

  const icoArrayBuffer = new ArrayBuffer(currentOffset);
  const view = new DataView(icoArrayBuffer);

  // Write ICONDIR Header (6 bytes)
  view.setUint16(0, 0, true); // idReserved = 0
  view.setUint16(2, 1, true); // idType = 1 (ICO)
  view.setUint16(4, numImages, true); // idCount

  // Write ICONDIRENTRY (16 bytes each)
  let dirOffset = 6;
  for (const entry of entries) {
    view.setUint8(dirOffset + 0, entry.width); // bWidth
    view.setUint8(dirOffset + 1, entry.height); // bHeight
    view.setUint8(dirOffset + 2, 0); // bColorCount (0 for 256+ / 32-bit RGBA)
    view.setUint8(dirOffset + 3, 0); // bReserved
    view.setUint16(dirOffset + 4, 1, true); // wPlanes
    view.setUint16(dirOffset + 6, 32, true); // wBitCount (32-bit RGBA)
    view.setUint32(dirOffset + 8, entry.sizeInBytes, true); // dwBytesInRes
    view.setUint32(dirOffset + 12, entry.offset, true); // dwImageOffset
    dirOffset += 16;
  }

  // Write PNG image payloads
  const fullBytes = new Uint8Array(icoArrayBuffer);
  for (const entry of entries) {
    fullBytes.set(entry.buffer, entry.offset);
  }

  return new Blob([icoArrayBuffer], { type: 'image/x-icon' });
}
