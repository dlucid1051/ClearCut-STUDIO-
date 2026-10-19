import React, { useState, useRef, useEffect } from 'react';
import { PWAInstallButton } from './PWAInstallButton';
import {
  Scissors,
  ShieldCheck,
  Cpu,
  Wifi,
  WifiOff,
  HelpCircle,
  X,
  Sparkles,
  ChevronDown,
  Zap,
  Loader2,
  Check,
  Split,
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { triggerHaptic } from '../utils/haptics';

interface HeaderProps {
  hasImage: boolean;
  onReset?: () => void;
  modelQuality: 'isnet_fp16' | 'isnet_quint8';
  setModelQuality: (q: 'isnet_fp16' | 'isnet_quint8') => void;
  onTriggerRemoveBackground?: (quality: 'isnet_fp16' | 'isnet_quint8') => void;
  isProcessingBgRemoval?: boolean;
  hasRemovedBackground?: boolean;
  isComparing?: boolean;
  onToggleCompare?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  hasImage,
  modelQuality,
  setModelQuality,
  onTriggerRemoveBackground,
  isProcessingBgRemoval = false,
  hasRemovedBackground = false,
  isComparing = false,
  onToggleCompare,
}) => {
  const isOnline = useOnlineStatus();
  const [showInfo, setShowInfo] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleSelectModel = (quality: 'isnet_fp16' | 'isnet_quint8') => {
    setIsDropdownOpen(false);
    setModelQuality(quality);
    if (onTriggerRemoveBackground) {
      onTriggerRemoveBackground(quality);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2.5 sm:px-6">
          {/* Logo, Brand & Remove Background Dropdown Button */}
          <div className="flex items-center gap-2.5 sm:gap-4 flex-wrap">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden border border-slate-700/60 bg-slate-900 shadow-md shadow-indigo-500/20 shrink-0">
                <img
                  src="/icon.svg"
                  alt="ClearCut STUDIO"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold tracking-tight text-white sm:text-lg">
                    ClearCut <span className="text-indigo-400">STUDIO</span>
                  </span>
                  <span className="hidden md:inline-flex items-center gap-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                    <Cpu className="w-2.5 h-2.5" /> Client AI
                  </span>
                </div>
                <p className="hidden md:block text-xs text-slate-400">
                  Offline Background Remover & Icon Studio
                </p>
              </div>
            </div>

            {/* Remove Background Dropdown Button (Right of App Name) */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                disabled={isProcessingBgRemoval}
                className={`flex items-center gap-1.5 sm:gap-2 rounded-xl px-3 sm:px-3.5 py-1.5 text-xs font-bold transition active:scale-95 cursor-pointer shadow-md select-none shrink-0 ${
                  isProcessingBgRemoval
                    ? 'bg-slate-800 text-slate-300 border border-slate-700 cursor-wait'
                    : hasImage
                    ? !hasRemovedBackground
                      ? 'bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 text-white shadow-indigo-600/30 hover:from-violet-500 hover:to-purple-500 ring-2 ring-indigo-400/40'
                      : 'bg-slate-850 hover:bg-slate-800 text-slate-200 border border-indigo-500/30 hover:text-white'
                    : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800'
                }`}
                title={
                  !hasImage
                    ? 'Select neural model engine'
                    : !hasRemovedBackground
                    ? 'Remove image background using local client-side AI'
                    : 'Re-run AI background removal with chosen engine'
                }
              >
                {isProcessingBgRemoval ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-300" />
                    <span>Removing BG...</span>
                  </>
                ) : (
                  <>
                    <Sparkles
                      className={`w-3.5 h-3.5 ${
                        hasImage && !hasRemovedBackground
                          ? 'text-amber-300 animate-pulse'
                          : hasRemovedBackground
                          ? 'text-emerald-400'
                          : 'text-indigo-400'
                      }`}
                    />
                    <span>
                      {hasImage
                        ? !hasRemovedBackground
                          ? 'Remove Background'
                          : 'Re-run AI Removal'
                        : 'Remove Background'}
                    </span>
                    <ChevronDown
                      className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${
                        isDropdownOpen ? 'rotate-180 text-white' : ''
                      }`}
                    />
                  </>
                )}
              </button>

              {/* Dropdown Menu of AI Neural Model Engine Options */}
              {isDropdownOpen && (
                <div className="absolute left-0 top-full mt-2 w-72 sm:w-80 rounded-2xl border border-slate-800 bg-slate-900/98 backdrop-blur-xl p-2.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-800/80 mb-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                      <span>AI Neural Model Engine</span>
                    </div>
                    <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 font-mono">
                      ISNet Client AI
                    </span>
                  </div>

                  {/* Option 1: High Precision (FP16) */}
                  <button
                    type="button"
                    onClick={() => handleSelectModel('isnet_fp16')}
                    className={`w-full text-left rounded-xl p-2.5 transition flex items-start gap-3 cursor-pointer group ${
                      modelQuality === 'isnet_fp16'
                        ? 'bg-indigo-600/15 border border-indigo-500/40 text-white'
                        : 'hover:bg-slate-800/70 border border-transparent text-slate-300'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        modelQuality === 'isnet_fp16'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-400 group-hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">High Precision (FP16)</span>
                        {modelQuality === 'isnet_fp16' && (
                          <span className="flex items-center gap-1 text-[10px] text-indigo-300 font-medium bg-indigo-500/20 px-1.5 py-0.5 rounded">
                            <Check className="w-3 h-3 text-indigo-400" />
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        Full-precision edge matting. Highest quality for fine details, hair, and soft edges.
                      </p>
                      {hasImage && (
                        <div className="mt-1 text-[10px] text-indigo-400 font-medium">
                          Click to execute removal with FP16 →
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Option 2: Fast / Low RAM (UINT8) */}
                  <button
                    type="button"
                    onClick={() => handleSelectModel('isnet_quint8')}
                    className={`w-full text-left rounded-xl p-2.5 mt-1 transition flex items-start gap-3 cursor-pointer group ${
                      modelQuality === 'isnet_quint8'
                        ? 'bg-indigo-600/15 border border-indigo-500/40 text-white'
                        : 'hover:bg-slate-800/70 border border-transparent text-slate-300'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        modelQuality === 'isnet_quint8'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-400 group-hover:text-white'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">Fast / Low RAM (UINT8)</span>
                        {modelQuality === 'isnet_quint8' && (
                          <span className="flex items-center gap-1 text-[10px] text-indigo-300 font-medium bg-indigo-500/20 px-1.5 py-0.5 rounded">
                            <Check className="w-3 h-3 text-indigo-400" />
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        8-bit quantized weights (~40MB). 2x faster inference and minimal browser RAM.
                      </p>
                      {hasImage && (
                        <div className="mt-1 text-[10px] text-indigo-400 font-medium">
                          Click to execute removal with UINT8 →
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Compare Toggle Button (Icon Only, Right of Remove Background Button) */}
            {hasImage && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  onToggleCompare?.();
                }}
                className={`flex items-center justify-center rounded-xl p-2 sm:px-2.5 sm:py-2 transition active:scale-95 cursor-pointer shadow-md select-none shrink-0 border ${
                  isComparing
                    ? 'bg-purple-600 text-white border-purple-500 shadow-purple-600/30 ring-2 ring-purple-400/40'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
                }`}
                title={isComparing ? 'Exit Compare View' : 'Compare Before & After (Split View)'}
                aria-label="Toggle Before & After compare view"
              >
                <Split className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Online / Offline indicator badge */}
            <div
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border ${
                isOnline
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
              }`}
              title={isOnline ? 'Connected (Model caches locally)' : 'Offline mode active'}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3 h-3" />
                  <span className="hidden md:inline">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span className="hidden md:inline">Offline</span>
                </>
              )}
            </div>

            {/* Info / Privacy Guarantee */}
            <button
              onClick={() => setShowInfo(true)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition cursor-pointer"
              title="About & Privacy"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* In-App PWA Install Button */}
            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Info & Privacy Modal */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-semibold text-white">100% Local & Private</h3>
              </div>
              <button
                onClick={() => setShowInfo(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-sm text-slate-300">
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3 flex gap-3">
                <Sparkles className="w-5 h-5 shrink-0 text-indigo-400" />
                <p className="text-xs text-indigo-200 leading-relaxed">
                  ClearCut STUDIO uses <strong>client-side ONNX AI segmentation</strong> (@imgly/background-removal) running directly in your web browser via WebAssembly. Your photos <strong>never leave your device</strong>.
                </p>
              </div>

              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span><strong>Zero Cloud Uploads:</strong> Absolute confidentiality for sensitive documents, personal photos, and proprietary assets.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span><strong>Offline PWA:</strong> Powered by a Service Worker that caches app assets and neural models in CacheStorage.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span><strong>Save As & Windows Sharing:</strong> Export in PNG, WebP, JPG, or Windows .ICO with selectable resolutions.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span><strong>Built-in Crop & Resize:</strong> Interactive aspect ratios and custom pixel scaling on HTML5 Canvas.</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => setShowInfo(false)}
              className="mt-6 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/20"
            >
              Continue Editing
            </button>
          </div>
        </div>
      )}
    </>
  );
};
