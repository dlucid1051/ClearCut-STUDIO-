import React, { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react';
import { UploadCloud, Sparkles, X, AlertTriangle, ArrowRight } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

interface OpenImageModalProps {
  isOpen: boolean;
  allowClose: boolean;
  hasActiveProject: boolean;
  onClose: () => void;
  onImageSelected: (file: File | Blob, originalFilename?: string) => void;
}

export const OpenImageModal: React.FC<OpenImageModalProps> = ({
  isOpen,
  allowClose,
  hasActiveProject,
  onClose,
  onImageSelected,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ file: File | Blob; filename: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Reset pending confirmation when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setPendingFile(null);
      setIsDragging(false);
    }
  }, [isOpen]);

  // Keyboard shortcut listener: Escape to close if allowClose is true
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingFile) {
          setPendingFile(null);
        } else if (allowClose) {
          triggerHaptic('tap');
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, allowClose, onClose, pendingFile]);

  // Global paste support (Ctrl+V / Cmd+V)
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleFileAttempt(file, 'pasted-image.png');
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, hasActiveProject]);

  const handleFileAttempt = (file: File | Blob, filename: string) => {
    if (hasActiveProject) {
      // Prompt confirmation before replacing active workspace
      setPendingFile({ file, filename });
    } else {
      triggerHaptic('tap');
      onImageSelected(file, filename);
      onClose();
    }
  };

  const confirmFileReplacement = () => {
    if (pendingFile) {
      triggerHaptic('tap');
      onImageSelected(pendingFile.file, pendingFile.filename);
      setPendingFile(null);
      onClose();
    }
  };

  const cancelFileReplacement = () => {
    setPendingFile(null);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        handleFileAttempt(file, file.name);
      }
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      handleFileAttempt(file, file.name);
      // Reset input value so re-selecting same file triggers change
      e.target.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200 select-none"
      onClick={(e) => {
        // Dismiss when clicking outside if allowClose is enabled and not confirming
        if (e.target === e.currentTarget && allowClose && !pendingFile) {
          triggerHaptic('tap');
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900/98 p-6 sm:p-10 shadow-2xl backdrop-blur-2xl transition-all"
      >
        {/* Top-Right Close Button ("X") */}
        {allowClose && !pendingFile && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap');
              onClose();
            }}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 rounded-full p-2 text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95 cursor-pointer shadow-sm"
            title="Close (Esc)"
            aria-label="Close Open Image modal"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Confirmation State if replacing active project */}
        {pendingFile ? (
          <div className="py-4 text-center animate-in zoom-in-95 duration-150">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-lg">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">
              Replace Current Project?
            </h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
              You are currently editing an image. Opening <span className="font-semibold text-slate-200">&ldquo;{pendingFile.filename}&rdquo;</span> will replace your current workspace and reset your undo history.
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={cancelFileReplacement}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-750 hover:text-white border border-slate-700/80 transition active:scale-95 cursor-pointer"
              >
                Keep Current Image
              </button>
              <button
                type="button"
                onClick={confirmFileReplacement}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 hover:from-indigo-600 hover:to-pink-700 shadow-md shadow-indigo-600/30 transition active:scale-95 cursor-pointer"
              >
                <span>Replace & Open</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Modal Hero Header */}
            <div className="text-center mb-6 sm:mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300 mb-3 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Local Client-Side AI & Offline PWA</span>
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-4xl">
                Open Image <br className="hidden sm:inline" />
                <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Directly in Your Browser
                </span>
              </h2>
              <p className="mt-2.5 text-xs sm:text-sm text-slate-400 max-w-lg mx-auto">
                Strip backgrounds in seconds with local neural network matting. Crop, resize, touch up, and export — 100% private and offline.
              </p>
            </div>

            {/* Main Drag & Drop Card */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`group relative flex flex-col items-center justify-center rounded-2xl sm:rounded-3xl border-2 border-dashed p-6 sm:p-10 text-center transition-all duration-200 cursor-pointer overflow-hidden ${
                isDragging
                  ? 'border-indigo-400 bg-indigo-950/40 ring-4 ring-indigo-500/20 scale-[1.01]'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/90'
              }`}
            >
              {/* Subtle background glow */}
              <div className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition duration-500 bg-gradient-to-b from-indigo-500/5 to-transparent rounded-3xl" />

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Upload Icon circle */}
              <div className="relative mb-4 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600/20 via-purple-600/20 to-pink-600/20 border border-indigo-500/30 text-indigo-400 shadow-xl group-hover:scale-105 group-hover:text-indigo-300 transition duration-200">
                <UploadCloud className="h-8 w-8 sm:h-10 sm:w-10 animate-bounce group-hover:animate-none" />
                <div className="absolute -top-1.5 -right-1.5 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-indigo-500 text-white shadow-md">
                  <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </div>
              </div>

              {/* Call to action */}
              <h3 className="text-base sm:text-lg font-bold text-white mb-1">
                Drag & drop your image here
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mb-3 max-w-sm">
                or <span className="text-indigo-400 font-semibold underline underline-offset-4 group-hover:text-indigo-300">browse files from your device</span>
              </p>

              {/* Shortcuts note */}
              <div className="flex items-center justify-center text-xs text-slate-500">
                <span>Supports clipboard paste (Ctrl+V / ⌘V)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
