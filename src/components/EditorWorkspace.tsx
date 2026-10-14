/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Download,
  FolderOpen,
  ImagePlus,
  Crop,
  Scaling,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Sparkles,
  Split,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Camera,
  Film,
} from 'lucide-react';
import {
  CropRect,
  cropCanvas,
  resizeCanvas,
  rotateCanvas,
  flipCanvas,
  cloneCanvas,
  canvasToPngBlob,
  downloadBlob,
  copyImageToClipboard,
} from '../utils/imageProcessing';
import { triggerHaptic } from '../utils/haptics';
import { CropOverlay } from './CropOverlay';
import { ResizeModal } from './ResizeModal';
import { SaveAsModal } from './SaveAsModal';
import { SpriteSlideshowModal } from './SpriteSlideshowModal';
import { BumpOutToolbar, MaskToolMode } from './BumpOutToolbar';
import { RightSelectionBump, SelectionToolMode } from './RightSelectionBump';
import { SelectionOverlay } from './SelectionOverlay';
import {
  SelectionShapeType,
  ShapeRect,
  SelectionData,
  floodFillSelection,
  featherMask,
  rasterizeShapeSelection,
  applyDeleteSelection,
  extractSelectionCanvas,
} from '../utils/selectionProcessing';
import {
  createOriginalCanvas,
  applyEraserStroke,
  applyRestoreStroke,
} from '../utils/maskTouchup';

function createBlankCanvas(width = 800, height = 600): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, width, height);
  }
  return c;
}

interface EditorWorkspaceProps {
  originalImage?: HTMLImageElement | null;
  initialCutoutCanvas?: HTMLCanvasElement | null;
  originalFilename?: string;
  originalFileSize?: number;
  onReset: () => void;
  onRemoveBackground?: (sourceCanvas: HTMLCanvasElement, qualityOverride?: 'isnet_fp16' | 'isnet_quint8') => Promise<HTMLCanvasElement | null>;
  isProcessingBgRemoval?: boolean;
  registerRemoveBgTrigger?: (triggerFn: (quality?: 'isnet_fp16' | 'isnet_quint8') => void) => void;
  isComparing?: boolean;
  onToggleCompare?: () => void;
  onOpenImageClick?: () => void;
}

type BackgroundMode = 'checker-dark' | 'checker-light' | 'white' | 'dark' | 'custom' | 'split';
type ActiveTab = 'crop' | 'resize' | 'transform';

interface HistoryItem {
  cutout: HTMLCanvasElement;
  original: HTMLCanvasElement;
}

export const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({
  originalImage,
  initialCutoutCanvas,
  originalFilename = 'image.png',
  originalFileSize = 500 * 1024,
  onReset,
  onRemoveBackground,
  isProcessingBgRemoval = false,
  registerRemoveBgTrigger,
  isComparing,
  onToggleCompare,
  onOpenImageClick,
}) => {
  const hasImage = Boolean(originalImage && initialCutoutCanvas);

  // Current working cutout canvas state
  const [currentCanvas, setCurrentCanvas] = useState<HTMLCanvasElement>(() =>
    initialCutoutCanvas ? cloneCanvas(initialCutoutCanvas) : createBlankCanvas()
  );

  // Aligned companion original image canvas for pixel restoration
  const [currentOriginalCanvas, setCurrentOriginalCanvas] = useState<HTMLCanvasElement>(() =>
    originalImage && initialCutoutCanvas
      ? createOriginalCanvas(originalImage, initialCutoutCanvas.width, initialCutoutCanvas.height)
      : createBlankCanvas()
  );

  // Background removal state indicator
  const [hasRemovedBackground, setHasRemovedBackground] = useState<boolean>(false);

  // History stack for Undo / Redo (stores synchronized cutout and original canvases)
  const [history, setHistory] = useState<HistoryItem[]>(() => [
    {
      cutout: initialCutoutCanvas ? cloneCanvas(initialCutoutCanvas) : createBlankCanvas(),
      original:
        originalImage && initialCutoutCanvas
          ? createOriginalCanvas(originalImage, initialCutoutCanvas.width, initialCutoutCanvas.height)
          : createBlankCanvas(),
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Synchronize state when initialCutoutCanvas changes
  useEffect(() => {
    if (initialCutoutCanvas && originalImage) {
      const cloned = cloneCanvas(initialCutoutCanvas);
      const orig = createOriginalCanvas(originalImage, initialCutoutCanvas.width, initialCutoutCanvas.height);
      setCurrentCanvas(cloned);
      setCurrentOriginalCanvas(orig);
      setHistory([{ cutout: cloneCanvas(cloned), original: cloneCanvas(orig) }]);
      setHistoryIndex(0);
      setZoomLevel(1);
      setPanOffset({ x: 0, y: 0 });
      setActiveSelection(null);
      lastWandSeedRef.current = null;
      rawWandMaskRef.current = null;
    }
  }, [initialCutoutCanvas, originalImage]);

  // Mask Refinement bump-out tool state (Off, Eraser, Restore Brush)
  const [toolMode, setToolMode] = useState<MaskToolMode>('off');
  const [brushSize, setBrushSize] = useState<number>(28);
  const [brushHardness, setBrushHardness] = useState<number>(100);
  const [cursorPos, setCursorPos] = useState<{
    canvasX: number;
    canvasY: number;
    viewportX: number;
    viewportY: number;
    displayDiameter: number;
  } | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Right Edge Selection Bump tool state (Off, Magic Wand, Shape Selection)
  const [selectionToolMode, setSelectionToolMode] = useState<SelectionToolMode>('off');
  const [wandTolerance, setWandTolerance] = useState<number>(32);
  const [wandFeather, setWandFeather] = useState<number>(0);
  const lastWandSeedRef = useRef<{ x: number; y: number } | null>(null);
  const rawWandMaskRef = useRef<Uint8Array | null>(null);
  const [activeSelectionShape, setActiveSelectionShape] = useState<SelectionShapeType>('rect');
  const [shapeRect, setShapeRect] = useState<ShapeRect>(() => {
    const initW = Math.min(600, Math.round((currentCanvas.width || 800) * 0.5));
    const initH = initW;
    return {
      x: Math.round(((currentCanvas.width || 800) - initW) / 2),
      y: Math.round(((currentCanvas.height || 600) - initH) / 2),
      width: initW,
      height: initH,
    };
  });
  const [activeSelection, setActiveSelection] = useState<SelectionData | null>(null);
  const [isSelectionInverted, setIsSelectionInverted] = useState<boolean>(false);

  // Background and Preview settings
  const [bgMode, setBgMode] = useState<BackgroundMode>('checker-dark');
  const [customBgColor, setCustomBgColor] = useState<string>('#3b82f6');
  const [splitPos, setSplitPos] = useState<number>(50); // percentage 0 to 100
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 0.25 to 5.0
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Notifications
  const [toastNotification, setToastNotification] = useState<{
    id: number;
    title: string;
    message: string;
    type: 'loading' | 'success' | 'error';
  } | null>(null);

  const showToast = useCallback(
    (title: string, message: string, type: 'loading' | 'success' | 'error', durationMs = 3200) => {
      const id = Date.now();
      setToastNotification({ id, title, message, type });
      if (type !== 'loading') {
        setTimeout(() => {
          setToastNotification((curr) => (curr?.id === id ? null : curr));
        }, durationMs);
      }
    },
    []
  );

  // Active Bottom Thumb Dock Tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('crop');

  // Modals & Active Overlays
  const [isCropping, setIsCropping] = useState<boolean>(false);
  const [activeCropRect, setActiveCropRect] = useState<CropRect | null>(null);
  const [showResizeModal, setShowResizeModal] = useState<boolean>(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState<boolean>(false);
  const [slideshowConfig, setSlideshowConfig] = useState<{
    frameWidth: number;
    frameHeight: number;
    col: number;
    row: number;
    originType: 'crop' | 'shape';
  } | null>(null);

  // References
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportDims, setViewportDims] = useState<{ width: number; height: number }>({ width: 800, height: 600 });
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Handlers to open sprite slideshow from crop or selection
  const handleOpenCropSlideshow = useCallback(() => {
    triggerHaptic('tap');
    const fw = activeCropRect ? activeCropRect.width : Math.round(currentCanvas.width * 0.25);
    const fh = activeCropRect ? activeCropRect.height : fw;
    const cx = activeCropRect ? activeCropRect.x : 0;
    const cy = activeCropRect ? activeCropRect.y : 0;
    const col = Math.floor(cx / Math.max(1, fw));
    const row = Math.floor(cy / Math.max(1, fh));
    setSlideshowConfig({
      frameWidth: fw,
      frameHeight: fh,
      col,
      row,
      originType: 'crop',
    });
  }, [activeCropRect, currentCanvas.width]);

  const handleOpenSelectionSlideshow = useCallback(() => {
    triggerHaptic('tap');
    const fw = shapeRect.width;
    const fh = shapeRect.height;
    const col = Math.floor(shapeRect.x / Math.max(1, fw));
    const row = Math.floor(shapeRect.y / Math.max(1, fh));
    setSlideshowConfig({
      frameWidth: fw,
      frameHeight: fh,
      col,
      row,
      originType: 'shape',
    });
  }, [shapeRect]);

  const handleSelectSlideshowFrame = useCallback(
    (frameX: number, frameY: number) => {
      if (slideshowConfig?.originType === 'crop') {
        setActiveCropRect((prev) => (prev ? { ...prev, x: frameX, y: frameY } : null));
      } else if (slideshowConfig?.originType === 'shape') {
        setShapeRect((prev) => ({
          ...prev,
          x: frameX,
          y: frameY,
        }));
      }
    },
    [slideshowConfig]
  );

  // Camera screenshot shutter state
  const [isShutterFlashing, setIsShutterFlashing] = useState<boolean>(false);

  // Active Selection Information for selection-only screenshot
  const activeSelectionDetails = useMemo(() => {
    if (!hasImage) return null;

    // 1. Crop Overlay active
    if (isCropping && activeCropRect) {
      const w = Math.round(Math.max(1, activeCropRect.width));
      const h = Math.round(Math.max(1, activeCropRect.height));
      return {
        type: 'crop' as const,
        bounds: {
          minX: Math.round(activeCropRect.x),
          minY: Math.round(activeCropRect.y),
          maxX: Math.round(activeCropRect.x + activeCropRect.width),
          maxY: Math.round(activeCropRect.y + activeCropRect.height),
        },
        width: w,
        height: h,
        label: `Crop (${w}×${h})`,
        mask: null,
        isInverted: false,
      };
    }

    // 2. Shape Selection Tool active
    if (selectionToolMode === 'shape') {
      const normX = Math.max(0, Math.min(currentCanvas.width - 1, Math.round(Math.min(shapeRect.x, shapeRect.x + shapeRect.width))));
      const normY = Math.max(0, Math.min(currentCanvas.height - 1, Math.round(Math.min(shapeRect.y, shapeRect.y + shapeRect.height))));
      const normW = Math.max(1, Math.min(currentCanvas.width - normX, Math.round(Math.abs(shapeRect.width))));
      const normH = Math.max(1, Math.min(currentCanvas.height - normY, Math.round(Math.abs(shapeRect.height))));

      const raster = rasterizeShapeSelection(
        currentCanvas.width,
        currentCanvas.height,
        activeSelectionShape,
        shapeRect
      );

      const w = isSelectionInverted ? currentCanvas.width : normW;
      const h = isSelectionInverted ? currentCanvas.height : normH;

      return {
        type: 'shape' as const,
        bounds: isSelectionInverted
          ? { minX: 0, minY: 0, maxX: currentCanvas.width, maxY: currentCanvas.height }
          : { minX: normX, minY: normY, maxX: normX + normW, maxY: normY + normH },
        width: w,
        height: h,
        label: `${activeSelectionShape.toUpperCase()} (${w}×${h})`,
        mask: raster.mask,
        isInverted: isSelectionInverted,
      };
    }

    // 3. Magic Wand Selection Tool active
    if (selectionToolMode === 'wand' && activeSelection && activeSelection.pixelCount > 0) {
      const b = activeSelection.bounds;
      const normMinX = Math.max(0, Math.min(currentCanvas.width - 1, b.minX));
      const normMinY = Math.max(0, Math.min(currentCanvas.height - 1, b.minY));
      const normMaxX = Math.max(normMinX + 1, Math.min(currentCanvas.width, b.maxX + 1));
      const normMaxY = Math.max(normMinY + 1, Math.min(currentCanvas.height, b.maxY + 1));
      const w = isSelectionInverted ? currentCanvas.width : (normMaxX - normMinX);
      const h = isSelectionInverted ? currentCanvas.height : (normMaxY - normMinY);

      return {
        type: 'wand' as const,
        bounds: isSelectionInverted
          ? { minX: 0, minY: 0, maxX: currentCanvas.width, maxY: currentCanvas.height }
          : { minX: normMinX, minY: normMinY, maxX: normMaxX, maxY: normMaxY },
        width: w,
        height: h,
        label: `Wand (${w}×${h})`,
        mask: activeSelection.mask,
        isInverted: isSelectionInverted,
      };
    }

    return null;
  }, [
    hasImage,
    isCropping,
    activeCropRect,
    selectionToolMode,
    shapeRect,
    activeSelectionShape,
    activeSelection,
    isSelectionInverted,
    currentCanvas.width,
    currentCanvas.height,
  ]);

  // Capture screenshot: captures selection only when active selection exists, or full image otherwise
  const handleCaptureScreenshot = useCallback(async () => {
    if (!hasImage) return;

    // Subtle audio shutter click
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(160, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
      }
    } catch {
      // AudioContext unavailable or blocked by browser policy
    }

    triggerHaptic('medium');
    setIsShutterFlashing(true);
    setTimeout(() => setIsShutterFlashing(false), 220);

    try {
      const sourceImg =
        bgMode === 'split' && previewCanvasRef.current ? previewCanvasRef.current : currentCanvas;
      let captureCanvas: HTMLCanvasElement | null = null;
      let isSelectionScreenshot = false;
      let captureWidth = currentCanvas.width;
      let captureHeight = currentCanvas.height;

      if (activeSelectionDetails) {
        // Capture active selection area only
        captureCanvas = extractSelectionCanvas({
          sourceCanvas: sourceImg,
          mask: activeSelectionDetails.mask,
          bounds: activeSelectionDetails.bounds,
          isInverted: activeSelectionDetails.isInverted,
          bgMode,
          customBgColor,
        });

        if (captureCanvas) {
          isSelectionScreenshot = true;
          captureWidth = captureCanvas.width;
          captureHeight = captureCanvas.height;
        }
      }

      if (!captureCanvas) {
        // Build full image screenshot canvas matching active background and composition
        captureCanvas = document.createElement('canvas');
        captureCanvas.width = currentCanvas.width;
        captureCanvas.height = currentCanvas.height;
        const ctx = captureCanvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context unavailable');

        // If background mode is non-transparent solid color, fill background
        if (bgMode === 'white') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, captureCanvas.width, captureCanvas.height);
        } else if (bgMode === 'dark') {
          ctx.fillStyle = '#020617';
          ctx.fillRect(0, 0, captureCanvas.width, captureCanvas.height);
        } else if (bgMode === 'custom') {
          ctx.fillStyle = customBgColor;
          ctx.fillRect(0, 0, captureCanvas.width, captureCanvas.height);
        }

        ctx.drawImage(sourceImg, 0, 0);
      }

      const pngBlob = await canvasToPngBlob(captureCanvas);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const timeTag = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const base = originalFilename.replace(/\.[^/.]+$/, '') || 'image';
      const screenshotFilename = isSelectionScreenshot
        ? `${base}-selection-${captureWidth}x${captureHeight}-${timeTag}.png`
        : `${base}-screenshot-${timeTag}.png`;

      await downloadBlob(pngBlob, screenshotFilename);

      let copied = false;
      try {
        copied = await copyImageToClipboard(captureCanvas);
      } catch {
        copied = false;
      }

      triggerHaptic('success');
      showToast(
        isSelectionScreenshot ? 'Selection Screenshot Captured!' : 'Screenshot Captured!',
        copied
          ? `Saved ${screenshotFilename} (${captureWidth}×${captureHeight}) & copied to clipboard.`
          : `Saved ${screenshotFilename} (${captureWidth}×${captureHeight}).`,
        'success',
        3000
      );
    } catch (err) {
      console.error('Failed to capture screenshot:', err);
      triggerHaptic('error');
      showToast('Capture Failed', 'Could not generate screenshot of image.', 'error');
    }
  }, [hasImage, currentCanvas, bgMode, customBgColor, originalFilename, activeSelectionDetails, showToast]);

  // Update history when canvas changes (preserves both cutout and original canvases)
  const pushNewState = useCallback(
    (newCutout: HTMLCanvasElement, newOriginal?: HTMLCanvasElement) => {
      const orig = newOriginal ? cloneCanvas(newOriginal) : cloneCanvas(currentOriginalCanvas);
      const updatedHistory = history.slice(0, historyIndex + 1);
      updatedHistory.push({
        cutout: cloneCanvas(newCutout),
        original: orig,
      });
      setHistory(updatedHistory);
      setHistoryIndex(updatedHistory.length - 1);
      setCurrentCanvas(newCutout);
      if (newOriginal) {
        setCurrentOriginalCanvas(orig);
      }
    },
    [history, historyIndex, currentOriginalCanvas]
  );

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      setCurrentCanvas(cloneCanvas(history[prevIdx].cutout));
      setCurrentOriginalCanvas(cloneCanvas(history[prevIdx].original));
      triggerHaptic('light');
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setCurrentCanvas(cloneCanvas(history[nextIdx].cutout));
      setCurrentOriginalCanvas(cloneCanvas(history[nextIdx].original));
      triggerHaptic('light');
    }
  };

  const handleTriggerRemoveBackground = useCallback(
    async (overrideQuality?: 'isnet_fp16' | 'isnet_quint8') => {
      if (!onRemoveBackground || isProcessingBgRemoval) return;
      triggerHaptic('medium');
      try {
        const resultCanvas = await onRemoveBackground(currentCanvas, overrideQuality);
        if (resultCanvas) {
          triggerHaptic('success');
          // Push the newly generated cutout canvas onto history, retaining companion original
          pushNewState(resultCanvas, currentOriginalCanvas);
          setHasRemovedBackground(true);
          showToast(
            'Background Removed',
            'Foreground extracted with AI. Use erase/restore brush or Undo anytime.',
            'success'
          );
        }
      } catch (err) {
        console.error('Error removing background:', err);
      }
    },
    [onRemoveBackground, isProcessingBgRemoval, currentCanvas, currentOriginalCanvas, pushNewState, showToast]
  );

  useEffect(() => {
    if (registerRemoveBgTrigger) {
      registerRemoveBgTrigger(handleTriggerRemoveBackground);
    }
  }, [registerRemoveBgTrigger, handleTriggerRemoveBackground]);

  // Synchronize compare state from header title bar button with local viewport bgMode
  useEffect(() => {
    if (isComparing !== undefined) {
      if (isComparing && bgMode !== 'split') {
        setBgMode('split');
      } else if (!isComparing && bgMode === 'split') {
        setBgMode('checker-dark');
      }
    }
  }, [isComparing]);



  // Keep track of viewport container dimensions for crop overlay calculations
  useEffect(() => {
    const updateDims = () => {
      if (viewportRef.current) {
        setViewportDims({
          width: viewportRef.current.clientWidth,
          height: viewportRef.current.clientHeight,
        });
      }
    };
    updateDims();
    window.addEventListener('resize', updateDims);
    return () => window.removeEventListener('resize', updateDims);
  }, []);

  // Multi-touch gestures (Pinch to zoom & two-finger drag to pan/move)
  // Track active touches ref
  const touchStateRef = useRef<{
    isGesturing: boolean;
    initialDistance: number;
    initialZoom: number;
    initialCenter: { x: number; y: number };
    initialPan: { x: number; y: number };
  }>({
    isGesturing: false,
    initialDistance: 0,
    initialZoom: 1,
    initialCenter: { x: 0, y: 0 },
    initialPan: { x: 0, y: 0 },
  });

  // Attach native non-passive touch listeners to viewportRef for reliable pinch & two-finger drag
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const getTouchDist = (t1: Touch, t2: Touch) => {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.hypot(dx, dy);
    };

    const getTouchCenter = (t1: Touch, t2: Touch) => {
      return {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Cancel single-finger drawing if active
        if (isDrawingRef.current) {
          isDrawingRef.current = false;
          lastPointRef.current = null;
        }

        e.preventDefault();
        const dist = getTouchDist(e.touches[0], e.touches[1]);
        const center = getTouchCenter(e.touches[0], e.touches[1]);

        touchStateRef.current = {
          isGesturing: true,
          initialDistance: dist,
          initialZoom: zoomLevel,
          initialCenter: center,
          initialPan: { ...panOffset },
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchStateRef.current.isGesturing) {
        e.preventDefault();
        const dist = getTouchDist(e.touches[0], e.touches[1]);
        const center = getTouchCenter(e.touches[0], e.touches[1]);

        const { initialDistance, initialZoom, initialCenter, initialPan } = touchStateRef.current;

        // 1. Pinch to zoom calculation
        if (initialDistance > 0) {
          const scaleMultiplier = dist / initialDistance;
          const nextZoom = Math.max(0.3, Math.min(6.0, Number((initialZoom * scaleMultiplier).toFixed(3))));
          setZoomLevel(nextZoom);
        }

        // 2. Two fingers drag to move (pan) calculation
        const deltaX = center.x - initialCenter.x;
        const deltaY = center.y - initialCenter.y;
        setPanOffset({
          x: Math.round(initialPan.x + deltaX),
          y: Math.round(initialPan.y + deltaY),
        });
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && touchStateRef.current.isGesturing) {
        touchStateRef.current.isGesturing = false;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // Zoom with Ctrl key (standard for trackpad pinch-to-zoom on laptops/tablets) or when off tool mode
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomDelta = e.deltaY < 0 ? 0.1 : -0.1;
        setZoomLevel((z) => Math.max(0.3, Math.min(6.0, Number((z + zoomDelta).toFixed(2)))));
      }
    };

    // Passive: false to prevent browser default pinch/zoom on the whole web page
    viewport.addEventListener('touchstart', handleTouchStart, { passive: false });
    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewport.addEventListener('touchend', handleTouchEnd, { passive: false });
    viewport.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    viewport.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      viewport.removeEventListener('touchstart', handleTouchStart);
      viewport.removeEventListener('touchmove', handleTouchMove);
      viewport.removeEventListener('touchend', handleTouchEnd);
      viewport.removeEventListener('touchcancel', handleTouchEnd);
      viewport.removeEventListener('wheel', handleWheel);
    };
  }, [zoomLevel, panOffset]);

  // Draw current image onto the preview canvas
  useEffect(() => {
    const preview = previewCanvasRef.current;
    if (!preview) return;

    preview.width = currentCanvas.width;
    preview.height = currentCanvas.height;
    const ctx = preview.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, preview.width, preview.height);

    if (bgMode === 'split') {
      const splitPx = (preview.width * splitPos) / 100;

      // Draw original on left
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitPx, preview.height);
      ctx.clip();
      ctx.drawImage(currentOriginalCanvas, 0, 0, preview.width, preview.height);
      ctx.restore();

      // Draw cutout on right
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitPx, 0, preview.width - splitPx, preview.height);
      ctx.clip();
      ctx.drawImage(currentCanvas, 0, 0);
      ctx.restore();

      // Draw divider line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(splitPx, 0);
      ctx.lineTo(splitPx, preview.height);
      ctx.stroke();
    } else {
      ctx.drawImage(currentCanvas, 0, 0);
    }
  }, [currentCanvas, bgMode, splitPos, currentOriginalCanvas]);

  // Transformations
  const handleRotate = (deg: 90 | -90) => {
    const rotated = rotateCanvas(currentCanvas, deg);
    const rotatedOrig = rotateCanvas(currentOriginalCanvas, deg);
    pushNewState(rotated, rotatedOrig);
  };

  const handleFlip = (horizontal: boolean, vertical: boolean) => {
    const flipped = flipCanvas(currentCanvas, horizontal, vertical);
    const flippedOrig = flipCanvas(currentOriginalCanvas, horizontal, vertical);
    pushNewState(flipped, flippedOrig);
  };

  const handleApplyCrop = (cropRect: CropRect) => {
    const cropped = cropCanvas(currentCanvas, cropRect);
    const croppedOrig = cropCanvas(currentOriginalCanvas, cropRect);
    pushNewState(cropped, croppedOrig);
    setIsCropping(false);
  };

  const handleApplyResize = (targetW: number, targetH: number) => {
    const resized = resizeCanvas(currentCanvas, targetW, targetH);
    const resizedOrig = resizeCanvas(currentOriginalCanvas, targetW, targetH);
    pushNewState(resized, resizedOrig);
    setShowResizeModal(false);
  };

  // Dynamic 2D Magic Wand adjustments (Tolerance + Feather)
  const handleWandToleranceChange = useCallback(
    (newTol: number) => {
      setWandTolerance(newTol);
      if (selectionToolMode === 'wand' && lastWandSeedRef.current && currentCanvas) {
        const rawSel = floodFillSelection(
          currentCanvas,
          lastWandSeedRef.current.x,
          lastWandSeedRef.current.y,
          newTol
        );
        if (rawSel) {
          rawWandMaskRef.current = rawSel.mask;
          const featheredMask =
            wandFeather > 0
              ? featherMask(rawSel.mask, rawSel.width, rawSel.height, wandFeather)
              : rawSel.mask;
          setActiveSelection({
            ...rawSel,
            mask: featheredMask,
            feather: wandFeather,
            rawMask: rawSel.mask,
          });
        }
      }
    },
    [selectionToolMode, currentCanvas, wandFeather]
  );

  const handleWandFeatherChange = useCallback(
    (newFeather: number) => {
      setWandFeather(newFeather);
      if (selectionToolMode === 'wand' && activeSelection && rawWandMaskRef.current) {
        const featheredMask =
          newFeather > 0
            ? featherMask(rawWandMaskRef.current, activeSelection.width, activeSelection.height, newFeather)
            : rawWandMaskRef.current;
        setActiveSelection((prev) =>
          prev
            ? {
                ...prev,
                mask: featheredMask,
                feather: newFeather,
              }
            : null
        );
      }
    },
    [selectionToolMode, activeSelection]
  );

  // Selection actions: Delete, Invert, Deselect
  const handleDeleteSelection = useCallback(() => {
    let maskToUse: Uint8Array | null = null;
    if (selectionToolMode === 'shape') {
      const raster = rasterizeShapeSelection(
        currentCanvas.width,
        currentCanvas.height,
        activeSelectionShape,
        shapeRect
      );
      maskToUse = raster.mask;
    } else if (activeSelection) {
      maskToUse = activeSelection.mask;
    }

    if (!maskToUse) return;

    const newCanvas = applyDeleteSelection(currentCanvas, maskToUse, isSelectionInverted);
    pushNewState(newCanvas);
    triggerHaptic('success');
    showToast('Pixels Deleted', 'Selected area cleared to transparent. Undo anytime.', 'success');
    if (selectionToolMode === 'wand') {
      setActiveSelection(null);
      lastWandSeedRef.current = null;
      rawWandMaskRef.current = null;
    }
  }, [selectionToolMode, currentCanvas, activeSelectionShape, shapeRect, activeSelection, isSelectionInverted, pushNewState, showToast]);

  const handleToggleInvertSelection = useCallback(() => {
    setIsSelectionInverted((prev) => !prev);
    triggerHaptic('selection');
  }, []);

  const handleDeselectSelection = useCallback(() => {
    setActiveSelection(null);
    setIsSelectionInverted(false);
    lastWandSeedRef.current = null;
    rawWandMaskRef.current = null;
    setSelectionToolMode('off');
    triggerHaptic('tap');
  }, []);

  // Coordinate mapping for interactive drawing
  const getPointerCoords = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return null;

    const scaleX = currentCanvas.width / canvasRect.width;
    const scaleY = currentCanvas.height / canvasRect.height;
    const rawX = (e.clientX - canvasRect.left) * scaleX;
    const rawY = (e.clientY - canvasRect.top) * scaleY;

    // Display diameter in viewport screen pixels matching image pixels
    const displayDiameter = Math.max(
      4,
      Math.round(brushSize * (canvasRect.width / currentCanvas.width))
    );

    return {
      canvasX: Math.max(0, Math.min(currentCanvas.width, rawX)),
      canvasY: Math.max(0, Math.min(currentCanvas.height, rawY)),
      viewportX: e.clientX - viewportRect.left,
      viewportY: e.clientY - viewportRect.top,
      displayDiameter,
    };
  }, [currentCanvas.width, currentCanvas.height, brushSize]);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if ((toolMode === 'off' && selectionToolMode !== 'wand') || isCropping) return;
    if (touchStateRef.current.isGesturing) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    e.preventDefault();
    try {
      (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const coords = getPointerCoords(e);
    if (!coords) return;

    // Magic wand click: flood fill from clicked pixel
    if (selectionToolMode === 'wand') {
      const rawSel = floodFillSelection(currentCanvas, coords.canvasX, coords.canvasY, wandTolerance);
      if (rawSel) {
        lastWandSeedRef.current = { x: coords.canvasX, y: coords.canvasY };
        rawWandMaskRef.current = rawSel.mask;
        const featheredMask =
          wandFeather > 0
            ? featherMask(rawSel.mask, rawSel.width, rawSel.height, wandFeather)
            : rawSel.mask;

        const sel: SelectionData = {
          ...rawSel,
          mask: featheredMask,
          feather: wandFeather,
          rawMask: rawSel.mask,
        };

        setActiveSelection(sel);
        triggerHaptic('light');
        showToast(
          'Area Selected',
          `${sel.pixelCount.toLocaleString()} pixels selected (${wandTolerance}% tolerance${wandFeather > 0 ? `, ${wandFeather}px feather` : ''}).`,
          'success',
          1800
        );
      }
      return;
    }

    if (toolMode === 'off') return;

    isDrawingRef.current = true;
    const pt = { x: coords.canvasX, y: coords.canvasY };
    lastPointRef.current = pt;
    setCursorPos(coords);

    // Immediate click dot
    const cCtx = currentCanvas.getContext('2d');
    const pCtx = previewCanvasRef.current?.getContext('2d');

    if (toolMode === 'eraser' && cCtx && pCtx) {
      applyEraserStroke(cCtx, pt, pt, brushSize, brushHardness, currentCanvas.width, currentCanvas.height);
      applyEraserStroke(pCtx, pt, pt, brushSize, brushHardness, currentCanvas.width, currentCanvas.height);
    } else if (toolMode === 'brush' && cCtx && pCtx) {
      applyRestoreStroke(
        cCtx,
        currentOriginalCanvas,
        pt,
        pt,
        brushSize,
        currentCanvas.width,
        currentCanvas.height,
        brushHardness
      );
      applyRestoreStroke(
        pCtx,
        currentOriginalCanvas,
        pt,
        pt,
        brushSize,
        currentCanvas.width,
        currentCanvas.height,
        brushHardness
      );
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (toolMode === 'off' || isCropping) return;
    if (touchStateRef.current.isGesturing) {
      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        lastPointRef.current = null;
      }
      setCursorPos(null);
      return;
    }

    const coords = getPointerCoords(e);
    if (!coords) {
      setCursorPos(null);
      return;
    }

    setCursorPos(coords);

    if (!isDrawingRef.current || !lastPointRef.current) return;
    e.preventDefault();

    const currPt = { x: coords.canvasX, y: coords.canvasY };
    const prevPt = lastPointRef.current;
    lastPointRef.current = currPt;

    const cCtx = currentCanvas.getContext('2d');
    const pCtx = previewCanvasRef.current?.getContext('2d');

    if (toolMode === 'eraser' && cCtx && pCtx) {
      applyEraserStroke(cCtx, prevPt, currPt, brushSize, brushHardness, currentCanvas.width, currentCanvas.height);
      applyEraserStroke(pCtx, prevPt, currPt, brushSize, brushHardness, currentCanvas.width, currentCanvas.height);
    } else if (toolMode === 'brush' && cCtx && pCtx) {
      applyRestoreStroke(
        cCtx,
        currentOriginalCanvas,
        prevPt,
        currPt,
        brushSize,
        currentCanvas.width,
        currentCanvas.height,
        brushHardness
      );
      applyRestoreStroke(
        pCtx,
        currentOriginalCanvas,
        prevPt,
        currPt,
        brushSize,
        currentCanvas.width,
        currentCanvas.height,
        brushHardness
      );
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    try {
      (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    isDrawingRef.current = false;
    lastPointRef.current = null;

    // Commit modified cutout to history
    pushNewState(cloneCanvas(currentCanvas));
    triggerHaptic('light');
  };

  const handleCanvasPointerEnter = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (toolMode !== 'off') {
      const coords = getPointerCoords(e);
      setCursorPos(coords);
    }
  };

  const handleCanvasPointerLeave = () => {
    if (!isDrawingRef.current) {
      setCursorPos(null);
    }
  };

  const handleQuickScale = (percent: number) => {
    const factor = percent / 100;
    const targetW = Math.max(1, Math.round(currentCanvas.width * factor));
    const targetH = Math.max(1, Math.round(currentCanvas.height * factor));
    handleApplyResize(targetW, targetH);
  };

  const handleQuickSquare = (size: number) => {
    handleApplyResize(size, size);
  };



  // Viewport background style
  const getViewportBackground = () => {
    switch (bgMode) {
      case 'checker-dark':
        return {
          backgroundImage:
            'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px',
          backgroundColor: '#0f172a',
        };
      case 'checker-light':
        return {
          backgroundImage:
            'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px',
          backgroundColor: '#ffffff',
        };
      case 'white':
        return { backgroundColor: '#ffffff' };
      case 'dark':
        return { backgroundColor: '#020617' };
      case 'custom':
        return { backgroundColor: customBgColor };
      case 'split':
        return {
          backgroundImage:
            'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
          backgroundSize: '24px 24px',
          backgroundColor: '#0f172a',
        };
    }
  };

  // 4 Background options that the single "Bg" button cycles through
  const BG_MODES: { mode: BackgroundMode; label: string }[] = [
    { mode: 'checker-dark', label: 'Dark Grid' },
    { mode: 'checker-light', label: 'Light Grid' },
    { mode: 'white', label: 'White' },
    { mode: 'dark', label: 'Dark' },
  ];

  const handleToggleBg = () => {
    triggerHaptic('tap');
    if (isComparing && onToggleCompare) {
      onToggleCompare();
    }
    const currentIndex = BG_MODES.findIndex((item) => item.mode === bgMode);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % BG_MODES.length;
    setBgMode(BG_MODES[nextIndex].mode);
  };

  const currentBgInfo =
    BG_MODES.find((item) => item.mode === bgMode) || {
      mode: 'checker-dark' as BackgroundMode,
      label: bgMode === 'split' ? 'Split Compare' : 'Dark Grid',
    };

  return (
    <div className="flex flex-col h-[calc(100dvh-61px)] overflow-hidden bg-slate-950 select-none">
      {/* 1. TOP FLOATING APP BAR: Horizontally Scrollable Tool Strip for Tablet & Mobile */}
      <div className="w-full border-b border-slate-800/80 bg-slate-900/95 backdrop-blur-md z-30 shrink-0 overflow-x-auto no-scrollbar py-2 px-3 sm:px-4">
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-max text-xs">
          {/* Cluster 1: Undo / Redo & Dimensions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-0.5 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60 shadow-sm">
              <button
                onClick={handleUndo}
                disabled={!hasImage || historyIndex <= 0}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-30 transition cursor-pointer"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRedo}
                disabled={!hasImage || historyIndex >= history.length - 1}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-30 transition cursor-pointer"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="font-mono text-[11px] text-slate-300">
              <span className="font-semibold bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/40">
                {hasImage ? `${currentCanvas.width}×${currentCanvas.height}` : '— × —'}
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Cluster 4: Open Image & Save As Modal Launchers */}
          <div className="flex items-center gap-2 pl-1">
            <button
              onClick={() => {
                triggerHaptic('tap');
                onOpenImageClick?.();
              }}
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold text-white shadow-md transition active:scale-95 cursor-pointer shrink-0 bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 shadow-indigo-600/30 hover:from-indigo-600 hover:to-pink-700"
              title="Open image from your device or clipboard"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Open Image</span>
            </button>

            <button
              onClick={() => {
                triggerHaptic('tap');
                setShowSaveAsModal(true);
              }}
              disabled={!hasImage}
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold text-white shadow-md transition active:scale-95 cursor-pointer shrink-0 bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 shadow-indigo-600/30 hover:from-indigo-600 hover:to-pink-700 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Open Save & Share options (PNG, WebP, JPG, ICO)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save As...</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. MAIN IMMERSIVE VIEWPORT CANVAS AREA */}
      <div className="flex-1 relative min-h-0">
        <div
          ref={viewportRef}
          style={getViewportBackground()}
          className="w-full h-full relative flex items-center justify-center p-3 sm:p-6 overflow-hidden select-none"
        >
          {/* Bump-Out docked along the left edge for Off, Eraser, and Restore Brush tools */}
          <BumpOutToolbar
            toolMode={toolMode}
            onChangeToolMode={(newMode) => {
              setToolMode(newMode);
              if (newMode !== 'off') {
                setSelectionToolMode('off');
                setActiveSelection(null);
                setIsSelectionInverted(false);
              }
            }}
            brushSize={brushSize}
            onChangeBrushSize={setBrushSize}
            brushHardness={brushHardness}
            onChangeBrushHardness={setBrushHardness}
          />

          {/* Mirrored Selection Bump docked along the right edge for Off, Magic Wand, and Shape Selection */}
          <RightSelectionBump
            toolMode={selectionToolMode}
            onChangeToolMode={(newMode) => {
              setSelectionToolMode(newMode);
              if (newMode !== 'off') {
                setToolMode('off');
                if (newMode === 'shape') {
                  const size = Math.min(
                    Math.round((currentCanvas.width || 800) * 0.5),
                    Math.round((currentCanvas.height || 600) * 0.5)
                  );
                  setShapeRect({
                    x: Math.round(((currentCanvas.width || 800) - size) / 2),
                    y: Math.round(((currentCanvas.height || 600) - size) / 2),
                    width: size,
                    height: size,
                  });
                }
              } else {
                setActiveSelection(null);
                setIsSelectionInverted(false);
                lastWandSeedRef.current = null;
                rawWandMaskRef.current = null;
              }
            }}
            tolerance={wandTolerance}
            onChangeTolerance={handleWandToleranceChange}
            feather={wandFeather}
            onChangeFeather={handleWandFeatherChange}
            activeShape={activeSelectionShape}
            onChangeShape={setActiveSelectionShape}
          />

          {/* Floating Camera Screenshot Icon inside top center of the view window */}
          <div className="absolute top-2.5 sm:top-3 left-1/2 -translate-x-1/2 z-30 flex items-center select-none">
            <button
              onClick={handleCaptureScreenshot}
              disabled={!hasImage}
              className={`relative flex items-center justify-center rounded-full transition active:scale-95 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed group shadow-xl ${
                activeSelectionDetails
                  ? 'w-9 h-9 sm:w-10 sm:h-10 bg-indigo-950/95 hover:bg-indigo-900/90 text-indigo-200 border-2 border-indigo-400 shadow-indigo-950/60 ring-2 ring-indigo-500/40'
                  : 'w-8 h-8 sm:w-9 sm:h-9 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white backdrop-blur-md border border-slate-700/80 hover:border-indigo-500/70 shadow-black/40'
              }`}
              title={
                !hasImage
                  ? "Open an image to capture screenshot"
                  : activeSelectionDetails
                  ? `Screenshot Active Selection (${activeSelectionDetails.width}×${activeSelectionDetails.height}px)`
                  : "Capture screenshot of current image"
              }
              aria-label={
                !hasImage
                  ? "Open an image to capture screenshot"
                  : activeSelectionDetails
                  ? `Screenshot active selection (${activeSelectionDetails.width}×${activeSelectionDetails.height}px)`
                  : "Capture screenshot of current image"
              }
            >
              <Camera
                className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:scale-110 ${
                  activeSelectionDetails
                    ? 'text-indigo-300 drop-shadow'
                    : 'text-indigo-400 group-hover:text-indigo-300'
                }`}
              />

              {activeSelectionDetails && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500" />
                </span>
              )}
            </button>
          </div>

          {/* Camera Shutter Flash Animation */}
          {isShutterFlashing && (
            <div className="absolute inset-0 bg-white/60 pointer-events-none z-50 animate-out fade-out duration-200" />
          )}

          {/* Floating Background Toggle Button */}
          <button
            onClick={handleToggleBg}
            className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white backdrop-blur-md border border-slate-700/80 hover:border-slate-600 shadow-xl shadow-black/40 text-xs font-medium transition active:scale-95 cursor-pointer select-none"
            title="Toggle background mode (Dark Grid → Light Grid → White → Dark)"
            aria-label={`Toggle background mode, currently ${currentBgInfo.label}`}
          >
            <span className="font-semibold text-slate-400">BG:</span>
            <span className="text-slate-100">{currentBgInfo.label}</span>
          </button>

          {/* Circular Brush Reticle Indicator with dynamic hardness display */}
          {toolMode !== 'off' && cursorPos !== null && (
            <div
              className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 z-20 flex items-center justify-center transition-[width,height] duration-75 ${
                toolMode === 'eraser'
                  ? 'border-rose-400 bg-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.4)]'
                  : 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
              }`}
              style={{
                left: `${cursorPos.viewportX}px`,
                top: `${cursorPos.viewportY}px`,
                width: `${cursorPos.displayDiameter}px`,
                height: `${cursorPos.displayDiameter}px`,
                borderStyle: brushHardness < 98 ? 'dashed' : 'solid',
                boxShadow:
                  brushHardness < 98
                    ? `0 0 ${Math.round(((100 - brushHardness) / 100) * 12)}px currentColor`
                    : undefined,
              }}
            >
              {/* Inner solid core boundary if softened */}
              {brushHardness < 98 && (
                <div
                  className="rounded-full border border-white/60 pointer-events-none absolute"
                  style={{
                    width: `${Math.max(4, Math.round(cursorPos.displayDiameter * (brushHardness / 100)))}px`,
                    height: `${Math.max(4, Math.round(cursorPos.displayDiameter * (brushHardness / 100)))}px`,
                  }}
                />
              )}
              <div
                className={`w-1 h-1 rounded-full ${
                  toolMode === 'eraser' ? 'bg-rose-300' : 'bg-emerald-300'
                }`}
              />
            </div>
          )}

          {/* Centered Canvas Container with responsive constraints and pan/zoom */}
          {hasImage ? (
            <div
              className="relative transition-transform duration-75 shadow-2xl rounded-xl flex items-center justify-center max-w-full max-h-full"
              style={{
                transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomLevel})`,
                transformOrigin: 'center center',
              }}
            >
              <canvas
                ref={previewCanvasRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                onPointerEnter={handleCanvasPointerEnter}
                onPointerLeave={handleCanvasPointerLeave}
                className={`max-h-[58vh] sm:max-h-[64vh] md:max-h-[68vh] max-w-[92vw] object-contain rounded-lg drop-shadow-xl select-none ${
                  toolMode !== 'off' || selectionToolMode === 'wand'
                    ? 'cursor-crosshair touch-none'
                    : 'cursor-default'
                }`}
              />

              {/* Interactive Selection Overlay (Magic Wand mask & Shape Selection with 1:1 Detent) */}
              {hasImage && selectionToolMode !== 'off' && (
                <SelectionOverlay
                  imageWidth={currentCanvas.width}
                  imageHeight={currentCanvas.height}
                  containerWidth={previewCanvasRef.current?.clientWidth || viewportDims.width}
                  containerHeight={previewCanvasRef.current?.clientHeight || viewportDims.height}
                  zoomLevel={zoomLevel}
                  panOffset={panOffset}
                  viewportRef={viewportRef}
                  toolMode={selectionToolMode}
                  activeShape={activeSelectionShape}
                  shapeRect={shapeRect}
                  onChangeShapeRect={setShapeRect}
                  activeSelection={activeSelection}
                  isInverted={isSelectionInverted}
                  onToggleInvert={handleToggleInvertSelection}
                  onDeleteSelection={handleDeleteSelection}
                  onDeselect={handleDeselectSelection}
                  onOpenSlideshow={handleOpenSelectionSlideshow}
                />
              )}

              {/* Before/After Split Comparison Slider */}
              {bgMode === 'split' && (
                <div
                  style={{ left: `${splitPos}%`, touchAction: 'none' }}
                  className="absolute top-0 bottom-0 -ml-4 w-8 flex items-center justify-center cursor-ew-resize pointer-events-auto z-10 touch-none"
                  onPointerDown={(e) => {
                    if (e.pointerType === 'mouse' && e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    } catch {}

                    const handleMove = (ev: PointerEvent) => {
                      if (!previewCanvasRef.current) return;
                      const rect = previewCanvasRef.current.getBoundingClientRect();
                      const newPos = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
                      setSplitPos(newPos);
                    };

                    const handleUp = () => {
                      window.removeEventListener('pointermove', handleMove);
                      window.removeEventListener('pointerup', handleUp);
                      window.removeEventListener('pointercancel', handleUp);
                    };

                    window.addEventListener('pointermove', handleMove);
                    window.addEventListener('pointerup', handleUp);
                    window.addEventListener('pointercancel', handleUp);
                  }}
                >
                  <div className="h-8 w-8 rounded-full bg-white text-slate-900 shadow-xl border-2 border-purple-500 flex items-center justify-center transform active:scale-110 transition-transform">
                    <Split className="w-4 h-4 rotate-90" />
                  </div>
                </div>
              )}

              {/* Interactive Crop Overlay */}
              {isCropping && (
                <CropOverlay
                  imageWidth={currentCanvas.width}
                  imageHeight={currentCanvas.height}
                  containerWidth={previewCanvasRef.current?.clientWidth || viewportDims.width}
                  containerHeight={previewCanvasRef.current?.clientHeight || viewportDims.height}
                  zoomLevel={zoomLevel}
                  panOffset={panOffset}
                  viewportRef={viewportRef}
                  onCropChange={setActiveCropRect}
                  onOpenSlideshow={handleOpenCropSlideshow}
                  onApplyCrop={(c) => {
                    handleApplyCrop(c);
                    setActiveCropRect(null);
                  }}
                  onCancel={() => {
                    setIsCropping(false);
                    setActiveCropRect(null);
                  }}
                />
              )}
            </div>
          ) : (
            <div
              onClick={() => {
                triggerHaptic('tap');
                onOpenImageClick?.();
              }}
              className="group relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-700/60 hover:border-indigo-500/60 bg-slate-900/50 hover:bg-slate-900/70 p-8 sm:p-14 text-center transition-all duration-200 cursor-pointer shadow-2xl max-w-md w-full mx-4"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 group-hover:scale-105 transition">
                <ImagePlus className="w-8 h-8" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white mb-1">
                No Image Open
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mb-4 max-w-xs">
                Click here or tap &ldquo;Open Image&rdquo; on the action bar to select an image from your device.
              </p>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 hover:from-indigo-600 hover:to-pink-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition">
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Open Image...</span>
              </span>
            </div>
          )}


        </div>

        {/* Zoom Tool Group: Centered vertically on the bottom edge of the viewer, ~20px off the right corner */}
        <div
          className="absolute bottom-0 right-5 translate-y-1/2 z-40 flex items-center gap-0.5 bg-slate-900/95 backdrop-blur-md px-1.5 py-1 rounded-xl border border-slate-700/80 shadow-2xl ring-1 ring-white/10"
          style={{ right: '20px' }}
        >
          <button
            onClick={() => {
              triggerHaptic('tap');
              setZoomLevel((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))));
            }}
            className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95 cursor-pointer"
            title="Zoom Out (-25%)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              triggerHaptic('tap');
              setZoomLevel(1);
              setPanOffset({ x: 0, y: 0 });
            }}
            className="font-mono text-[11px] font-semibold text-indigo-300 hover:text-white px-1.5 min-w-[42px] text-center cursor-pointer transition hover:bg-slate-800/60 rounded"
            title="Click to Reset Zoom & Pan to 100%"
          >
            {Math.round(zoomLevel * 100)}%
          </button>
          <button
            onClick={() => {
              triggerHaptic('tap');
              setZoomLevel((z) => Math.min(4, Number((z + 0.25).toFixed(2))));
            }}
            className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95 cursor-pointer"
            title="Zoom In (+25%)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              triggerHaptic('tap');
              setZoomLevel(1);
              setPanOffset({ x: 0, y: 0 });
            }}
            className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95 cursor-pointer ml-0.5 border-l border-slate-700/60 pl-1.5"
            title="Reset Zoom & Pan (Fit to Screen)"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. FIXED BOTTOM THUMB DOCK (TWO TIERS: CONTEXT SHELF + THUMB-SLIDE TAB STRIP) */}
      <div className="shrink-0 border-t border-slate-800 bg-slate-900/95 backdrop-blur-lg flex flex-col z-30 shadow-2xl">
        {/* TIER 1: CONTEXTUAL CONTROL SHELF (Specific to the Active Tab) */}
        <div className="px-4 py-3 border-b border-slate-800/60 max-w-4xl mx-auto w-full">
          {/* TAB: CROP */}
          {activeTab === 'crop' && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-150">
              <div className="text-xs text-slate-300 flex items-center gap-2">
                <Crop className="w-4 h-4 text-indigo-400" />
                <span>Interactive crop overlay with aspect ratios:</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {!isCropping ? (
                  <button
                    onClick={() => setIsCropping(true)}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition active:scale-95 cursor-pointer shadow-md"
                  >
                    <Crop className="w-3.5 h-3.5" />
                    <span>Open Crop Tool</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setIsCropping(false);
                      setActiveCropRect(null);
                    }}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
                  >
                    <span>Close Crop</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB: RESIZE */}
          {activeTab === 'resize' && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-150">
              {/* Quick Icon Square & Percentage Scaling */}
              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                <span className="text-[11px] text-slate-400 font-semibold mr-1">Quick Sizes:</span>
                {[32, 64, 128, 256, 512].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleQuickSquare(s)}
                    className="rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1 text-xs font-mono text-slate-300 hover:border-indigo-500/50 hover:bg-slate-800 transition active:scale-95 cursor-pointer"
                  >
                    {s}px
                  </button>
                ))}
                <span className="text-slate-600 mx-1">•</span>
                {[50, 75, 150].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => handleQuickScale(pct)}
                    className="rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1 text-xs font-mono text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95 cursor-pointer"
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              {/* Exact Dimensions Modal Button */}
              <button
                onClick={() => setShowResizeModal(true)}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-3.5 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-900/40 transition active:scale-95 cursor-pointer shrink-0"
              >
                <Scaling className="w-3.5 h-3.5" />
                <span>Custom Dimensions...</span>
              </button>
            </div>
          )}

          {/* TAB: TRANSFORM (ROTATE & FLIP) */}
          {activeTab === 'transform' && (
            <div className="flex items-center justify-center sm:justify-start gap-2 animate-in fade-in duration-150">
              <button
                onClick={() => handleRotate(90)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition active:scale-95 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                <span>Rotate 90° CW</span>
              </button>
              <button
                onClick={() => handleRotate(-90)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Rotate 90° CCW</span>
              </button>
              <button
                onClick={() => handleFlip(true, false)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition active:scale-95 cursor-pointer"
              >
                <FlipHorizontal className="w-3.5 h-3.5 text-purple-400" />
                <span>Flip Horizontal</span>
              </button>
              <button
                onClick={() => handleFlip(false, true)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition active:scale-95 cursor-pointer"
              >
                <FlipVertical className="w-3.5 h-3.5 text-purple-400" />
                <span>Flip Vertical</span>
              </button>
            </div>
          )}

        </div>

        {/* TIER 2: HORIZONTAL THUMB-SLIDE TAB STRIP (Reachable by either thumb) */}
        <div className="px-2 py-1.5 max-w-md mx-auto w-full overflow-x-auto no-scrollbar">
          <div className="flex items-center justify-center gap-2">
            {/* Tab: Crop */}
            <button
              onClick={() => {
                setActiveTab('crop');
                setIsCropping(true);
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition active:scale-95 cursor-pointer ${
                activeTab === 'crop'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Crop className="w-4 h-4 text-indigo-400" />
              <span>Crop</span>
            </button>

            {/* Tab: Resize */}
            <button
              onClick={() => setActiveTab('resize')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition active:scale-95 cursor-pointer ${
                activeTab === 'resize'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Scaling className="w-4 h-4 text-cyan-400" />
              <span>Resize</span>
            </button>

            {/* Tab: Transform */}
            <button
              onClick={() => setActiveTab('transform')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition active:scale-95 cursor-pointer ${
                activeTab === 'transform'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <RotateCw className="w-4 h-4 text-amber-400" />
              <span>Rotate / Flip</span>
            </button>
          </div>
        </div>
      </div>

      {/* Resize Modal */}
      {showResizeModal && (
        <ResizeModal
          currentWidth={currentCanvas.width}
          currentHeight={currentCanvas.height}
          onApplyResize={handleApplyResize}
          onClose={() => setShowResizeModal(false)}
        />
      )}

      {/* Save As & Share Modal */}
      {showSaveAsModal && (
        <SaveAsModal
          canvas={currentCanvas}
          originalFilename={originalFilename}
          originalFileSize={originalFileSize}
          onClose={() => setShowSaveAsModal(false)}
        />
      )}

      {/* Sprite Slideshow & Animation Preview Modal */}
      {slideshowConfig && hasImage && (
        <SpriteSlideshowModal
          sourceCanvas={currentCanvas}
          frameWidth={slideshowConfig.frameWidth}
          frameHeight={slideshowConfig.frameHeight}
          initialCol={slideshowConfig.col}
          initialRow={slideshowConfig.row}
          imageWidth={currentCanvas.width}
          imageHeight={currentCanvas.height}
          onSelectFrame={handleSelectSlideshowFrame}
          onClose={() => setSlideshowConfig(null)}
          showToast={showToast}
        />
      )}

      {/* Floating Export Progress & Success Toast */}
      {toastNotification && (
        <div className="fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-200">
          <div
            className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-xl border text-xs font-semibold max-w-sm sm:max-w-md ${
              toastNotification.type === 'loading'
                ? 'bg-slate-900/95 border-indigo-500/50 text-slate-100 shadow-indigo-500/20'
                : toastNotification.type === 'success'
                ? 'bg-slate-900/95 border-emerald-500/50 text-emerald-300 shadow-emerald-500/25'
                : 'bg-slate-900/95 border-red-500/50 text-red-300 shadow-red-500/25'
            }`}
          >
            {toastNotification.type === 'loading' && (
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
            )}
            {toastNotification.type === 'success' && (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            {toastNotification.type === 'error' && (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <div className="flex flex-col">
              <span className="text-white text-xs font-bold leading-tight">
                {toastNotification.title}
              </span>
              <span className="text-[11px] text-slate-300 font-normal leading-tight">
                {toastNotification.message}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
