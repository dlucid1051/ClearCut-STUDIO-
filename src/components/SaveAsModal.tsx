import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Download,
  Share2,
  Copy,
  Check,
  Loader2,
  FileImage,
  Layers,
  Sparkles,
  Sliders,
  Palette,
  Info,
  Maximize2
} from 'lucide-react';
import {
  canvasToPngBlob,
  canvasToWebpBlob,
  canvasToJpegBlob,
  downloadBlob,
  shareImageBlob,
  copyImageToClipboard,
  formatBytes,
  resizeCanvas,
} from '../utils/imageProcessing';
import { STANDARD_ICO_SIZES, generateIcoBlob } from '../utils/icoGenerator';
import { triggerHaptic } from '../utils/haptics';

export type ExportFormat = 'png' | 'webp' | 'jpeg' | 'ico';

interface SaveAsModalProps {
  canvas: HTMLCanvasElement;
  originalFilename: string;
  originalFileSize?: number;
  onClose: () => void;
}

export const SaveAsModal: React.FC<SaveAsModalProps> = ({
  canvas,
  originalFilename,
  originalFileSize = 0,
  onClose,
}) => {
  // Detect original extension
  const detectedFormat = useMemo<ExportFormat>(() => {
    const ext = originalFilename.split('.').pop()?.toLowerCase() || '';
    if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
    if (ext === 'webp') return 'webp';
    if (ext === 'ico') return 'ico';
    return 'png';
  }, [originalFilename]);

  // Clean base name without extension
  const defaultBaseName = useMemo(() => {
    const withoutExt = originalFilename.replace(/\.[^/.]+$/, '');
    return withoutExt || 'cutout';
  }, [originalFilename]);

  const [filename, setFilename] = useState<string>(defaultBaseName);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>(detectedFormat);

  // WebP options
  const [webpQuality, setWebpQuality] = useState<number>(0.85);
  const [webpLossless, setWebpLossless] = useState<boolean>(false);

  // JPEG options
  const [jpegQuality, setJpegQuality] = useState<number>(0.90);
  const [jpegBgColor, setJpegBgColor] = useState<string>('#ffffff');

  // PNG options
  const [pngPreserveAlpha, setPngPreserveAlpha] = useState<boolean>(true);
  const [pngBgColor, setPngBgColor] = useState<string>('#ffffff');
  const [scaleFactor, setScaleFactor] = useState<number>(1);

  // ICO options
  const [selectedIcoSizes, setSelectedIcoSizes] = useState<number[]>([16, 32, 48, 64, 128, 256]);
  const [icoPreviews, setIcoPreviews] = useState<{ [size: number]: string }>({});

  // Operational states
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<'saved' | 'copied' | 'shared' | null>(null);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');

  // Can the current platform share files? (Windows Edge/Chrome, macOS, Android, iOS)
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // Generate ICO preview thumbnails
  useEffect(() => {
    if (selectedFormat !== 'ico') return;
    const urls: { [size: number]: string } = {};
    STANDARD_ICO_SIZES.forEach((size) => {
      const offscreen = document.createElement('canvas');
      offscreen.width = size;
      offscreen.height = size;
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const scale = Math.min(size / canvas.width, size / canvas.height);
        const dw = Math.round(canvas.width * scale);
        const dh = Math.round(canvas.height * scale);
        const dx = Math.round((size - dw) / 2);
        const dy = Math.round((size - dh) / 2);
        ctx.drawImage(canvas, dx, dy, dw, dh);
        urls[size] = offscreen.toDataURL('image/png');
      }
    });
    setIcoPreviews(urls);
  }, [canvas, selectedFormat]);

  // Generate live preview and estimated size for current format
  useEffect(() => {
    let cancelled = false;

    async function computeEstimate() {
      try {
        let exportCanvas = canvas;
        if (scaleFactor !== 1) {
          exportCanvas = resizeCanvas(
            canvas,
            Math.round(canvas.width * scaleFactor),
            Math.round(canvas.height * scaleFactor)
          );
        }

        if (selectedFormat === 'png') {
          let targetCanvas = exportCanvas;
          if (!pngPreserveAlpha) {
            targetCanvas = document.createElement('canvas');
            targetCanvas.width = exportCanvas.width;
            targetCanvas.height = exportCanvas.height;
            const ctx = targetCanvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = pngBgColor;
              ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
              ctx.drawImage(exportCanvas, 0, 0);
            }
          }
          const blob = await canvasToPngBlob(targetCanvas);
          if (!cancelled) {
            setEstimatedSize(blob.size);
            setPreviewDataUrl(targetCanvas.toDataURL('image/png'));
          }
        } else if (selectedFormat === 'webp') {
          const q = webpLossless ? 1.0 : webpQuality;
          const blob = await canvasToWebpBlob(exportCanvas, q);
          if (!cancelled) {
            setEstimatedSize(blob.size);
            setPreviewDataUrl(exportCanvas.toDataURL('image/webp', q));
          }
        } else if (selectedFormat === 'jpeg') {
          const blob = await canvasToJpegBlob(exportCanvas, jpegQuality, jpegBgColor);
          if (!cancelled) {
            setEstimatedSize(blob.size);
            // Preview image with background
            const flattened = document.createElement('canvas');
            flattened.width = exportCanvas.width;
            flattened.height = exportCanvas.height;
            const ctx = flattened.getContext('2d');
            if (ctx) {
              ctx.fillStyle = jpegBgColor;
              ctx.fillRect(0, 0, flattened.width, flattened.height);
              ctx.drawImage(exportCanvas, 0, 0);
              setPreviewDataUrl(flattened.toDataURL('image/jpeg', jpegQuality));
            }
          }
        } else if (selectedFormat === 'ico') {
          const blob = await generateIcoBlob(canvas, { sizes: selectedIcoSizes });
          if (!cancelled) {
            setEstimatedSize(blob.size);
            setPreviewDataUrl(icoPreviews[256] || icoPreviews[64] || canvas.toDataURL('image/png'));
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Size estimation failed:', err);
          setEstimatedSize(null);
        }
      }
    }

    computeEstimate();
    return () => {
      cancelled = true;
    };
  }, [
    canvas,
    selectedFormat,
    webpQuality,
    webpLossless,
    jpegQuality,
    jpegBgColor,
    pngPreserveAlpha,
    pngBgColor,
    scaleFactor,
    selectedIcoSizes,
    icoPreviews,
  ]);

  // Produce final Blob based on current settings
  const generateFinalBlob = async (): Promise<{ blob: Blob; fullFilename: string }> => {
    let exportCanvas = canvas;
    if (scaleFactor !== 1) {
      exportCanvas = resizeCanvas(
        canvas,
        Math.round(canvas.width * scaleFactor),
        Math.round(canvas.height * scaleFactor)
      );
    }

    const safeBase = (filename.trim() || 'cutout').replace(/[^a-zA-Z0-9_\-]/g, '_');

    if (selectedFormat === 'png') {
      let targetCanvas = exportCanvas;
      if (!pngPreserveAlpha) {
        targetCanvas = document.createElement('canvas');
        targetCanvas.width = exportCanvas.width;
        targetCanvas.height = exportCanvas.height;
        const ctx = targetCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = pngBgColor;
          ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
          ctx.drawImage(exportCanvas, 0, 0);
        }
      }
      const blob = await canvasToPngBlob(targetCanvas);
      return { blob, fullFilename: `${safeBase}.png` };
    }

    if (selectedFormat === 'webp') {
      const q = webpLossless ? 1.0 : webpQuality;
      const blob = await canvasToWebpBlob(exportCanvas, q);
      return { blob, fullFilename: `${safeBase}.webp` };
    }

    if (selectedFormat === 'jpeg') {
      const blob = await canvasToJpegBlob(exportCanvas, jpegQuality, jpegBgColor);
      return { blob, fullFilename: `${safeBase}.jpg` };
    }

    if (selectedFormat === 'ico') {
      const blob = await generateIcoBlob(canvas, { sizes: selectedIcoSizes });
      return { blob, fullFilename: `${safeBase}.ico` };
    }

    const fallbackBlob = await canvasToPngBlob(canvas);
    return { blob: fallbackBlob, fullFilename: `${safeBase}.png` };
  };

  // Primary Action: Save to Device
  const handleSave = async () => {
    triggerHaptic('medium');
    setIsExporting(true);
    setActionSuccess(null);

    try {
      const { blob, fullFilename } = await generateFinalBlob();
      await downloadBlob(blob, fullFilename);
      triggerHaptic('success');
      setActionSuccess('saved');
      setTimeout(() => setActionSuccess(null), 2500);
    } catch (err) {
      triggerHaptic('error');
      console.error('Save failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Action: Share (Windows Share Sheet / Mobile / Desktop Web Share API)
  const handleShare = async () => {
    triggerHaptic('medium');
    setIsExporting(true);
    setActionSuccess(null);

    try {
      const { blob, fullFilename } = await generateFinalBlob();
      const shared = await shareImageBlob(blob, fullFilename);
      if (shared) {
        triggerHaptic('success');
        setActionSuccess('shared');
        setTimeout(() => setActionSuccess(null), 2500);
      }
    } catch (err) {
      triggerHaptic('error');
      console.error('Share failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Action: Copy to Clipboard (Standard across Windows / Mac / Desktop)
  const handleCopyClipboard = async () => {
    triggerHaptic('medium');
    setIsExporting(true);
    setActionSuccess(null);

    try {
      let exportCanvas = canvas;
      if (scaleFactor !== 1) {
        exportCanvas = resizeCanvas(
          canvas,
          Math.round(canvas.width * scaleFactor),
          Math.round(canvas.height * scaleFactor)
        );
      }

      if (!pngPreserveAlpha || selectedFormat === 'jpeg') {
        const bg = selectedFormat === 'jpeg' ? jpegBgColor : pngBgColor;
        const targetCanvas = document.createElement('canvas');
        targetCanvas.width = exportCanvas.width;
        targetCanvas.height = exportCanvas.height;
        const ctx = targetCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
          ctx.drawImage(exportCanvas, 0, 0);
          exportCanvas = targetCanvas;
        }
      }

      const success = await copyImageToClipboard(exportCanvas);
      if (success) {
        triggerHaptic('success');
        setActionSuccess('copied');
        setTimeout(() => setActionSuccess(null), 2500);
      }
    } catch (err) {
      triggerHaptic('error');
      console.error('Copy to clipboard failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const toggleIcoSize = (size: number) => {
    if (selectedIcoSizes.includes(size)) {
      if (selectedIcoSizes.length > 1) {
        setSelectedIcoSizes(selectedIcoSizes.filter((s) => s !== size));
      }
    } else {
      setSelectedIcoSizes([...selectedIcoSizes, size].sort((a, b) => a - b));
    }
  };

  const finalExtension =
    selectedFormat === 'jpeg' ? '.jpg' : selectedFormat === 'ico' ? '.ico' : `.${selectedFormat}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                Save & Share
              </h2>
              <p className="text-xs text-slate-400">
                Choose format, refine compression, and export or share instantly
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 no-scrollbar">
          {/* Filename Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              File Name
            </label>
            <div className="flex items-center rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition">
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="image-filename"
                className="w-full bg-transparent text-white font-mono text-xs sm:text-sm outline-none"
              />
              <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 shrink-0 ml-2">
                {finalExtension}
              </span>
            </div>
          </div>

          {/* Format Selection Tabs */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Save Format
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* PNG */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setSelectedFormat('png');
                }}
                className={`flex flex-col items-start p-3 rounded-2xl border text-left transition cursor-pointer ${
                  selectedFormat === 'png'
                    ? 'border-indigo-500 bg-indigo-950/40 text-white ring-2 ring-indigo-500/30'
                    : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-bold text-sm text-white">PNG</span>
                  {detectedFormat === 'png' && (
                    <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full font-semibold">
                      Original
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 leading-tight">
                  Lossless alpha & crisp edges
                </span>
              </button>

              {/* WebP */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setSelectedFormat('webp');
                }}
                className={`flex flex-col items-start p-3 rounded-2xl border text-left transition cursor-pointer ${
                  selectedFormat === 'webp'
                    ? 'border-indigo-500 bg-indigo-950/40 text-white ring-2 ring-indigo-500/30'
                    : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-bold text-sm text-white">WebP</span>
                  {detectedFormat === 'webp' && (
                    <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full font-semibold">
                      Original
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 leading-tight">
                  Modern web & high compression
                </span>
              </button>

              {/* JPEG */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setSelectedFormat('jpeg');
                }}
                className={`flex flex-col items-start p-3 rounded-2xl border text-left transition cursor-pointer ${
                  selectedFormat === 'jpeg'
                    ? 'border-indigo-500 bg-indigo-950/40 text-white ring-2 ring-indigo-500/30'
                    : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-bold text-sm text-white">JPEG</span>
                  {detectedFormat === 'jpeg' && (
                    <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full font-semibold">
                      Original
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 leading-tight">
                  Universal photo format (Solid BG)
                </span>
              </button>

              {/* ICO */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setSelectedFormat('ico');
                }}
                className={`flex flex-col items-start p-3 rounded-2xl border text-left transition cursor-pointer ${
                  selectedFormat === 'ico'
                    ? 'border-indigo-500 bg-indigo-950/40 text-white ring-2 ring-indigo-500/30'
                    : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-bold text-sm text-white">Icon (.ICO)</span>
                  {detectedFormat === 'ico' && (
                    <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full font-semibold">
                      Original
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 leading-tight">
                  Windows app icon & Favicon
                </span>
              </button>
            </div>
          </div>

          {/* Format Refinement Controls Panel */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
            {/* Format-Specific Controls */}
            {selectedFormat === 'png' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <FileImage className="w-3.5 h-3.5 text-indigo-400" />
                    PNG Export Refinements
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-2 py-0.5 rounded">
                    Lossless 32-bit RGBA
                  </span>
                </div>

                {/* Transparency Toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-850">
                  <div className="text-xs text-slate-300">
                    <span className="font-medium">Background:</span>
                    <span className="text-slate-400 block text-[11px]">
                      {pngPreserveAlpha ? 'Preserve transparency mask' : 'Fill with solid color'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPngPreserveAlpha(true)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                        pngPreserveAlpha
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Transparent
                    </button>
                    <button
                      type="button"
                      onClick={() => setPngPreserveAlpha(false)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                        !pngPreserveAlpha
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Solid Color
                    </button>
                    {!pngPreserveAlpha && (
                      <input
                        type="color"
                        value={pngBgColor}
                        onChange={(e) => setPngBgColor(e.target.value)}
                        className="w-7 h-7 rounded-lg border border-slate-700 bg-transparent cursor-pointer ml-1"
                        title="Pick background color"
                      />
                    )}
                  </div>
                </div>

                {/* Resolution scale */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-850 text-xs">
                  <span className="text-slate-300 font-medium">Export Scale:</span>
                  <div className="flex items-center gap-1.5">
                    {[
                      { label: '0.5×', val: 0.5 },
                      { label: '1× (Original)', val: 1 },
                      { label: '2× (Hi-Res)', val: 2 },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setScaleFactor(opt.val)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono transition cursor-pointer ${
                          scaleFactor === opt.val
                            ? 'bg-indigo-600 text-white font-semibold'
                            : 'bg-slate-850 text-slate-400 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedFormat === 'webp' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    WebP Compression Quality
                  </span>
                  <span className="text-xs font-mono font-bold text-indigo-400">
                    {webpLossless ? '100% (Lossless)' : `${Math.round(webpQuality * 100)}%`}
                  </span>
                </div>

                {/* Presets */}
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: 'Lossless', q: 1.0, lossless: true },
                    { label: 'High (85%)', q: 0.85, lossless: false },
                    { label: 'Balanced (70%)', q: 0.70, lossless: false },
                    { label: 'Small (50%)', q: 0.50, lossless: false },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setWebpQuality(preset.q);
                        setWebpLossless(preset.lossless);
                      }}
                      className={`px-2 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                        (webpLossless && preset.lossless) ||
                        (!webpLossless && !preset.lossless && Math.abs(webpQuality - preset.q) < 0.05)
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'bg-slate-850 text-slate-400 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Slider */}
                {!webpLossless && (
                  <input
                    type="range"
                    min="0.10"
                    max="1.0"
                    step="0.01"
                    value={webpQuality}
                    onChange={(e) => setWebpQuality(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                )}
              </div>
            )}

            {selectedFormat === 'jpeg' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    JPEG Quality & Background Matte
                  </span>
                  <span className="text-xs font-mono font-bold text-indigo-400">
                    {Math.round(jpegQuality * 100)}%
                  </span>
                </div>

                {/* Background color selection (Required for JPEG since no alpha) */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <Palette className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-slate-300">Background Fill (No Alpha in JPEG):</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[
                      { label: 'White', color: '#ffffff' },
                      { label: 'Black', color: '#000000' },
                      { label: 'Dark Slate', color: '#0f172a' },
                    ].map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => setJpegBgColor(c.color)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                          jpegBgColor === c.color
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                    <input
                      type="color"
                      value={jpegBgColor}
                      onChange={(e) => setJpegBgColor(e.target.value)}
                      className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer ml-1"
                      title="Custom fill color"
                    />
                  </div>
                </div>

                {/* Quality Slider */}
                <input
                  type="range"
                  min="0.10"
                  max="1.0"
                  step="0.01"
                  value={jpegQuality}
                  onChange={(e) => setJpegQuality(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
              </div>
            )}

            {selectedFormat === 'ico' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-pink-400" />
                    Selectable Icon Resolutions (.ICO)
                  </span>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelectedIcoSizes([...STANDARD_ICO_SIZES])}
                      className="text-indigo-400 hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-600">•</span>
                    <button
                      type="button"
                      onClick={() => setSelectedIcoSizes([16, 32, 48, 256])}
                      className="text-indigo-400 hover:underline cursor-pointer"
                    >
                      Windows Preset
                    </button>
                  </div>
                </div>

                {/* Size Chips */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {STANDARD_ICO_SIZES.map((size) => {
                    const isSelected = selectedIcoSizes.includes(size);
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => toggleIcoSize(size)}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition cursor-pointer ${
                          isSelected
                            ? 'border-pink-500/50 bg-pink-950/40 text-white'
                            : 'border-slate-800 bg-slate-900/40 text-slate-500 hover:border-slate-700'
                        }`}
                      >
                        {icoPreviews[size] && (
                          <img
                            src={icoPreviews[size]}
                            alt={`${size}px preview`}
                            className="w-6 h-6 object-contain mb-1 drop-shadow"
                          />
                        )}
                        <span className="font-mono text-[11px] font-bold">{size}×{size}</span>
                        <span className="text-[9px] text-slate-400">
                          {size === 16 ? 'Favicon' : size === 32 ? 'Taskbar' : size === 256 ? 'HD Icon' : 'Desktop'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* File Info Bar: Dimensions & Estimated File Size */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span>Output Dimensions:</span>
                <span className="font-mono font-semibold text-slate-200">
                  {Math.round(canvas.width * scaleFactor)}×{Math.round(canvas.height * scaleFactor)}px
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>Estimated Size:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {estimatedSize ? formatBytes(estimatedSize) : 'Calculating...'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Status Feedback Bar */}
        {actionSuccess && (
          <div className="px-5 py-2 bg-emerald-950/80 border-t border-emerald-500/30 flex items-center justify-center gap-2 text-xs font-bold text-emerald-300 animate-in fade-in duration-150">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>
              {actionSuccess === 'saved' && 'Saved to your Downloads folder!'}
              {actionSuccess === 'copied' && 'Copied image to your clipboard!'}
              {actionSuccess === 'shared' && 'Shared successfully!'}
            </span>
          </div>
        )}

        {/* Modal Footer with Save, Share, and Copy to Clipboard */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800 px-5 py-4 bg-slate-950/80">
          {/* Secondary Quick-Share Actions */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Copy to Clipboard (Best Practice Desktop/PWA Shortcut) */}
            <button
              type="button"
              onClick={handleCopyClipboard}
              disabled={isExporting}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3.5 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Copy image directly to system clipboard (Ctrl+C / Paste anywhere)"
            >
              <Copy className="w-3.5 h-3.5 text-indigo-400" />
              <span>Copy Image</span>
            </button>

            {/* Native Windows / System Share Sheet */}
            {canNativeShare && (
              <button
                type="button"
                onClick={handleShare}
                disabled={isExporting}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3.5 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Open Windows Share Charm / System Share"
              >
                <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Share...</span>
              </button>
            )}
          </div>

          {/* Primary Save to Device Button */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="hidden sm:inline-flex rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isExporting}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-600 hover:to-pink-700 transition active:scale-95 disabled:opacity-50 cursor-pointer min-w-[140px]"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Processing...</span>
                </>
              ) : actionSuccess === 'saved' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-200" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Save to Device</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
