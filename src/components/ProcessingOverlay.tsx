import React from 'react';
import { AlertCircle, RefreshCw, Cpu } from 'lucide-react';

interface ProcessingOverlayProps {
  progress: number;
  stage: string;
  error?: string | null;
  onRetry?: () => void;
  onUseFallback?: () => void;
  onCancel?: () => void;
}

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({
  progress,
  stage,
  error,
  onRetry,
  onUseFallback,
  onCancel,
}) => {
  // SVG donut geometry
  const size = 116;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(100, Math.max(4, progress));
  const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;

  // Derive active process phase from progress value
  const currentStepIndex =
    clampedProgress >= 90
      ? 3
      : clampedProgress >= 65
      ? 2
      : clampedProgress >= 40
      ? 1
      : 0;

  const processSteps = [
    { label: 'Model', desc: 'Weights' },
    { label: 'Engine', desc: 'Compute' },
    { label: 'Subject', desc: 'Segmentation' },
    { label: 'Matte', desc: 'Alpha' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-[290px] sm:max-w-[310px] rounded-3xl border border-slate-700/60 bg-slate-900/95 p-5 sm:p-6 shadow-2xl shadow-indigo-950/40 text-center text-slate-100 flex flex-col items-center">
        {error ? (
          <div className="space-y-3.5 w-full">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-400">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">AI Processing Notice</h3>
              <p className="text-[11px] text-slate-300 leading-relaxed px-1">
                {error}
              </p>
            </div>

            <div className="pt-1 flex flex-col gap-2 w-full">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2 px-3 text-xs font-semibold text-white hover:bg-indigo-500 transition active:scale-95 cursor-pointer shadow-sm shadow-indigo-600/30"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry AI Matting
                </button>
              )}
              {onUseFallback && (
                <button
                  type="button"
                  onClick={onUseFallback}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/90 py-2 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition active:scale-95 cursor-pointer"
                >
                  <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                  Use Smart Edge Matting
                </button>
              )}
            </div>

            {onCancel && (
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={onCancel}
                  className="text-[11px] text-slate-400 hover:text-white transition cursor-pointer underline underline-offset-4"
                >
                  Dismiss & Return to Image
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center w-full">
            {/* Decent size circular progress donut */}
            <div className="relative flex items-center justify-center w-[116px] h-[116px] my-1">
              <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                className="rotate-[-90deg] origin-center overflow-visible"
              >
                <defs>
                  <linearGradient id="donutProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="50%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#818cf8" floodOpacity="0.4" />
                  </filter>
                </defs>

                {/* Background Ring Track */}
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth={strokeWidth}
                />

                {/* Progress Ring */}
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="url(#donutProgressGradient)"
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  filter="url(#glow)"
                  className="transition-[stroke-dashoffset] duration-300 ease-out"
                />
              </svg>

              {/* Center Donut Label: "working..." and percentage */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none">
                <span className="text-[13px] font-semibold text-slate-100 tracking-wide">
                  working...
                </span>
                <span className="text-[12px] font-mono font-bold text-indigo-400 mt-0.5 tabular-nums">
                  {Math.round(clampedProgress)}%
                </span>
              </div>
            </div>

            {/* Background process status messages */}
            <div className="mt-3.5 w-full">
              <p className="text-xs text-slate-200 font-medium min-h-[34px] flex items-center justify-center text-center px-1 leading-snug">
                {stage || 'Segmenting subject from background...'}
              </p>
            </div>

            {/* Subtle multi-stage process breadcrumbs */}
            <div className="mt-2.5 grid grid-cols-4 gap-1.5 w-full pt-1.5 border-t border-slate-800/80">
              {processSteps.map((step, idx) => {
                const isPast = currentStepIndex > idx;
                const isCurrent = currentStepIndex === idx;

                return (
                  <div
                    key={step.label}
                    className="flex flex-col items-center gap-1 py-1"
                    title={step.desc}
                  >
                    <div
                      className={`h-1.5 w-full rounded-full transition-all duration-300 ${
                        isPast
                          ? 'bg-indigo-500'
                          : isCurrent
                          ? 'bg-gradient-to-r from-indigo-500 to-pink-500 animate-pulse'
                          : 'bg-slate-800'
                      }`}
                    />
                    <span
                      className={`text-[9px] font-semibold uppercase tracking-wider transition-colors ${
                        isCurrent
                          ? 'text-indigo-300 font-bold'
                          : isPast
                          ? 'text-slate-400'
                          : 'text-slate-600'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Compact cancel action */}
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="mt-3 text-[11px] text-slate-400 hover:text-slate-200 transition font-medium py-1 px-3 rounded-lg hover:bg-slate-800/60 cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
