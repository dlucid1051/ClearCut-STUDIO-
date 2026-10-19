import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share, PlusSquare, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showDesktopGuide, setShowDesktopGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop direct install flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:from-indigo-600 hover:to-purple-700 transition active:scale-95 cursor-pointer"
        title="Install ClearCut STUDIO as an offline app"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition active:scale-95 cursor-pointer"
          title="Install on iPhone / iPad"
        >
          <Share className="w-3.5 h-3.5 text-indigo-400" />
          <span>Install PWA</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-semibold text-white">Install on iPhone / iPad</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-400">1</span>
                  <span>Tap the <strong className="text-white">Share</strong> button <Share className="inline w-4 h-4 text-indigo-400 mx-0.5" /> in your Safari navigation bar.</span>
                </p>
                <p className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-400">2</span>
                  <span>Scroll down and select <strong className="text-white">Add to Home Screen</strong> <PlusSquare className="inline w-4 h-4 text-emerald-400 mx-0.5" />.</span>
                </p>
                <p className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-400">3</span>
                  <span>Launch from your home screen for full-screen, offline AI editing!</span>
                </p>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-slate-800 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 transition cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop / Chromium fallback when beforeinstallprompt has not fired or is blocked by an iframe preview
  return (
    <>
      <button
        onClick={() => setShowDesktopGuide(true)}
        className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition active:scale-95 cursor-pointer"
        title="Install ClearCut STUDIO as an app"
      >
        <Download className="w-3.5 h-3.5 text-indigo-400" />
        <span>Install App</span>
      </button>

      {showDesktopGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setShowDesktopGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-semibold text-white">Install ClearCut STUDIO</h3>
              <button
                onClick={() => setShowDesktopGuide(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-400">1</span>
                <span>Look at your browser's address bar for the <strong className="text-white">Install icon</strong> (computer monitor with a down arrow).</span>
              </p>
              <p className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-400">2</span>
                <span>Or open your browser menu (<strong className="text-white">&#8942;</strong> or <strong className="text-white">&#8230;</strong>) and select <strong className="text-white">&ldquo;Install ClearCut STUDIO&rdquo;</strong> (or &ldquo;Save and Share &gt; Install App&rdquo;).</span>
              </p>
              <p className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-400">3</span>
                <span>The app runs offline in its own window with dedicated system shortcuts.</span>
              </p>
            </div>
            <button
              onClick={() => setShowDesktopGuide(false)}
              className="mt-6 w-full rounded-xl bg-slate-800 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 transition cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
