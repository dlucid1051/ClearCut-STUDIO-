import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  X,
  RotateCcw,
  Sliders,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowUpLeft,
  Grid,
  Lock,
  Unlock,
  Play,
  Film,
} from 'lucide-react';
import { CropRect } from '../utils/imageProcessing';
import { triggerHaptic } from '../utils/haptics';

interface CropOverlayProps {
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  zoomLevel?: number;
  panOffset?: { x: number; y: number };
  viewportRef?: React.RefObject<HTMLDivElement | null>;
  onApplyCrop: (crop: CropRect) => void;
  onCancel: () => void;
  onCropChange?: (crop: CropRect) => void;
  onOpenSlideshow?: () => void;
}

export type AspectRatio = 'free' | '1:1' | '4:3' | '16:9' | '3:2' | '9:16';

interface PresetSize {
  label: string;
  w: number;
  h: number;
  tag?: string;
}

const RATIO_PRESETS: Record<Exclude<AspectRatio, 'free'>, PresetSize[]> = {
  '1:1': [
    { label: '16×16', w: 16, h: 16, tag: 'Icon' },
    { label: '24×24', w: 24, h: 24, tag: 'Icon' },
    { label: '32×32', w: 32, h: 32, tag: 'Sprite' },
    { label: '48×48', w: 48, h: 48, tag: 'Tile' },
    { label: '64×64', w: 64, h: 64, tag: 'Sprite' },
    { label: '128×128', w: 128, h: 128, tag: 'Avatar' },
    { label: '256×256', w: 256, h: 256, tag: 'Texture' },
    { label: '512×512', w: 512, h: 512, tag: 'Atlas' },
  ],
  '16:9': [
    { label: '1920×1080', w: 1920, h: 1080, tag: 'FHD' },
    { label: '1280×720', w: 1280, h: 720, tag: 'HD' },
    { label: '854×480', w: 854, h: 480, tag: 'SD' },
    { label: '640×360', w: 640, h: 360, tag: 'Preview' },
    { label: '3840×2160', w: 3840, h: 2160, tag: '4K' },
  ],
  '9:16': [
    { label: '1080×1920', w: 1080, h: 1920, tag: 'Reels' },
    { label: '720×1280', w: 720, h: 1280, tag: 'Stories' },
    { label: '480×854', w: 480, h: 854, tag: 'Mobile' },
  ],
  '4:3': [
    { label: '1024×768', w: 1024, h: 768, tag: 'Tablet' },
    { label: '800×600', w: 800, h: 600, tag: 'SVGA' },
    { label: '640×480', w: 640, h: 480, tag: 'VGA' },
    { label: '1600×1200', w: 1600, h: 1200, tag: 'UXGA' },
  ],
  '3:2': [
    { label: '1080×720', w: 1080, h: 720, tag: 'Photo' },
    { label: '1200×800', w: 1200, h: 800, tag: 'DSLR' },
    { label: '1800×1200', w: 1800, h: 1200, tag: '4×6' },
  ],
};

function getRatioMultiplier(ratio: AspectRatio): number {
  if (ratio === '1:1') return 1;
  if (ratio === '4:3') return 4 / 3;
  if (ratio === '16:9') return 16 / 9;
  if (ratio === '3:2') return 3 / 2;
  if (ratio === '9:16') return 9 / 16;
  return 1;
}

export const CropOverlay: React.FC<CropOverlayProps> = ({
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  zoomLevel = 1,
  panOffset,
  viewportRef,
  onApplyCrop,
  onCancel,
  onCropChange,
  onOpenSlideshow,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('free');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [customWidthInput, setCustomWidthInput] = useState<string>('');

  // Inverse zoom scale factor so grab handles NEVER scale with zoom
  const invZoom = 1 / Math.max(0.05, zoomLevel);

  // Actual display dimensions of the canvas element under this overlay
  const [dispBounds, setDispBounds] = useState<{ width: number; height: number }>({
    width: containerWidth,
    height: containerHeight,
  });

  // Measure actual rendered canvas size to guarantee pixel-perfect overlay
  useEffect(() => {
    const updateBounds = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth || containerWidth;
        const h = containerRef.current.clientHeight || containerHeight;
        if (w > 0 && h > 0) {
          setDispBounds({ width: w, height: h });
        }
      }
    };
    updateBounds();
    window.addEventListener('resize', updateBounds);
    return () => window.removeEventListener('resize', updateBounds);
  }, [containerWidth, containerHeight]);

  // Scale between original image pixels and displayed screen pixels
  const scale = dispBounds.width > 0 ? dispBounds.width / imageWidth : 1;

  // Initial Crop rectangle in normalized image coordinates (0 to imageWidth/imageHeight)
  const [crop, setCrop] = useState<CropRect>(() => {
    const pad = 0.08;
    return {
      x: Math.round(imageWidth * pad),
      y: Math.round(imageHeight * pad),
      width: Math.round(imageWidth * (1 - pad * 2)),
      height: Math.round(imageHeight * (1 - pad * 2)),
    };
  });

  // Keep a ref to the current crop to avoid stale closure state during rapid dragging
  const cropRef = useRef<CropRect>(crop);
  useEffect(() => {
    cropRef.current = crop;
    onCropChange?.(crop);
  }, [crop, onCropChange]);

  const isDraggingRef = useRef<string | null>(null);
  const startPosRef = useRef<{ clientX: number; clientY: number; initialCrop: CropRect }>({
    clientX: 0,
    clientY: 0,
    initialCrop: crop,
  });

  // When custom width changes, sync input value
  useEffect(() => {
    setCustomWidthInput(String(Math.round(crop.width)));
  }, [crop.width]);

  // Apply or toggle aspect ratio
  const handleRatioClick = useCallback(
    (ratio: AspectRatio) => {
      triggerHaptic('tap');

      if (ratio === 'free') {
        setAspectRatio('free');
        setIsPopoverOpen(false);
        return;
      }

      if (aspectRatio === ratio) {
        if (!isPopoverOpen) {
          // Second tap: open the context size & grid popover
          setIsPopoverOpen(true);
        } else {
          // Third tap: deactivate ratio settings and return to default 'free'
          setAspectRatio('free');
          setIsPopoverOpen(false);
        }
        return;
      }

      // First tap on this new ratio: activate it and adjust crop box
      setAspectRatio(ratio);
      const targetRatio = getRatioMultiplier(ratio);

      setCrop((prev) => {
        let newW = prev.width;
        let newH = Math.round(newW / targetRatio);

        if (newH > imageHeight) {
          newH = Math.round(imageHeight * 0.85);
          newW = Math.round(newH * targetRatio);
        }
        if (newW > imageWidth) {
          newW = Math.round(imageWidth * 0.85);
          newH = Math.round(newW / targetRatio);
        }

        const newX = Math.max(0, Math.min(imageWidth - newW, Math.round(prev.x + (prev.width - newW) / 2)));
        const newY = Math.max(0, Math.min(imageHeight - newH, Math.round(prev.y + (prev.height - newH) / 2)));

        return { x: newX, y: newY, width: newW, height: newH };
      });
    },
    [aspectRatio, isPopoverOpen, imageWidth, imageHeight]
  );

  // Set exact preset dimensions (e.g. 64x64)
  const applyPresetSize = useCallback(
    (targetW: number, targetH: number) => {
      triggerHaptic('success');
      const clampedW = Math.min(imageWidth, Math.max(8, targetW));
      const clampedH = Math.min(imageHeight, Math.max(8, targetH));

      setCrop((prev) => {
        const clampedX = Math.max(0, Math.min(imageWidth - clampedW, prev.x));
        const clampedY = Math.max(0, Math.min(imageHeight - clampedH, prev.y));
        return {
          x: clampedX,
          y: clampedY,
          width: clampedW,
          height: clampedH,
        };
      });
    },
    [imageWidth, imageHeight]
  );

  // Apply custom exact width (and calculated height based on ratio)
  const applyCustomSize = useCallback(
    (wStr: string) => {
      const parsedW = parseInt(wStr, 10);
      if (isNaN(parsedW) || parsedW <= 0) return;

      const targetRatio = aspectRatio !== 'free' ? getRatioMultiplier(aspectRatio) : crop.width / crop.height;
      const targetW = Math.min(imageWidth, Math.max(8, parsedW));
      const targetH = Math.min(imageHeight, Math.max(8, Math.round(targetW / targetRatio)));

      applyPresetSize(targetW, targetH);
    },
    [aspectRatio, crop.width, crop.height, imageWidth, imageHeight, applyPresetSize]
  );

  // Nudge stepper actions (Move by 1px, or Move by full frame width/height)
  const nudgeCrop = useCallback(
    (dx: number, dy: number) => {
      triggerHaptic('light');
      setCrop((prev) => {
        const newX = Math.max(0, Math.min(imageWidth - prev.width, prev.x + dx));
        const newY = Math.max(0, Math.min(imageHeight - prev.height, prev.y + dy));
        return {
          ...prev,
          x: newX,
          y: newY,
        };
      });
    },
    [imageWidth, imageHeight]
  );

  // Snap crop directly to upper-left origin (0, 0)
  const snapToOrigin = useCallback(() => {
    triggerHaptic('medium');
    setCrop((prev) => ({
      ...prev,
      x: 0,
      y: 0,
    }));
  }, []);

  // Unified start-drag handler for mouse, touch, and stylus
  const startDrag = useCallback(
    (clientX: number, clientY: number, handle: string) => {
      isDraggingRef.current = handle;
      startPosRef.current = {
        clientX,
        clientY,
        initialCrop: { ...cropRef.current },
      };
      triggerHaptic('light');
    },
    []
  );

  // Unified move handler calculation
  const updateDrag = useCallback(
    (clientX: number, clientY: number) => {
      const handle = isDraggingRef.current;
      if (!handle) return;

      const effectiveScale = (scale || 1) * (zoomLevel || 1);
      const dxImg = (clientX - startPosRef.current.clientX) / effectiveScale;
      const dyImg = (clientY - startPosRef.current.clientY) / effectiveScale;
      const init = startPosRef.current.initialCrop;

      setCrop(() => {
        let { x, y, width, height } = init;

        if (handle === 'move') {
          x = Math.max(0, Math.min(imageWidth - width, Math.round(init.x + dxImg)));
          y = Math.max(0, Math.min(imageHeight - height, Math.round(init.y + dyImg)));
        } else {
          // Horizontal adjustments
          if (handle.includes('e')) {
            width = Math.max(16, Math.min(imageWidth - x, Math.round(init.width + dxImg)));
          }
          if (handle.includes('w')) {
            const proposedX = Math.max(0, Math.min(init.x + init.width - 16, Math.round(init.x + dxImg)));
            width = init.width + (init.x - proposedX);
            x = proposedX;
          }

          // Vertical adjustments
          if (handle.includes('s')) {
            height = Math.max(16, Math.min(imageHeight - y, Math.round(init.height + dyImg)));
          }
          if (handle.includes('n')) {
            const proposedY = Math.max(0, Math.min(init.y + init.height - 16, Math.round(init.y + dyImg)));
            height = init.height + (init.y - proposedY);
            y = proposedY;
          }

          // Maintain aspect ratio if selected
          if (aspectRatio !== 'free') {
            const targetRatio = getRatioMultiplier(aspectRatio);

            if (handle === 'e' || handle === 'w') {
              height = Math.round(width / targetRatio);
            } else {
              width = Math.round(height * targetRatio);
            }
          }
        }

        return {
          x: Math.max(0, Math.min(imageWidth - 8, x)),
          y: Math.max(0, Math.min(imageHeight - 8, y)),
          width: Math.max(8, Math.min(imageWidth - x, width)),
          height: Math.max(8, Math.min(imageHeight - y, height)),
        };
      });
    },
    [scale, zoomLevel, imageWidth, imageHeight, aspectRatio]
  );

  const endDrag = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = null;
      triggerHaptic('light');
    }
  }, []);

  // Global window listeners for pointer and touch dragging
  useEffect(() => {
    const onWindowPointerMove = (e: PointerEvent) => {
      if (isDraggingRef.current) {
        e.preventDefault();
        updateDrag(e.clientX, e.clientY);
      }
    };

    const onWindowPointerUp = () => {
      endDrag();
    };

    const onWindowTouchMove = (e: TouchEvent) => {
      if (isDraggingRef.current && e.touches.length > 0) {
        e.preventDefault();
        updateDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onWindowTouchEnd = () => {
      endDrag();
    };

    window.addEventListener('pointermove', onWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('touchmove', onWindowTouchMove, { passive: false });
    window.addEventListener('touchend', onWindowTouchEnd);
    window.addEventListener('touchcancel', onWindowTouchEnd);

    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('touchmove', onWindowTouchMove);
      window.removeEventListener('touchend', onWindowTouchEnd);
      window.removeEventListener('touchcancel', onWindowTouchEnd);
    };
  }, [updateDrag, endDrag]);

  // Handle pointer down helpers
  const bindDragHandle = (handleKey: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();
      startDrag(e.clientX, e.clientY, handleKey);
    },
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.touches.length > 0) {
        startDrag(e.touches[0].clientX, e.touches[0].clientY, handleKey);
      }
    },
  });

  // Display coordinates mapped to the container
  const dispCropX = crop.x * scale;
  const dispCropY = crop.y * scale;
  const dispCropW = crop.width * scale;
  const dispCropH = crop.height * scale;

  // Frame calculation for sprite sheets
  const frameCol = Math.floor(crop.x / Math.max(1, crop.width));
  const frameRow = Math.floor(crop.y / Math.max(1, crop.height));
  const totalCols = Math.max(1, Math.floor(imageWidth / Math.max(1, crop.width)));
  const totalRows = Math.max(1, Math.floor(imageHeight / Math.max(1, crop.height)));
  const totalFrames = totalCols * totalRows;
  const frameIndex = frameRow * totalCols + frameCol + 1;

  // VIEWER-LEVEL COORDINATES FLAG POSITION CALCULATION:
  // Rendered directly into the viewport layer so it NEVER gets cropped by the image boundary
  const [viewerFlagCoords, setViewerFlagCoords] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const updateViewerFlag = () => {
      if (!containerRef.current || !viewportRef?.current) {
        setViewerFlagCoords(null);
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      const viewportRect = viewportRef.current.getBoundingClientRect();

      const renderedScale = containerRect.width / imageWidth;
      const screenCropLeft = containerRect.left - viewportRect.left + crop.x * renderedScale;
      const screenCropTop = containerRect.top - viewportRect.top + crop.y * renderedScale;

      const flagW = 210;
      const flagH = 28;

      // By default: 10px above the top-left corner
      let top = screenCropTop - flagH - 8;
      // If overflowing the top of the viewport (closer than 10px from top):
      if (top < 10) {
        // Flip inside the crop box
        top = screenCropTop + 8;
      }

      // Clamp horizontally within viewport margins so it NEVER gets clipped
      let left = Math.max(12, Math.min(viewportRect.width - flagW - 12, screenCropLeft));

      setViewerFlagCoords({ left, top });
    };

    updateViewerFlag();
    window.addEventListener('resize', updateViewerFlag);
    return () => window.removeEventListener('resize', updateViewerFlag);
  }, [crop, imageWidth, viewportRef, zoomLevel, panOffset]);

  // Viewport layer floating toolbar content & Viewer coordinates flag
  const viewerPortalContent = (
    <>
      {/* 1. VIEWER-LAYER COORDINATES & DIMENSION FLAG */}
      {viewerFlagCoords && (
        <div
          style={{
            left: `${viewerFlagCoords.left}px`,
            top: `${viewerFlagCoords.top}px`,
          }}
          className="absolute pointer-events-none select-none z-35 flex items-center gap-2 rounded-lg bg-slate-900/95 border border-indigo-500/70 px-2.5 py-1 text-[11px] font-mono text-slate-200 shadow-xl backdrop-blur-md whitespace-nowrap animate-in fade-in duration-100 ring-1 ring-black/40"
        >
          <div className="flex items-center gap-1 text-indigo-300 font-semibold">
            <span>X: {Math.round(crop.x)}</span>
            <span className="text-slate-500">|</span>
            <span>Y: {Math.round(crop.y)}</span>
          </div>
          <span className="text-slate-500">•</span>
          <div className="text-emerald-300 font-bold">
            {Math.round(crop.width)} × {Math.round(crop.height)} px
          </div>
          {aspectRatio !== 'free' && (
            <span className="bg-indigo-500/25 text-indigo-300 border border-indigo-400/40 rounded px-1.5 py-0.2 text-[10px] font-sans font-semibold">
              {aspectRatio}
            </span>
          )}
        </div>
      )}

      {/* 2. MAIN FLOATING DOCK TOOLBAR */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 select-none pointer-events-auto max-w-[96vw]">
        {/* Ratio Context Popover: Preset Dimensions & Sprite Grid Stepper */}
        {isPopoverOpen && aspectRatio !== 'free' && (
          <div className="w-[340px] sm:w-[420px] max-w-[94vw] bg-slate-900/95 border border-indigo-500/50 rounded-2xl p-3.5 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150 text-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                  {aspectRatio.toUpperCase()}
                </span>
                <span className="text-xs font-semibold text-slate-300">Size & Sprite Presets</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap');
                    setAspectRatio('free');
                    setIsPopoverOpen(false);
                  }}
                  className="text-[11px] font-medium text-slate-400 hover:text-amber-300 hover:bg-slate-800 px-2 py-0.5 rounded-lg transition cursor-pointer flex items-center gap-1"
                  title="Unlock ratio back to freeform"
                >
                  <Unlock className="w-3 h-3" />
                  <span>Freeform</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPopoverOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Common Preset Sizes */}
            <div className="mt-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                <span>Standard Pixel Sizes</span>
                <span className="text-[9px] text-slate-500 font-normal">Click to snap</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {RATIO_PRESETS[aspectRatio]?.map((p) => {
                  const isCurrent =
                    Math.round(crop.width) === p.w && Math.round(crop.height) === p.h;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPresetSize(p.w, p.h)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-mono font-medium transition cursor-pointer flex flex-col items-center justify-center border ${
                        isCurrent
                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-md ring-1 ring-indigo-400/50'
                          : 'bg-slate-800/80 hover:bg-slate-750 text-slate-300 border-slate-700/80 hover:border-slate-600'
                      }`}
                    >
                      <span className="font-bold">{p.label}</span>
                      {p.tag && <span className="text-[9px] text-slate-400 font-sans">{p.tag}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Size Input */}
            <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                <Lock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Exact Width:</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={8}
                  max={imageWidth}
                  value={customWidthInput}
                  onChange={(e) => setCustomWidthInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      applyCustomSize(customWidthInput);
                    }
                  }}
                  className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-indigo-300 text-center focus:outline-none focus:border-indigo-500"
                />
                <span className="text-xs text-slate-400 font-mono">px</span>
                <button
                  type="button"
                  onClick={() => applyCustomSize(customWidthInput)}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition cursor-pointer shadow"
                >
                  Set
                </button>
              </div>
            </div>

            {/* Sprite Frame Stepper & Nudge Grid */}
            <div className="mt-3 pt-2.5 border-t border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] mb-2 font-mono">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Grid className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-sans font-semibold">Sprite Grid:</span>
                  <span className="text-indigo-300 font-bold">
                    Col {frameCol}, Row {frameRow}
                  </span>
                  <span className="text-slate-500">
                    (Frame #{frameIndex} of {totalFrames})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-slate-400 text-[10px]">
                    [{crop.x}, {crop.y}]
                  </div>
                  {onOpenSlideshow && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap');
                        onOpenSlideshow();
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-sans text-xs font-bold transition active:scale-95 cursor-pointer shadow-md shadow-indigo-600/30"
                      title="Open Slideshow & Animation Preview for all sprite frames"
                    >
                      <Play className="w-3 h-3 fill-current text-emerald-300" />
                      <span>Slideshow</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Stepper Buttons: Jump Frame by Frame (W / H) */}
              <div className="grid grid-cols-5 gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={snapToOrigin}
                  className="col-span-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg py-1.5 font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  title="Jump directly to top-left origin (0, 0)"
                >
                  <ArrowUpLeft className="w-3.5 h-3.5 text-amber-400" />
                  <span>(0,0)</span>
                </button>

                <button
                  type="button"
                  onClick={() => nudgeCrop(-crop.width, 0)}
                  disabled={crop.x <= 0}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 border border-slate-700 rounded-lg py-1.5 font-mono flex items-center justify-center gap-0.5 transition cursor-pointer"
                  title="Shift left by one sprite frame (-W)"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>-Col</span>
                </button>

                <button
                  type="button"
                  onClick={() => nudgeCrop(crop.width, 0)}
                  disabled={crop.x >= imageWidth - crop.width}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 border border-slate-700 rounded-lg py-1.5 font-mono flex items-center justify-center gap-0.5 transition cursor-pointer"
                  title="Shift right by one sprite frame (+W)"
                >
                  <span>+Col</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => nudgeCrop(0, -crop.height)}
                  disabled={crop.y <= 0}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 border border-slate-700 rounded-lg py-1.5 font-mono flex items-center justify-center gap-0.5 transition cursor-pointer"
                  title="Shift up by one sprite row (-H)"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>-Row</span>
                </button>

                <button
                  type="button"
                  onClick={() => nudgeCrop(0, crop.height)}
                  disabled={crop.y >= imageHeight - crop.height}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 border border-slate-700 rounded-lg py-1.5 font-mono flex items-center justify-center gap-0.5 transition cursor-pointer"
                  title="Shift down by one sprite row (+H)"
                >
                  <span>+Row</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Fine 1px Nudges */}
              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800/80 text-[10px] text-slate-400">
                <span className="font-sans">1-Pixel Nudge:</span>
                <div className="flex items-center gap-1 font-mono">
                  <button
                    type="button"
                    onClick={() => nudgeCrop(-1, 0)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                    title="Nudge 1px Left"
                  >
                    ← 1px
                  </button>
                  <button
                    type="button"
                    onClick={() => nudgeCrop(1, 0)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                    title="Nudge 1px Right"
                  >
                    +1px →
                  </button>
                  <button
                    type="button"
                    onClick={() => nudgeCrop(0, -1)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                    title="Nudge 1px Up"
                  >
                    ↑ 1px
                  </button>
                  <button
                    type="button"
                    onClick={() => nudgeCrop(0, 1)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                    title="Nudge 1px Down"
                  >
                    +1px ↓
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Floating Action Bar */}
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/95 backdrop-blur-md p-2 shadow-2xl">
          {/* Aspect ratio buttons with tap-to-toggle popover */}
          <div className="flex items-center gap-1 border-r border-slate-800 pr-2 overflow-x-auto no-scrollbar">
            {(['free', '1:1', '4:3', '16:9', '3:2', '9:16'] as AspectRatio[]).map((r) => {
              const isSelected = aspectRatio === r;
              const hasPopover = isSelected && isPopoverOpen;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRatioClick(r)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  title={
                    isSelected
                      ? isPopoverOpen
                        ? 'Tap again to deactivate ratio back to freeform'
                        : 'Tap again to open size presets & sprite grid stepper'
                      : `Set aspect ratio to ${r}`
                  }
                >
                  <span>{r === '1:1' ? '1:1' : r.toUpperCase()}</span>
                  {isSelected && r !== 'free' && (
                    <Sliders className={`w-3 h-3 text-indigo-200 transition-transform ${hasPopover ? 'rotate-90' : ''}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap');
                setAspectRatio('free');
                setIsPopoverOpen(false);
                setCrop({
                  x: 0,
                  y: 0,
                  width: imageWidth,
                  height: imageHeight,
                });
              }}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
              title="Reset crop to full image"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap');
                onCancel();
              }}
              className="flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('success');
                onApplyCrop(crop);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition shadow active:scale-95 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Crop</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-auto select-none overflow-hidden z-20 touch-none"
      style={{ touchAction: 'none' }}
    >
      {/* Dark Dim SVG Overlay around the active crop box */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="crop-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={dispCropX}
              y={dispCropY}
              width={dispCropW}
              height={dispCropH}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.65)"
          mask="url(#crop-mask)"
        />
      </svg>

      {/* Draggable & Resizable Crop Box */}
      <div
        style={{
          left: `${dispCropX}px`,
          top: `${dispCropY}px`,
          width: `${dispCropW}px`,
          height: `${dispCropH}px`,
          touchAction: 'none',
        }}
        className="absolute border-2 border-indigo-400 cursor-move shadow-2xl touch-none ring-1 ring-white/30"
        {...bindDragHandle('move')}
      >
        {/* Rule of Thirds Grid Lines */}
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
          <div className="border-r border-b border-white" />
          <div className="border-r border-b border-white" />
          <div className="border-b border-white" />
          <div className="border-r border-b border-white" />
          <div className="border-r border-b border-white" />
          <div className="border-b border-white" />
          <div className="border-r border-b border-white" />
          <div className="border-r border-b border-white" />
          <div />
        </div>

        {/* 
          CORNER HANDLES
          Centered exactly on corners (translate -50%, -50%) and counter-scaled by invZoom
          so they NEVER scale with zooming and maintain a consistent screen target size!
        */}
        {/* Top-Left (NW) */}
        <div
          {...bindDragHandle('nw')}
          style={{
            left: 0,
            top: 0,
            transform: `translate(-50%, -50%) scale(${invZoom})`,
            touchAction: 'none',
          }}
          className="absolute w-11 h-11 flex items-center justify-center cursor-nwse-resize touch-none z-30 select-none group"
          title="Drag to resize top-left"
        >
          <div className="w-5 h-5 rounded-full bg-indigo-500 border-2 border-white shadow-xl ring-2 ring-indigo-400/50 group-hover:scale-125 group-active:scale-125 transition-transform" />
        </div>

        {/* Top-Right (NE) */}
        <div
          {...bindDragHandle('ne')}
          style={{
            left: '100%',
            top: 0,
            transform: `translate(-50%, -50%) scale(${invZoom})`,
            touchAction: 'none',
          }}
          className="absolute w-11 h-11 flex items-center justify-center cursor-nesw-resize touch-none z-30 select-none group"
          title="Drag to resize top-right"
        >
          <div className="w-5 h-5 rounded-full bg-indigo-500 border-2 border-white shadow-xl ring-2 ring-indigo-400/50 group-hover:scale-125 group-active:scale-125 transition-transform" />
        </div>

        {/* Bottom-Left (SW) */}
        <div
          {...bindDragHandle('sw')}
          style={{
            left: 0,
            top: '100%',
            transform: `translate(-50%, -50%) scale(${invZoom})`,
            touchAction: 'none',
          }}
          className="absolute w-11 h-11 flex items-center justify-center cursor-nesw-resize touch-none z-30 select-none group"
          title="Drag to resize bottom-left"
        >
          <div className="w-5 h-5 rounded-full bg-indigo-500 border-2 border-white shadow-xl ring-2 ring-indigo-400/50 group-hover:scale-125 group-active:scale-125 transition-transform" />
        </div>

        {/* Bottom-Right (SE) */}
        <div
          {...bindDragHandle('se')}
          style={{
            left: '100%',
            top: '100%',
            transform: `translate(-50%, -50%) scale(${invZoom})`,
            touchAction: 'none',
          }}
          className="absolute w-11 h-11 flex items-center justify-center cursor-nwse-resize touch-none z-30 select-none group"
          title="Drag to resize bottom-right"
        >
          <div className="w-5 h-5 rounded-full bg-indigo-500 border-2 border-white shadow-xl ring-2 ring-indigo-400/50 group-hover:scale-125 group-active:scale-125 transition-transform" />
        </div>

        {/* 
          EDGE HANDLES (Top, Bottom, Left, Right)
          Counter-scaled by invZoom to remain consistent at any zoom level
        */}
        {/* Top (N) */}
        <div
          {...bindDragHandle('n')}
          style={{
            left: '50%',
            top: 0,
            transform: `translate(-50%, -50%) scale(${invZoom})`,
            touchAction: 'none',
          }}
          className="absolute w-14 h-9 flex items-center justify-center cursor-ns-resize touch-none z-30 select-none group"
          title="Drag to resize top"
        >
          <div className="w-7 h-2.5 rounded-full bg-indigo-500 border border-white shadow-md group-hover:scale-125 group-active:scale-125 transition-transform" />
        </div>

        {/* Bottom (S) */}
        <div
          {...bindDragHandle('s')}
          style={{
            left: '50%',
            top: '100%',
            transform: `translate(-50%, -50%) scale(${invZoom})`,
            touchAction: 'none',
          }}
          className="absolute w-14 h-9 flex items-center justify-center cursor-ns-resize touch-none z-30 select-none group"
          title="Drag to resize bottom"
        >
          <div className="w-7 h-2.5 rounded-full bg-indigo-500 border border-white shadow-md group-hover:scale-125 group-active:scale-125 transition-transform" />
        </div>

        {/* Left (W) */}
        <div
          {...bindDragHandle('w')}
          style={{
            left: 0,
            top: '50%',
            transform: `translate(-50%, -50%) scale(${invZoom})`,
            touchAction: 'none',
          }}
          className="absolute w-9 h-14 flex items-center justify-center cursor-ew-resize touch-none z-30 select-none group"
          title="Drag to resize left"
        >
          <div className="w-2.5 h-7 rounded-full bg-indigo-500 border border-white shadow-md group-hover:scale-125 group-active:scale-125 transition-transform" />
        </div>

        {/* Right (E) */}
        <div
          {...bindDragHandle('e')}
          style={{
            left: '100%',
            top: '50%',
            transform: `translate(-50%, -50%) scale(${invZoom})`,
            touchAction: 'none',
          }}
          className="absolute w-9 h-14 flex items-center justify-center cursor-ew-resize touch-none z-30 select-none group"
          title="Drag to resize right"
        >
          <div className="w-2.5 h-7 rounded-full bg-indigo-500 border border-white shadow-md group-hover:scale-125 group-active:scale-125 transition-transform" />
        </div>
      </div>

      {/* Render Viewer-Layer Portal Elements: Flag, Popover & Toolbar into Viewport */}
      {viewportRef?.current
        ? createPortal(viewerPortalContent, viewportRef.current)
        : viewerPortalContent}
    </div>
  );
};
