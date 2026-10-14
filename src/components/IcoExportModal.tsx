import React, { useState, useEffect } from 'react';
import { X, Download, CheckSquare, Square, Layers, Sparkles, Loader2, Check, Share2 } from 'lucide-react';
import { STANDARD_ICO_SIZES, generateIcoBlob } from '../utils/icoGenerator';
import { canvasToPngBlob, downloadBlob, formatBytes } from '../utils/imageProcessing';
import { triggerHaptic } from '../utils/haptics';

interface IcoExportModalProps {
  canvas: HTMLCanvasElement | null;
  baseFilename: string;
  onClose: () => void;
}

export const IcoExportModal: React.FC<IcoExportModalProps> = ({
  canvas,
  baseFilename,
  onClose,
}) => {
  const [selectedSizes, setSelectedSizes] = useState<number[]>([16, 32, 48, 64, 128, 256]);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [previews, setPreviews] = useState<{ [size: number]: string }>({});
  const [isExporting, setIsExporting] = useState(false);
  const [downloadingSingleSize, setDownloadingSingleSize] = useState<number | null>(null);
  const [icoExportSuccess, setIcoExportSuccess] = useState(false);

  // Generate previews for each size
  useEffect(() => {
    if (!canvas) return;

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

    setPreviews(urls);
  }, [canvas]);

  // Update estimated ICO file size
  useEffect(() => {
    if (!canvas || selectedSizes.length === 0) {
      setEstimatedSize(null);
      return;
    }

    generateIcoBlob(canvas, { sizes: selectedSizes })
      .then((blob) => setEstimatedSize(blob.size))
      .catch(() => setEstimatedSize(null));
  }, [canvas, selectedSizes]);

  const toggleSize = (size: number) => {
    if (selectedSizes.includes(size)) {
      if (selectedSizes.length > 1) {
        setSelectedSizes(selectedSizes.filter((s) => s !== size));
      }
    } else {
      setSelectedSizes([...selectedSizes, size].sort((a, b) => a - b));
    }
  };

  const selectAll = () => setSelectedSizes([...STANDARD_ICO_SIZES]);
  const selectStandardWeb = () => setSelectedSizes([16, 32, 48]);

  const handleDownloadIco = async () => {
    if (!canvas) return;
    triggerHaptic('medium');
    setIsExporting(true);
    setIcoExportSuccess(false);

    try {
      const blob = await generateIcoBlob(canvas, { sizes: selectedSizes });
      const cleanName = baseFilename.replace(/\.[^/.]+$/, '');
      await downloadBlob(blob, `${cleanName}-icon.ico`);
      triggerHaptic('success');
      setIcoExportSuccess(true);
      setTimeout(() => {
        setIcoExportSuccess(false);
      }, 2500);
    } catch (err) {
      triggerHaptic('error');
      console.error('Failed to export ICO:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadSinglePng = async (size: number) => {
    if (!canvas || downloadingSingleSize !== null) return;
    triggerHaptic('medium');
    setDownloadingSingleSize(size);

    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = size;
      offscreen.height = size;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const scale = Math.min(size / canvas.width, size / canvas.height);
      const dw = Math.round(canvas.width * scale);
      const dh = Math.round(canvas.height * scale);
      const dx = Math.round((size - dw) / 2);
      const dy = Math.round((size - dh) / 2);
      ctx.drawImage(canvas, dx, dy, dw, dh);

      const blob = await canvasToPngBlob(offscreen);
      const cleanName = baseFilename.replace(/\.[^/.]+$/, '');
      await downloadBlob(blob, `${cleanName}-${size}x${size}.png`);
      triggerHaptic('success');
    } catch (err) {
      triggerHaptic('error');
      console.error('Failed to download single PNG:', err);
    } finally {
      setDownloadingSingleSize(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-7 shadow-2xl text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Save as Icon (.ico)</h3>
              <p className="text-xs text-slate-400">Windows & Web multi-resolution icon file</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-5 space-y-5">
          {/* Quick select presets */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Bundled Resolutions
            </span>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={selectAll}
                className="text-indigo-400 hover:underline cursor-pointer"
              >
                All Sizes
              </button>
              <span className="text-slate-600">•</span>
              <button
                type="button"
                onClick={selectStandardWeb}
                className="text-indigo-400 hover:underline cursor-pointer"
              >
                Favicon (16-48px)
              </button>
            </div>
          </div>

          {/* Resolutions Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {STANDARD_ICO_SIZES.map((size) => {
              const isChecked = selectedSizes.includes(size);
              return (
                <div
                  key={size}
                  onClick={() => toggleSize(size)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition select-none ${
                    isChecked
                      ? 'border-indigo-500/50 bg-indigo-950/30 text-white'
                      : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                    <div>
                      <span className="font-semibold">{size}×{size}</span>
                      <span className="block text-[10px] text-slate-500">
                        {size <= 32 ? 'Browser tab' : size === 48 ? 'Desktop shortcut' : size <= 128 ? 'Explorer' : 'Large Tile'}
                      </span>
                    </div>
                  </div>

                  {/* Thumbnail */}
                  {previews[size] && (
                    <div className="h-7 w-7 rounded bg-slate-950/80 p-0.5 border border-slate-800 flex items-center justify-center shrink-0">
                      <img
                        src={previews[size]}
                        alt={`${size}px preview`}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Estimated Size & Info */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-xs">
            <span className="text-slate-400">Total ICO Bundle Size:</span>
            <span className="font-mono font-bold text-emerald-400">
              {estimatedSize ? formatBytes(estimatedSize) : 'Calculating...'}
            </span>
          </div>

          {/* Individual PNG download shortcut */}
          <div className="text-xs text-slate-400">
            <span className="block mb-2 font-medium">Or download single icon PNG:</span>
            <div className="flex flex-wrap gap-1.5">
              {[16, 32, 48, 180, 192, 512].map((s) => (
                <button
                  key={s}
                  onClick={() => handleDownloadSinglePng(s)}
                  disabled={downloadingSingleSize !== null}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer disabled:opacity-50"
                >
                  {downloadingSingleSize === s ? (
                    <Loader2 className="w-3 h-3 animate-spin text-pink-400" />
                  ) : null}
                  <span>{s}×{s} {s === 180 ? '(Apple)' : s === 192 ? '(PWA)' : 'PNG'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleDownloadIco}
            disabled={isExporting || selectedSizes.length === 0}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-50 cursor-pointer ${
              icoExportSuccess
                ? 'bg-emerald-600 shadow-emerald-500/25'
                : 'bg-gradient-to-r from-pink-500 to-purple-600 shadow-pink-500/25 hover:from-pink-600 hover:to-purple-700'
            }`}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Packaging {selectedSizes.length} Icon Sizes...</span>
              </>
            ) : icoExportSuccess ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>Saved .ICO File to Downloads!</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download Multi-Size .ICO</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
