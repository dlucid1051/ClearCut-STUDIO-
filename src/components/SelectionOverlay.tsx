import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Trash2,
  X,
  Layers,
  Lock,
  Grid,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowUpLeft,
  Maximize2,
  Sliders,
  Play,
  Film,
} from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import {
  SelectionShapeType,
  ShapeRect,
  SelectionData,
} from '../utils/selectionProcessing';

interface SelectionOverlayProps {
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  zoomLevel?: number;
  panOffset?: { x: number; y: number };
  viewportRef?: React.RefObject<HTMLDivElement | null>;
  toolMode: 'off' | 'wand' | 'shape';
  activeShape: SelectionShapeType;
  shapeRect: ShapeRect;
  onChangeShapeRect: (rect: ShapeRect) => void;
  activeSelection: SelectionData | null;
  isInverted: boolean;
  onToggleInvert: () => void;
  onDeleteSelection: () => void;
  onDeselect: () => void;
  onOpenSlideshow?: () => void;
}

const COMMON_SPRITE_SIZES = [16, 24, 32, 48, 64, 128, 256];

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  zoomLevel = 1,
  panOffset,
  viewportRef,
  toolMode,
  activeShape,
  shapeRect,
  onChangeShapeRect,
  activeSelection,
  isInverted,
  onToggleInvert,
  onDeleteSelection,
  onDeselect,
  onOpenSlideshow,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dispBounds, setDispBounds] = useState<{ width: number; height: number }>({
    width: containerWidth || 800,
    height: containerHeight || 600,
  });

  // Inverse zoom scale factor so grab handles and detent badge NEVER scale with zoom
  const invZoom = 1 / Math.max(0.05, zoomLevel);

  const [isSnapping1to1, setIsSnapping1to1] = useState(false);
  const wasInSnapDetentRef = useRef(false);
  const [showGridStepper, setShowGridStepper] = useState(false);

  // Measure rendered canvas size
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

  const scale = dispBounds.width > 0 && imageWidth > 0 ? dispBounds.width / imageWidth : 1;

  // Interaction tracking for dragging & resizing
  const isDraggingRef = useRef<string | null>(null);
  const startPosRef = useRef<{
    clientX: number;
    clientY: number;
    initialRect: ShapeRect;
  }>({
    clientX: 0,
    clientY: 0,
    initialRect: shapeRect,
  });

  const shapeRectRef = useRef(shapeRect);
  useEffect(() => {
    shapeRectRef.current = shapeRect;
  }, [shapeRect]);

  // Wand mask overlay canvas
  const wandMaskCanvasRef = useRef<HTMLCanvasElement>(null);

  // Render Magic Wand mask onto overlay canvas
  useEffect(() => {
    if (toolMode !== 'wand' || !activeSelection) return;
    const canvas = wandMaskCanvasRef.current;
    if (!canvas) return;

    canvas.width = activeSelection.width;
    canvas.height = activeSelection.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const maskImgData = ctx.createImageData(canvas.width, canvas.height);
    const data = maskImgData.data;
    const total = canvas.width * canvas.height;
    const mask = activeSelection.mask;

    for (let i = 0; i < total; i++) {
      const isSelected = mask[i] === 1;
      const shouldHighlight = isInverted ? !isSelected : isSelected;

      if (shouldHighlight) {
        const idx = i * 4;
        data[idx] = 99; // Indigo/Purple tint
        data[idx + 1] = 102;
        data[idx + 2] = 241;
        data[idx + 3] = 90; // Alpha
      }
    }

    ctx.putImageData(maskImgData, 0, 0);
  }, [toolMode, activeSelection, isInverted]);

  // Handle pointer down on handles
  const handleHandlePointerDown = (e: React.PointerEvent, handle: string) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    isDraggingRef.current = handle;
    startPosRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialRect: { ...shapeRectRef.current },
    };
    wasInSnapDetentRef.current = false;
    triggerHaptic('light');
  };

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();

      const handle = isDraggingRef.current;
      const { clientX: startX, clientY: startY, initialRect } = startPosRef.current;

      const deltaScreenX = e.clientX - startX;
      const deltaScreenY = e.clientY - startY;

      const effectiveScale = (scale || 1) * (zoomLevel || 1);
      const deltaImgX = deltaScreenX / effectiveScale;
      const deltaImgY = deltaScreenY / effectiveScale;

      const minDim = 8; // minimum width/height in image pixels

      let newX = initialRect.x;
      let newY = initialRect.y;
      let newW = initialRect.width;
      let newH = initialRect.height;

      if (handle === 'move') {
        newX = Math.max(0, Math.min(imageWidth - newW, Math.round(initialRect.x + deltaImgX)));
        newY = Math.max(0, Math.min(imageHeight - newH, Math.round(initialRect.y + deltaImgY)));
      } else {
        if (handle.includes('e')) {
          newW = Math.max(minDim, Math.min(imageWidth - initialRect.x, Math.round(initialRect.width + deltaImgX)));
        }
        if (handle.includes('s')) {
          newH = Math.max(minDim, Math.min(imageHeight - initialRect.y, Math.round(initialRect.height + deltaImgY)));
        }
        if (handle.includes('w')) {
          const maxLeftShift = initialRect.width - minDim;
          const shift = Math.max(-initialRect.x, Math.min(maxLeftShift, deltaImgX));
          newX = Math.round(initialRect.x + shift);
          newW = Math.round(initialRect.width - shift);
        }
        if (handle.includes('n')) {
          const maxUpShift = initialRect.height - minDim;
          const shift = Math.max(-initialRect.y, Math.min(maxUpShift, deltaImgY));
          newY = Math.round(initialRect.y + shift);
          newH = Math.round(initialRect.height - shift);
        }

        // DETENT MECHANISM FOR 1:1 RATIO:
        const isCorner = ['nw', 'ne', 'se', 'sw'].includes(handle);
        if (isCorner) {
          const detentThresholdPx = 14 / (scale * (zoomLevel || 1));
          const diff = Math.abs(newW - newH);

          if (diff <= detentThresholdPx) {
            const average = Math.round((newW + newH) / 2);
            const snappedDim = Math.max(minDim, Math.min(imageWidth - newX, imageHeight - newY, average));

            if (handle.includes('w')) {
              newX = Math.max(0, newX + (newW - snappedDim));
            }
            if (handle.includes('n')) {
              newY = Math.max(0, newY + (newH - snappedDim));
            }

            newW = snappedDim;
            newH = snappedDim;

            if (!wasInSnapDetentRef.current) {
              triggerHaptic('light');
              wasInSnapDetentRef.current = true;
            }
            setIsSnapping1to1(true);
          } else {
            wasInSnapDetentRef.current = false;
            setIsSnapping1to1(false);
          }
        } else {
          setIsSnapping1to1(false);
        }
      }

      onChangeShapeRect({
        x: Math.max(0, Math.min(imageWidth - minDim, newX)),
        y: Math.max(0, Math.min(imageHeight - minDim, newY)),
        width: Math.max(minDim, newW),
        height: Math.max(minDim, newH),
      });
    },
    [scale, zoomLevel, imageWidth, imageHeight, onChangeShapeRect]
  );

  const handlePointerUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = null;
      setIsSnapping1to1(false);
      wasInSnapDetentRef.current = false;
      triggerHaptic('selection');
    }
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  // Stepper helper actions for Shape Selection
  const nudgeShape = useCallback(
    (dx: number, dy: number) => {
      triggerHaptic('light');
      onChangeShapeRect({
        ...shapeRect,
        x: Math.max(0, Math.min(imageWidth - shapeRect.width, shapeRect.x + dx)),
        y: Math.max(0, Math.min(imageHeight - shapeRect.height, shapeRect.y + dy)),
      });
    },
    [shapeRect, imageWidth, imageHeight, onChangeShapeRect]
  );

  const snapShapeOrigin = useCallback(() => {
    triggerHaptic('medium');
    onChangeShapeRect({
      ...shapeRect,
      x: 0,
      y: 0,
    });
  }, [shapeRect, onChangeShapeRect]);

  const snapShapeSize = useCallback(
    (size: number) => {
      triggerHaptic('success');
      const clamped = Math.min(imageWidth, imageHeight, size);
      onChangeShapeRect({
        x: Math.max(0, Math.min(imageWidth - clamped, shapeRect.x)),
        y: Math.max(0, Math.min(imageHeight - clamped, shapeRect.y)),
        width: clamped,
        height: clamped,
      });
    },
    [shapeRect, imageWidth, imageHeight, onChangeShapeRect]
  );

  // Compute screen-space positions for shape bounding box on canvas
  const screenRect = useMemo(() => {
    return {
      left: shapeRect.x * scale,
      top: shapeRect.y * scale,
      width: shapeRect.width * scale,
      height: shapeRect.height * scale,
    };
  }, [shapeRect, scale]);

  // Build SVG path for shape in local screen coordinates
  const shapeSvgPath = useMemo(() => {
    const w = screenRect.width;
    const h = screenRect.height;
    if (w <= 0 || h <= 0) return '';

    switch (activeShape) {
      case 'rect':
        return `M 0 0 H ${w} V ${h} H 0 Z`;
      case 'circle': {
        const rx = w / 2;
        const ry = h / 2;
        return `M ${rx} 0 A ${rx} ${ry} 0 1 1 ${rx} ${h} A ${rx} ${ry} 0 1 1 ${rx} 0 Z`;
      }
      case 'star': {
        const cx = w / 2;
        const cy = h / 2;
        const rx = w / 2;
        const ry = h / 2;
        const points = 5;
        const step = Math.PI / points;
        let angle = -Math.PI / 2;
        let path = '';
        for (let i = 0; i < points * 2; i++) {
          const r = i % 2 === 0 ? 1 : 0.42;
          const px = cx + Math.cos(angle) * rx * r;
          const py = cy + Math.sin(angle) * ry * r;
          path += i === 0 ? `M ${px} ${py} ` : `L ${px} ${py} `;
          angle += step;
        }
        return path + 'Z';
      }
      case 'diamond': {
        const cx = w / 2;
        const cy = h / 2;
        return `M ${cx} 0 L ${w} ${cy} L ${cx} ${h} L 0 ${cy} Z`;
      }
      default:
        return `M 0 0 H ${w} V ${h} H 0 Z`;
    }
  }, [activeShape, screenRect.width, screenRect.height]);

  const hasActiveSelection =
    toolMode === 'shape' || (toolMode === 'wand' && activeSelection !== null && activeSelection.pixelCount > 0);

  // Dynamic Viewport-Relative Coordinates for the Floating Action Popup (FAP)
  const [fapCoords, setFapCoords] = useState<{ left: number; top: number; isFlipped: boolean } | null>(null);

  useEffect(() => {
    if (!hasActiveSelection) {
      setFapCoords(null);
      return;
    }

    const computeCoords = () => {
      const containerEl = containerRef.current;
      const viewportEl = viewportRef?.current;
      if (!containerEl || !viewportEl) return;

      const containerBounds = containerEl.getBoundingClientRect();
      const viewportBounds = viewportEl.getBoundingClientRect();

      // Canvas offset inside viewport
      const offsetCanvasX = containerBounds.left - viewportBounds.left;
      const offsetCanvasY = containerBounds.top - viewportBounds.top;
      const renderedScale = containerBounds.width / imageWidth;

      let selLeft = 0;
      let selTop = 0;
      let selWidth = 0;
      let selHeight = 0;

      if (toolMode === 'shape') {
        selLeft = offsetCanvasX + shapeRect.x * renderedScale;
        selTop = offsetCanvasY + shapeRect.y * renderedScale;
        selWidth = shapeRect.width * renderedScale;
        selHeight = shapeRect.height * renderedScale;
      } else if (activeSelection) {
        const b = activeSelection.bounds;
        selLeft = offsetCanvasX + b.minX * renderedScale;
        selTop = offsetCanvasY + b.minY * renderedScale;
        selWidth = (b.maxX - b.minX) * renderedScale;
        selHeight = (b.maxY - b.minY) * renderedScale;
      }

      const approxPopupW = showGridStepper ? 360 : 420;
      const approxPopupH = showGridStepper ? 180 : 50;

      const centerX = selLeft + selWidth / 2;
      const bottomY = selTop + selHeight;
      const topY = selTop;

      // Smart auto-flip: default placed 14px below selection bottom
      let targetTop = bottomY + 14;
      let isFlipped = false;

      // If it overflows viewport bottom, flip to above selection
      if (targetTop + approxPopupH > viewportBounds.height - 16) {
        targetTop = topY - approxPopupH - 14;
        isFlipped = true;
      }

      // If it overflows viewport top as well, dock at viewport bottom
      if (targetTop < 16) {
        targetTop = viewportBounds.height - approxPopupH - 20;
      }

      // Clamp horizontally within viewport
      let targetLeft = centerX - approxPopupW / 2;
      targetLeft = Math.max(16, Math.min(viewportBounds.width - approxPopupW - 16, targetLeft));

      setFapCoords({
        left: targetLeft,
        top: targetTop,
        isFlipped,
      });
    };

    computeCoords();
    window.addEventListener('resize', computeCoords);
    return () => window.removeEventListener('resize', computeCoords);
  }, [
    hasActiveSelection,
    toolMode,
    shapeRect,
    activeSelection,
    imageWidth,
    showGridStepper,
    zoomLevel,
    panOffset,
    viewportRef,
  ]);

  // VIEWER-LEVEL COORDINATES FLAG:
  // Rendered directly into the viewport layer so it NEVER gets cropped by the image boundary
  const [viewerFlagCoords, setViewerFlagCoords] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!hasActiveSelection) {
      setViewerFlagCoords(null);
      return;
    }

    const updateViewerFlag = () => {
      const containerEl = containerRef.current;
      const viewportEl = viewportRef?.current;
      if (!containerEl || !viewportEl) {
        setViewerFlagCoords(null);
        return;
      }

      const containerBounds = containerEl.getBoundingClientRect();
      const viewportBounds = viewportEl.getBoundingClientRect();

      const offsetCanvasX = containerBounds.left - viewportBounds.left;
      const offsetCanvasY = containerBounds.top - viewportBounds.top;
      const renderedScale = containerBounds.width / imageWidth;

      let selLeft = 0;
      let selTop = 0;

      if (toolMode === 'shape') {
        selLeft = offsetCanvasX + shapeRect.x * renderedScale;
        selTop = offsetCanvasY + shapeRect.y * renderedScale;
      } else if (activeSelection) {
        selLeft = offsetCanvasX + activeSelection.bounds.minX * renderedScale;
        selTop = offsetCanvasY + activeSelection.bounds.minY * renderedScale;
      }

      const flagW = 210;
      const flagH = 28;

      // By default: 10px above the top-left corner
      let top = selTop - flagH - 8;
      // If overflowing the top of the viewport (closer than 10px from top):
      if (top < 10) {
        // Flip inside the selection box
        top = selTop + 8;
      }

      // Clamp horizontally within viewport margins so it NEVER gets clipped
      let left = Math.max(12, Math.min(viewportBounds.width - flagW - 12, selLeft));

      setViewerFlagCoords({ left, top });
    };

    updateViewerFlag();
    window.addEventListener('resize', updateViewerFlag);
    return () => window.removeEventListener('resize', updateViewerFlag);
  }, [
    hasActiveSelection,
    toolMode,
    shapeRect,
    activeSelection,
    imageWidth,
    zoomLevel,
    panOffset,
    viewportRef,
  ]);

  // Sprite Frame calculations
  const frameCol = Math.floor(shapeRect.x / Math.max(1, shapeRect.width));
  const frameRow = Math.floor(shapeRect.y / Math.max(1, shapeRect.height));
  const totalCols = Math.max(1, Math.floor(imageWidth / Math.max(1, shapeRect.width)));
  const totalRows = Math.max(1, Math.floor(imageHeight / Math.max(1, shapeRect.height)));
  const totalFrames = totalCols * totalRows;
  const frameIndex = frameRow * totalCols + frameCol + 1;

  // Viewport-Layer Hybrid Pop-up Content
  const popupElement = hasActiveSelection && (
    <div
      style={{
        left: fapCoords ? `${fapCoords.left}px` : '50%',
        top: fapCoords ? `${fapCoords.top}px` : 'auto',
        bottom: !fapCoords ? '20px' : 'auto',
        transform: !fapCoords ? 'translateX(-50%)' : 'none',
      }}
      className="absolute pointer-events-auto z-40 flex flex-col items-center gap-1.5 animate-in fade-in duration-150 select-none max-w-[96vw]"
    >
      {/* Sprite Grid Stepper Drawer (Expandable for pixel/sprite manipulation) */}
      {showGridStepper && toolMode === 'shape' && (
        <div className="w-[340px] sm:w-[380px] bg-slate-900/95 border border-purple-500/50 rounded-2xl p-3 shadow-2xl backdrop-blur-xl text-slate-200 animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex flex-wrap items-center justify-between gap-1 pb-1.5 border-b border-slate-800 text-[11px] font-mono">
            <div className="flex items-center gap-1 text-purple-300 font-semibold">
              <Grid className="w-3.5 h-3.5" />
              <span>
                Col {frameCol}, Row {frameRow} (#{frameIndex}/{totalFrames})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-slate-400 text-[10px]">
                [{shapeRect.x}, {shapeRect.y}]
              </div>
              {onOpenSlideshow && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap');
                    onOpenSlideshow();
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-sans text-[11px] font-bold transition active:scale-95 cursor-pointer shadow-md shadow-indigo-600/30"
                  title="Play slideshow animation of frames across this grid"
                >
                  <Play className="w-2.5 h-2.5 fill-current text-emerald-300" />
                  <span>Slideshow</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Sprite Size Snapping */}
          <div className="mt-2 flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[10px] text-slate-400 font-medium shrink-0">Snap Size:</span>
            {COMMON_SPRITE_SIZES.map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => snapShapeSize(sz)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer shrink-0 border ${
                  Math.round(shapeRect.width) === sz && Math.round(shapeRect.height) === sz
                    ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                {sz}px
              </button>
            ))}
          </div>

          {/* Frame Stepper Buttons */}
          <div className="grid grid-cols-5 gap-1 text-[11px] mt-2">
            <button
              type="button"
              onClick={snapShapeOrigin}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg py-1.5 font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Snap shape to top-left origin (0, 0)"
            >
              <ArrowUpLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>(0,0)</span>
            </button>

            <button
              type="button"
              onClick={() => nudgeShape(-shapeRect.width, 0)}
              disabled={shapeRect.x <= 0}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 border border-slate-700 rounded-lg py-1.5 font-mono flex items-center justify-center gap-0.5 transition cursor-pointer"
              title="Step left by one frame (-W)"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>-Col</span>
            </button>

            <button
              type="button"
              onClick={() => nudgeShape(shapeRect.width, 0)}
              disabled={shapeRect.x >= imageWidth - shapeRect.width}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 border border-slate-700 rounded-lg py-1.5 font-mono flex items-center justify-center gap-0.5 transition cursor-pointer"
              title="Step right by one frame (+W)"
            >
              <span>+Col</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => nudgeShape(0, -shapeRect.height)}
              disabled={shapeRect.y <= 0}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 border border-slate-700 rounded-lg py-1.5 font-mono flex items-center justify-center gap-0.5 transition cursor-pointer"
              title="Step up by one row (-H)"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>-Row</span>
            </button>

            <button
              type="button"
              onClick={() => nudgeShape(0, shapeRect.height)}
              disabled={shapeRect.y >= imageHeight - shapeRect.height}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 border border-slate-700 rounded-lg py-1.5 font-mono flex items-center justify-center gap-0.5 transition cursor-pointer"
              title="Step down by one row (+H)"
            >
              <span>+Row</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 1px Fine Nudge */}
          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800 text-[10px] text-slate-400">
            <span>1-Pixel Nudge:</span>
            <div className="flex items-center gap-1 font-mono">
              <button
                type="button"
                onClick={() => nudgeShape(-1, 0)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                ← 1px
              </button>
              <button
                type="button"
                onClick={() => nudgeShape(1, 0)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                +1px →
              </button>
              <button
                type="button"
                onClick={() => nudgeShape(0, -1)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                ↑ 1px
              </button>
              <button
                type="button"
                onClick={() => nudgeShape(0, 1)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                +1px ↓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Floating Action Bar */}
      <div className="flex items-center gap-1.5 bg-slate-900/95 border border-slate-700/80 px-2.5 py-1.5 rounded-2xl shadow-2xl backdrop-blur-md whitespace-nowrap">
        {/* Dimension & Upper-Left (X, Y) Coordinates Badge */}
        <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/90 rounded-xl border border-slate-700/60 font-mono text-[11px] text-slate-200">
          {toolMode === 'shape' ? (
            <div className="flex items-center gap-1.5">
              <span className="text-purple-300 font-semibold">
                X:{Math.round(shapeRect.x)} Y:{Math.round(shapeRect.y)}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-emerald-300 font-bold">
                {Math.round(shapeRect.width)}×{Math.round(shapeRect.height)}
              </span>
              {Math.abs(shapeRect.width - shapeRect.height) <= 1 && (
                <span className="text-indigo-400 text-[10px] font-sans font-bold">(1:1)</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {activeSelection && (
                <>
                  <span className="text-indigo-300 font-semibold">
                    X:{activeSelection.bounds.minX} Y:{activeSelection.bounds.minY}
                  </span>
                  <span className="text-slate-500">•</span>
                </>
              )}
              <span className="text-emerald-300 font-bold">
                {activeSelection ? `${activeSelection.pixelCount.toLocaleString()} px` : 'Selected'}
              </span>
            </div>
          )}
        </div>

        {/* Shape Grid Stepper Toggle */}
        {toolMode === 'shape' && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap');
              setShowGridStepper((prev) => !prev);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-semibold transition active:scale-95 cursor-pointer border ${
              showGridStepper
                ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700 hover:border-slate-600'
            }`}
            title="Toggle Sprite Grid Stepper & Pixel Nudge controls"
          >
            <Grid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Grid</span>
          </button>
        )}

        <div className="h-4 w-px bg-slate-800 mx-0.5" />

        {/* Invert Selection Toggle */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap');
            onToggleInvert();
          }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold transition active:scale-95 cursor-pointer border ${
            isInverted
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
              : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700 hover:border-slate-600'
          }`}
          title="Invert Selection (target pixels inside vs outside)"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{isInverted ? 'Inverted' : 'Invert'}</span>
        </button>

        {/* Delete Selected Pixels */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            onDeleteSelection();
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer bg-rose-500/15 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/40 hover:border-rose-400 shadow-sm"
          title="Delete selected pixels to transparent (Undoable)"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>

        {/* Deselect / Dismiss */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap');
            onDeselect();
          }}
          className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95 cursor-pointer"
          title="Deselect"
          aria-label="Deselect"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none select-none overflow-visible z-20"
      style={{ width: '100%', height: '100%' }}
    >
      {/* 1. MAGIC WAND MASK CANVAS DISPLAY */}
      {toolMode === 'wand' && activeSelection && (
        <canvas
          ref={wandMaskCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]"
        />
      )}

      {/* 2. SHAPE SELECTION BOUNDING BOX & VECTOR OVERLAY */}
      {toolMode === 'shape' && (
        <div
          className="absolute pointer-events-auto touch-none"
          style={{
            left: `${screenRect.left}px`,
            top: `${screenRect.top}px`,
            width: `${screenRect.width}px`,
            height: `${screenRect.height}px`,
          }}
        >
          {/* SVG Shape Path with animated marching-ants dash & glowing fill */}
          <svg
            className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
            viewBox={`0 0 ${screenRect.width} ${screenRect.height}`}
          >
            {/* Soft background translucent fill */}
            <path
              d={shapeSvgPath}
              fill={isInverted ? 'rgba(15, 23, 42, 0.45)' : 'rgba(147, 51, 234, 0.22)'}
            />

            {/* Glowing outer contour */}
            <path
              d={shapeSvgPath}
              fill="none"
              stroke="rgba(168, 85, 247, 0.9)"
              strokeWidth={3}
              className="drop-shadow-[0_0_6px_rgba(168,85,247,0.7)]"
            />

            {/* Marching ants crisp dash line */}
            <path
              d={shapeSvgPath}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1.8}
              strokeDasharray="6 4"
            />
          </svg>

          {/* Move Handle: Click and drag center of bounding box to translate */}
          <div
            onPointerDown={(e) => handleHandlePointerDown(e, 'move')}
            className="absolute inset-3 cursor-move flex items-center justify-center group pointer-events-auto"
            title="Drag to move selection"
          >
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 backdrop-blur-sm px-2 py-0.5 rounded-full border border-purple-500/50 text-[10px] text-purple-200 font-mono flex items-center gap-1 shadow-lg">
              <Maximize2 className="w-2.5 h-2.5 text-purple-400" />
              <span>Move</span>
            </div>
          </div>

          {/* 1:1 Snap Detent Badge (counter-scaled so it stays crisp at all zoom levels) */}
          {isSnapping1to1 && (
            <div
              style={{
                transform: `translate(-50%, -100%) scale(${invZoom})`,
                transformOrigin: 'bottom center',
              }}
              className="absolute -top-2 left-1/2 pointer-events-none bg-indigo-600/95 text-white border border-indigo-400/80 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg shadow-indigo-950/80 flex items-center gap-1 animate-in zoom-in-95 duration-100 z-40 whitespace-nowrap"
            >
              <Lock className="w-2.5 h-2.5" />
              <span>1:1 Detent ({Math.round(shapeRect.width)}px)</span>
            </div>
          )}

          {/* 
            8 Bounding Box Grab Handles
            Centered exactly on corners and edges with translate(-50%, -50%) and counter-scaled by invZoom
            so they NEVER scale with zooming and maintain a consistent screen target size!
          */}
          {[
            { id: 'nw', cursor: 'nwse-resize', left: '0%', top: '0%' },
            { id: 'n', cursor: 'ns-resize', left: '50%', top: '0%' },
            { id: 'ne', cursor: 'nesw-resize', left: '100%', top: '0%' },
            { id: 'e', cursor: 'ew-resize', left: '100%', top: '50%' },
            { id: 'se', cursor: 'nwse-resize', left: '100%', top: '100%' },
            { id: 's', cursor: 'ns-resize', left: '50%', top: '100%' },
            { id: 'sw', cursor: 'nesw-resize', left: '0%', top: '100%' },
            { id: 'w', cursor: 'ew-resize', left: '0%', top: '50%' },
          ].map((h) => (
            <div
              key={h.id}
              onPointerDown={(e) => handleHandlePointerDown(e, h.id)}
              style={{
                left: h.left,
                top: h.top,
                transform: `translate(-50%, -50%) scale(${invZoom})`,
                cursor: h.cursor,
                touchAction: 'none',
              }}
              className="absolute w-7 h-7 flex items-center justify-center z-30 pointer-events-auto select-none group touch-none"
              title={`Drag to resize ${h.id}`}
            >
              <div className="w-3.5 h-3.5 rounded-sm bg-white border-2 border-purple-600 shadow-md group-hover:scale-125 group-active:scale-125 transition-transform" />
            </div>
          ))}
        </div>
      )}

      {/* Render Viewer-Layer Portal Elements: Coordinates Flag & Action Popup */}
      {viewportRef?.current
        ? createPortal(
            <>
              {/* 1. VIEWER-LAYER COORDINATES & DIMENSION FLAG */}
              {viewerFlagCoords && (
                <div
                  style={{
                    left: `${viewerFlagCoords.left}px`,
                    top: `${viewerFlagCoords.top}px`,
                  }}
                  className="absolute pointer-events-none select-none z-35 flex items-center gap-2 rounded-lg bg-slate-900/95 border border-purple-500/70 px-2.5 py-1 text-[11px] font-mono text-slate-200 shadow-xl backdrop-blur-md whitespace-nowrap animate-in fade-in duration-100 ring-1 ring-black/40"
                >
                  {toolMode === 'shape' ? (
                    <>
                      <div className="flex items-center gap-1 text-purple-300 font-semibold">
                        <span>X: {Math.round(shapeRect.x)}</span>
                        <span className="text-slate-500">|</span>
                        <span>Y: {Math.round(shapeRect.y)}</span>
                      </div>
                      <span className="text-slate-500">•</span>
                      <div className="text-emerald-300 font-bold">
                        {Math.round(shapeRect.width)} × {Math.round(shapeRect.height)} px
                      </div>
                      {Math.abs(shapeRect.width - shapeRect.height) <= 1 && (
                        <span className="bg-purple-500/25 text-purple-300 border border-purple-400/40 rounded px-1.5 py-0.2 text-[10px] font-sans font-semibold">
                          1:1
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {activeSelection && (
                        <div className="flex items-center gap-1 text-indigo-300 font-semibold">
                          <span>X: {activeSelection.bounds.minX}</span>
                          <span className="text-slate-500">|</span>
                          <span>Y: {activeSelection.bounds.minY}</span>
                          <span className="text-slate-500">•</span>
                          <span className="text-emerald-300 font-bold">
                            {activeSelection.bounds.maxX - activeSelection.bounds.minX} × {activeSelection.bounds.maxY - activeSelection.bounds.minY} px
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* 2. MAIN FLOATING ACTION POP-UP (FAP) */}
              {popupElement}
            </>,
            viewportRef.current
          )
        : (
            <>
              {popupElement}
            </>
          )}
    </div>
  );
};
