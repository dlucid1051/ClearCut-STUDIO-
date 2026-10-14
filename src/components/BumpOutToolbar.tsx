import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Eraser,
  Paintbrush,
  MousePointer,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

export type MaskToolMode = 'off' | 'eraser' | 'brush';

interface BumpOutToolbarProps {
  toolMode: MaskToolMode;
  onChangeToolMode: (mode: MaskToolMode) => void;
  brushSize: number; // in canvas pixels, e.g. 6 to 120
  onChangeBrushSize: (size: number) => void;
  brushHardness?: number; // 0 to 100
  onChangeBrushHardness?: (hardness: number) => void;
  minBrushSize?: number;
  maxBrushSize?: number;
}

export const BumpOutToolbar: React.FC<BumpOutToolbarProps> = ({
  toolMode,
  onChangeToolMode,
  brushSize,
  onChangeBrushSize,
  brushHardness = 100,
  onChangeBrushHardness,
  minBrushSize = 6,
  maxBrushSize = 120,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Interaction tracking refs
  const isPointerDownRef = useRef<boolean>(false);
  const pointerIdRef = useRef<number | null>(null);
  const startYRef = useRef<number>(0);
  const startXRef = useRef<number>(0);
  const startSizeRef = useRef<number>(brushSize);
  const startHardnessRef = useRef<number>(brushHardness);
  const startTimeRef = useRef<number>(0);
  const hasDraggedRef = useRef<boolean>(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentBrushSizeRef = useRef<number>(brushSize);
  const currentHardnessRef = useRef<number>(brushHardness);

  useEffect(() => {
    currentBrushSizeRef.current = brushSize;
  }, [brushSize]);

  useEffect(() => {
    currentHardnessRef.current = brushHardness;
  }, [brushHardness]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    // Only filter mouse clicks (allow all touch/stylus pointers)
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    isPointerDownRef.current = true;
    pointerIdRef.current = e.pointerId;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    startSizeRef.current = currentBrushSizeRef.current;
    startHardnessRef.current = currentHardnessRef.current;
    startTimeRef.current = Date.now();
    hasDraggedRef.current = false;

    // Trigger subtle touch feedback
    triggerHaptic('light');

    // Show callout flag if user click-holds for > 150ms
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      if (isPointerDownRef.current) {
        setIsHolding(true);
      }
    }, 150);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isPointerDownRef.current) return;
    e.preventDefault();

    const deltaY = startYRef.current - e.clientY; // dragging UP is positive (increases size)
    const deltaX = e.clientX - startXRef.current; // dragging RIGHT (inward from left bezel)
    const dist = Math.hypot(e.clientX - startXRef.current, e.clientY - startYRef.current);

    // If movement exceeds small drag threshold (3px), enter dragging mode
    if (dist > 3 || Math.abs(deltaY) > 2 || Math.abs(deltaX) > 2) {
      if (!hasDraggedRef.current) {
        hasDraggedRef.current = true;
        setIsDragging(true);
      }

      // 1. Vertical drag (Y-axis): Brush Size
      const sensitivityY = 0.75;
      const computedSize = Math.max(
        minBrushSize,
        Math.min(
          maxBrushSize,
          Math.round(startSizeRef.current + deltaY * sensitivityY)
        )
      );

      if (computedSize !== currentBrushSizeRef.current) {
        onChangeBrushSize(computedSize);
      }

      // 2. Horizontal drag (X-axis): Brush Hardness (0 to 100)
      if (onChangeBrushHardness) {
        const absDeltaX = Math.abs(deltaX);
        if (absDeltaX > 5) {
          // Dragging rightward into canvas softens the brush (reduces hardness from 100% to 0%)
          // Dragging leftward back to edge hardens it (increases hardness up to 100%)
          const effectiveDeltaX = (absDeltaX - 5) * Math.sign(deltaX);
          const sensitivityX = 0.55;
          const computedHardness = Math.max(
            0,
            Math.min(100, Math.round(startHardnessRef.current - effectiveDeltaX * sensitivityX))
          );
          if (computedHardness !== currentHardnessRef.current) {
            onChangeBrushHardness(computedHardness);
          }
        }
      }
    }
  };

  const finishInteraction = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isPointerDownRef.current) return;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const elapsed = Date.now() - startTimeRef.current;
    const wasDragged = hasDraggedRef.current;

    isPointerDownRef.current = false;
    pointerIdRef.current = null;
    setIsDragging(false);
    setIsHolding(false);

    // If it was clicked and immediately released without dragging
    if (!wasDragged && elapsed < 450) {
      // Cycle: Off -> Eraser -> Brush -> Off
      const nextMode: MaskToolMode =
        toolMode === 'off'
          ? 'eraser'
          : toolMode === 'eraser'
          ? 'brush'
          : 'off';

      onChangeToolMode(nextMode);
      triggerHaptic('selection');
    } else if (wasDragged) {
      triggerHaptic('light');
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    finishInteraction(e);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    finishInteraction(e);
  };

  // Keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const nextMode: MaskToolMode =
        toolMode === 'off' ? 'eraser' : toolMode === 'eraser' ? 'brush' : 'off';
      onChangeToolMode(nextMode);
      triggerHaptic('selection');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onChangeBrushSize(Math.min(maxBrushSize, brushSize + 4));
      triggerHaptic('light');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onChangeBrushSize(Math.max(minBrushSize, brushSize - 4));
      triggerHaptic('light');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (onChangeBrushHardness) {
        onChangeBrushHardness(Math.max(0, brushHardness - 5));
        triggerHaptic('light');
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (onChangeBrushHardness) {
        onChangeBrushHardness(Math.min(100, brushHardness + 5));
        triggerHaptic('light');
      }
    }
  };

  // Determine appearance based on tool mode
  const getToolMeta = () => {
    switch (toolMode) {
      case 'eraser':
        return {
          label: 'Erase',
          fullLabel: 'Eraser',
          colorName: 'red',
          bumpClasses:
            'bg-rose-500 hover:bg-rose-600 text-white border-rose-400 shadow-rose-950/50 shadow-lg ring-2 ring-rose-500/30',
          badgeClasses: 'text-rose-400 border-rose-500/40 bg-rose-500/10',
          previewClasses: 'border-rose-400 bg-rose-500/30 text-rose-300',
          dotClass: 'bg-rose-400',
          icon: <Eraser className="w-5 h-5 drop-shadow-sm" />,
        };
      case 'brush':
        return {
          label: 'Restore',
          fullLabel: 'Restore Brush',
          colorName: 'green',
          bumpClasses:
            'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-400 shadow-emerald-950/50 shadow-lg ring-2 ring-emerald-500/30',
          badgeClasses: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
          previewClasses: 'border-emerald-400 bg-emerald-500/30 text-emerald-300',
          dotClass: 'bg-emerald-400',
          icon: <Paintbrush className="w-5 h-5 drop-shadow-sm" />,
        };
      case 'off':
      default:
        return {
          label: 'Off',
          fullLabel: 'Tool Off',
          colorName: 'none',
          bumpClasses:
            'bg-slate-800/90 hover:bg-slate-700/90 text-slate-300 hover:text-white border-slate-700/80 shadow-black/40 shadow-md',
          badgeClasses: 'text-slate-400 border-slate-600 bg-slate-800/60',
          previewClasses: 'border-slate-400 bg-slate-500/25 text-slate-300',
          dotClass: 'bg-slate-400',
          icon: <MousePointer className="w-5 h-5" />,
        };
    }
  };

  const meta = getToolMeta();
  const showCallout = isDragging || isHolding;

  // Footprint preview diameter scaled to a max of 46px within callout frame
  const footprintDiameter = Math.max(
    6,
    Math.min(46, Math.round((brushSize / maxBrushSize) * 46))
  );

  return (
    <div
      className="absolute left-0 top-1/2 -translate-y-1/2 z-30 flex items-center select-none"
      aria-label="Erase and Restore Bump Tool"
    >
      {/* 
        Minimal Half-Circle / Oval Bump 
        Flush with viewport left edge, sized minimally to wrap the icon
      */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`group relative flex items-center justify-center w-10 h-12 rounded-r-full rounded-l-none border-y border-r border-l-0 transition-transform cursor-pointer touch-none active:scale-95 ${
          meta.bumpClasses
        } ${isDragging ? 'scale-105 shadow-2xl' : ''}`}
        title={`Mode: ${meta.label} (Tap to toggle: Off → Erase → Restore • Drag vertically for size • Drag horizontally for hardness)`}
        aria-label={`${meta.label} tool. Click to toggle mode. Drag up/down for size (${brushSize}px), right/left for hardness (${brushHardness}%).`}
      >
        {/* Tool Icon with slight left padding to center nicely inside the half-oval curve */}
        <div className="pl-0.5 flex items-center justify-center transition-transform group-active:scale-90">
          {meta.icon}
        </div>

        {/* Subtle pulse indicator when in active Erase or Restore mode */}
        {toolMode !== 'off' && !isDragging && (
          <span
            className={`absolute -top-0.5 right-1 w-2 h-2 rounded-full ring-2 ring-slate-900 ${
              toolMode === 'eraser' ? 'bg-rose-300 animate-pulse' : 'bg-emerald-300 animate-pulse'
            }`}
          />
        )}
      </button>

      {/* 
        Call-out (Flag) Popout:
        Appears to the right of the bump while click-holding / dragging 2D to adjust size & hardness
      */}
      {showCallout && (
        <div
          className="ml-3 pointer-events-none flex items-center gap-3.5 bg-slate-900/95 border border-slate-700/80 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md z-40 animate-in fade-in zoom-in-95 duration-100"
          style={{ minWidth: '225px' }}
        >
          {/* Triangular Flag Tip pointing directly back to the bump */}
          <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rotate-45 bg-slate-900 border-l border-b border-slate-700/80" />

          {/* Left Column: Tool mode badge, size number, hardness, and drag hints */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${meta.badgeClasses}`}
              >
                {meta.fullLabel} 2D
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Size Indicator */}
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">↕ Size</span>
                <div className="flex items-baseline gap-0.5">
                  <span className="font-mono text-xl font-black text-white tracking-tight">
                    {brushSize}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 font-semibold">px</span>
                </div>
              </div>

              <div className="h-6 w-px bg-slate-800" />

              {/* Hardness Indicator */}
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">⟶ Hard</span>
                <div className="flex items-baseline gap-0.5">
                  <span className="font-mono text-xl font-black text-white tracking-tight">
                    {brushHardness}
                  </span>
                  <span className="font-mono text-[10px] text-amber-400 font-semibold">%</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1 font-medium">
              <span className="text-slate-300 font-bold">↕ Drag:</span>
              <span>Size</span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-400 font-bold">⟶ Drag:</span>
              <span>Softness</span>
            </div>
          </div>

          {/* Right Column: Footprint Circle Preview with dynamic softness blur */}
          <div className="w-14 h-14 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-center shrink-0 relative overflow-hidden shadow-inner">
            <div
              className={`rounded-full border-2 flex items-center justify-center transition-all duration-75 ${meta.previewClasses}`}
              style={{
                width: `${footprintDiameter}px`,
                height: `${footprintDiameter}px`,
                filter: brushHardness < 98 ? `blur(${Math.min(3.5, ((100 - brushHardness) / 100) * 3.5)}px)` : 'none',
                boxShadow: brushHardness < 98 ? `0 0 ${Math.round(((100 - brushHardness) / 100) * 8)}px currentColor` : 'none',
              }}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
            </div>
          </div>
        </div>
      )}

      {/* Subtle Desktop Hover Tooltip when not actively interacting */}
      {!showCallout && isHovered && (
        <div className="ml-2.5 pointer-events-none hidden sm:flex items-center bg-slate-900/90 border border-slate-800 text-slate-300 text-[11px] font-medium px-2.5 py-1 rounded-lg shadow-lg backdrop-blur-sm whitespace-nowrap animate-in fade-in duration-150">
          <span className="text-white font-semibold mr-1.5">{meta.label}:</span>
          <span>Click to toggle • Drag ↕ for size • Drag ⟶ for hardness</span>
        </div>
      )}
    </div>
  );
};
