/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { OpenImageModal } from './components/OpenImageModal';
import { ProcessingOverlay } from './components/ProcessingOverlay';
import { EditorWorkspace } from './components/EditorWorkspace';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  loadImage,
  imageToCanvas,
  canvasToPngBlob,
  fallbackSmartBackgroundRemoval,
} from './utils/imageProcessing';
import { triggerHaptic } from './utils/haptics';
import { removeBackground } from '@imgly/background-removal';

export default function App() {
  const [originalFile, setOriginalFile] = useState<File | Blob | null>(null);
  const [originalFilename, setOriginalFilename] = useState<string>('image.png');
  const [originalFileSize, setOriginalFileSize] = useState<number>(0);

  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [initialCutoutCanvas, setInitialCutoutCanvas] = useState<HTMLCanvasElement | null>(null);

  // Open Image modal state - defaults to closed so the main screen and native file picker take precedence
  const [isOpenImageModal, setIsOpenImageModal] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenFilePicker = useCallback(() => {
    triggerHaptic('tap');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [stage, setStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Model Quality
  const [modelQuality, setModelQuality] = useState<'isnet_fp16' | 'isnet_quint8'>('isnet_fp16');
  const [hasRemovedBackground, setHasRemovedBackground] = useState<boolean>(false);
  const [isComparing, setIsComparing] = useState<boolean>(false);

  // Pending resolver callback ref for when AI processing completes or uses fallback
  const pendingResolveRef = useRef<((canvas: HTMLCanvasElement | null) => void) | null>(null);
  const currentWorkingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorRemoveBgTriggerRef = useRef<((quality?: 'isnet_fp16' | 'isnet_quint8') => void) | null>(null);

  const processImageWithAi = useCallback(
    async (sourceCanvas: HTMLCanvasElement, qualityMode: 'isnet_fp16' | 'isnet_quint8') => {
      setIsProcessing(true);
      setError(null);
      setProgress(6);
      setStage('Preparing image data for neural matting...');

      try {
        const inputBlob = await canvasToPngBlob(sourceCanvas);
        const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
        let resultBlob: Blob;

        // Track monotonic progress across sequential sub-processes so progress never resets backwards
        let monotonicProgress = 6;

        const handleProgressEvent = (key: string, current: number, total: number) => {
          const ratio = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0.5;
          let stageProgress = 10;

          if (key.includes('fetch') || key.includes('download')) {
            // Stage 1: Model weights & asset loading
            stageProgress = 10 + Math.round(ratio * 35);
            if (total > 0 && current > 0) {
              setStage(`Downloading neural model weights (${Math.round(ratio * 100)}%)...`);
            } else {
              setStage('Loading neural model weights from cache...');
            }
          } else if (key.includes('init') || key.includes('compile') || key.includes('session')) {
            // Stage 2: Hardware acceleration runtime initialization
            stageProgress = 45 + Math.round(ratio * 20);
            setStage('Initializing neural compute pipeline (WebGPU/WASM)...');
          } else if (key.includes('compute') || key.includes('inference') || key.includes('segment')) {
            // Stage 3: Foreground segmentation neural inference
            stageProgress = 65 + Math.round(ratio * 23);
            setStage('Scanning pixels & segmenting foreground subject...');
          } else {
            // Stage 4: Alpha matting & boundary feathering
            stageProgress = 88 + Math.round(ratio * 8);
            setStage('Refining boundary edges & alpha transparency...');
          }

          monotonicProgress = Math.min(97, Math.max(monotonicProgress, stageProgress));
          setProgress(monotonicProgress);
        };

        try {
          resultBlob = await removeBackground(inputBlob, {
            model: qualityMode,
            device: hasWebGpu ? 'gpu' : 'cpu',
            progress: handleProgressEvent,
          });
        } catch (primaryErr) {
          // If GPU or primary inference fails, retry with CPU engine
          setStage('Switching to CPU inference engine...');
          resultBlob = await removeBackground(inputBlob, {
            model: qualityMode,
            device: 'cpu',
            progress: handleProgressEvent,
          });
        }

        setProgress(98);
        setStage('Rendering high-resolution transparent cutout...');

        const resultImg = await loadImage(resultBlob);
        const resultCanvas = imageToCanvas(resultImg);

        setProgress(100);
        setIsProcessing(false);
        if (pendingResolveRef.current) {
          pendingResolveRef.current(resultCanvas);
          pendingResolveRef.current = null;
        }
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : String(err);

        setError(
          `Local AI model execution failed (${errMessage.slice(0, 100)}). You can retry or use the smart edge matting fallback.`
        );
      }
    },
    []
  );

  const handleImageSelected = useCallback(
    async (file: File | Blob, filename = 'image.png') => {
      setOriginalFile(file);
      setOriginalFilename(filename);
      setOriginalFileSize(file.size || 500 * 1024);
      setHasRemovedBackground(false);
      setError(null);

      try {
        const img = await loadImage(file);
        setOriginalImage(img);
        const canvas = imageToCanvas(img);
        setInitialCutoutCanvas(canvas);
        setIsOpenImageModal(false);
        // Note: Image opens immediately in the viewer without forcing background removal
      } catch (err) {
        console.error('Failed to load selected image:', err);
        setError('Could not decode the selected image file. Please try another JPG or PNG.');
      }
    },
    []
  );

  const handleRemoveBackgroundRequest = useCallback(
    (sourceCanvas: HTMLCanvasElement, qualityOverride?: 'isnet_fp16' | 'isnet_quint8'): Promise<HTMLCanvasElement | null> => {
      currentWorkingCanvasRef.current = sourceCanvas;
      const targetQuality = qualityOverride || modelQuality;

      return new Promise<HTMLCanvasElement | null>((resolve) => {
        pendingResolveRef.current = (resultCanvas) => {
          if (resultCanvas) {
            setHasRemovedBackground(true);
          }
          resolve(resultCanvas);
        };
        processImageWithAi(sourceCanvas, targetQuality);
      });
    },
    [modelQuality, processImageWithAi]
  );

  const handleRetryAi = () => {
    if (currentWorkingCanvasRef.current) {
      processImageWithAi(currentWorkingCanvasRef.current, modelQuality);
    }
  };

  const handleUseFallback = () => {
    const targetCanvas = currentWorkingCanvasRef.current || (originalImage ? imageToCanvas(originalImage) : null);
    if (!targetCanvas) return;
    setIsProcessing(true);
    setStage('Running smart edge-matting algorithm...');
    setTimeout(() => {
      try {
        const fallbackCanvas = fallbackSmartBackgroundRemoval(targetCanvas);
        setIsProcessing(false);
        setError(null);
        setHasRemovedBackground(true);
        if (pendingResolveRef.current) {
          pendingResolveRef.current(fallbackCanvas);
          pendingResolveRef.current = null;
        }
      } catch (err) {
        console.error('Fallback failed:', err);
        setError('Failed to extract foreground with fallback.');
        setIsProcessing(false);
      }
    }, 100);
  };

  const handleCancelProcessing = () => {
    setIsProcessing(false);
    setError(null);
    if (pendingResolveRef.current) {
      pendingResolveRef.current(null);
      pendingResolveRef.current = null;
    }
  };

  const handleReset = () => {
    setOriginalFile(null);
    setOriginalFilename('image.png');
    setOriginalFileSize(0);
    setOriginalImage(null);
    setInitialCutoutCanvas(null);
    setHasRemovedBackground(false);
    setIsProcessing(false);
    setError(null);
    setProgress(0);
    setStage('');
    setIsComparing(false);
    setIsOpenImageModal(false);
    if (pendingResolveRef.current) {
      pendingResolveRef.current(null);
      pendingResolveRef.current = null;
    }
    currentWorkingCanvasRef.current = null;
    editorRemoveBgTriggerRef.current = null;
  };

  // Global paste support (Ctrl+V / Cmd+V) to open image directly from clipboard
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            triggerHaptic('tap');
            handleImageSelected(file, 'pasted-image.png');
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleImageSelected]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Hidden Native File Picker Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleImageSelected(file, file.name);
          }
          e.target.value = '';
        }}
        className="hidden"
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      {/* Top Navigation & App Bar */}
      <Header
        hasImage={!!originalImage}
        onReset={handleReset}
        modelQuality={modelQuality}
        setModelQuality={setModelQuality}
        onTriggerRemoveBackground={(quality) => {
          setModelQuality(quality);
          if (editorRemoveBgTriggerRef.current) {
            editorRemoveBgTriggerRef.current(quality);
          }
        }}
        isProcessingBgRemoval={isProcessing}
        hasRemovedBackground={hasRemovedBackground}
        isComparing={isComparing}
        onToggleCompare={() => setIsComparing((prev) => !prev)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        <EditorWorkspace
          originalImage={originalImage}
          initialCutoutCanvas={initialCutoutCanvas}
          originalFilename={originalFilename}
          originalFileSize={originalFileSize}
          onReset={handleReset}
          onRemoveBackground={handleRemoveBackgroundRequest}
          isProcessingBgRemoval={isProcessing}
          registerRemoveBgTrigger={(fn) => {
            editorRemoveBgTriggerRef.current = fn;
          }}
          isComparing={isComparing}
          onToggleCompare={() => setIsComparing((prev) => !prev)}
          onOpenImageClick={handleOpenFilePicker}
          onImageDropped={handleImageSelected}
        />
      </main>

      {/* Open Image Modal Dialog */}
      <OpenImageModal
        isOpen={isOpenImageModal}
        allowClose={Boolean(originalImage)}
        hasActiveProject={Boolean(originalImage)}
        onClose={() => setIsOpenImageModal(false)}
        onImageSelected={handleImageSelected}
      />

      {/* Processing Loader & Error Overlay */}
      {isProcessing && (
        <ProcessingOverlay
          progress={progress}
          stage={stage}
          error={error}
          onRetry={handleRetryAi}
          onUseFallback={handleUseFallback}
          onCancel={handleCancelProcessing}
        />
      )}

      {/* Offline Status Toast */}
      <OfflineIndicator />
    </div>
  );
}
