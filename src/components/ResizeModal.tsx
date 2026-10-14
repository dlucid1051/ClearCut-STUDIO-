import React, { useState } from 'react';
import { X, Check, Lock, Unlock, Scaling } from 'lucide-react';

interface ResizeModalProps {
  currentWidth: number;
  currentHeight: number;
  onApplyResize: (newWidth: number, newHeight: number) => void;
  onClose: () => void;
}

export const ResizeModal: React.FC<ResizeModalProps> = ({
  currentWidth,
  currentHeight,
  onApplyResize,
  onClose,
}) => {
  const [width, setWidth] = useState<number>(currentWidth);
  const [height, setHeight] = useState<number>(currentHeight);
  const [lockAspect, setLockAspect] = useState<boolean>(true);

  const aspectRatio = currentWidth / currentHeight;

  const handleWidthChange = (val: number) => {
    setWidth(val);
    if (lockAspect && val > 0) {
      setHeight(Math.max(1, Math.round(val / aspectRatio)));
    }
  };

  const handleHeightChange = (val: number) => {
    setHeight(val);
    if (lockAspect && val > 0) {
      setWidth(Math.max(1, Math.round(val * aspectRatio)));
    }
  };

  const handleScalePercent = (percent: number) => {
    const factor = percent / 100;
    const newW = Math.max(1, Math.round(currentWidth * factor));
    const newH = Math.max(1, Math.round(currentHeight * factor));
    setWidth(newW);
    setHeight(newH);
  };

  const handleSetSquare = (size: number) => {
    setWidth(size);
    setHeight(size);
  };

  const handleApply = () => {
    if (width > 0 && height > 0) {
      onApplyResize(width, height);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Scaling className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-white">Resize Image</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Dimension Inputs with Aspect Lock */}
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Width (px)
              </label>
              <input
                type="number"
                min="1"
                max="8192"
                value={width}
                onChange={(e) => handleWidthChange(parseInt(e.target.value) || 1)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-mono text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setLockAspect(!lockAspect)}
              className={`mt-5 rounded-xl border p-2.5 transition cursor-pointer ${
                lockAspect
                  ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400'
                  : 'border-slate-800 bg-slate-950 text-slate-500 hover:text-slate-300'
              }`}
              title={lockAspect ? 'Unlock Aspect Ratio' : 'Lock Aspect Ratio'}
            >
              {lockAspect ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>

            <div className="flex-1 space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Height (px)
              </label>
              <input
                type="number"
                min="1"
                max="8192"
                value={height}
                onChange={(e) => handleHeightChange(parseInt(e.target.value) || 1)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-mono text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Quick Percentage Presets */}
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Scale Percentage
            </span>
            <div className="grid grid-cols-5 gap-1.5">
              {[25, 50, 75, 100, 150].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleScalePercent(pct)}
                  className="rounded-lg border border-slate-800 bg-slate-950/60 py-1.5 text-xs font-medium text-slate-300 hover:border-indigo-500/50 hover:bg-slate-800 transition cursor-pointer"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Quick Icon Square Presets */}
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Icon Size Presets
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {[32, 64, 128, 256, 512, 1024].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => handleSetSquare(sz)}
                  className="rounded-lg border border-slate-800 bg-slate-950/60 py-1.5 text-xs font-mono text-slate-300 hover:border-indigo-500/50 hover:bg-slate-800 transition cursor-pointer"
                >
                  {sz}px
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-2.5 text-xs text-slate-400 flex justify-between">
            <span>Original: {currentWidth}×{currentHeight}</span>
            <span className="font-semibold text-indigo-400">Target: {width}×{height}</span>
          </div>
        </div>

        <div className="mt-6 pt-3 border-t border-slate-800 flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-5 py-2 text-xs font-bold text-white hover:bg-cyan-500 transition shadow active:scale-95 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Apply Resize</span>
          </button>
        </div>
      </div>
    </div>
  );
};
