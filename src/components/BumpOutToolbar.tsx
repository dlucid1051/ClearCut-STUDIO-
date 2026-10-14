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
  minBrushSize?: number;
  maxBrushSize?: number;
}

export const BumpOutToolbar: React.FC<BumpOutToolbarProps> = ({
  toolMode,
  onChangeToolMode,
  brushSize,
  onChangeBrushSize,
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
  const startTimeRef = useRef<number>(0);
  const hasDraggedRef = useRef<boolean>(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentBrushSizeRef = useRef<number>(brushSize);

  useEffect(() => {
    currentBrushSizeRef.current = brushSize;
  }, [brushSize]);

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
    const dist = Math.hypot(e.clientX - startXRef.current, e.clientY - startYRef.current);

    // If movement exceeds small drag threshold (3px), enter dragging mode
    if (dist > 3 || Math.abs(deltaY) > 2) {
      if (!hasDraggedRef.current) {
        hasDraggedRef.current = true;
        setIsDragging(true);
      }

      // Drag sensitivity: 1px movement = ~0.75px size change
      const sensitivity = 0.75;
      const computedSize = Math.max(
        minBrushSize,
        Math.min(
          maxBrushSize,
          Math.round(startSizeRef.current + deltaY * sensitivity)
        )
      );

      if (computedSize !== currentBrushSizeRef.current) {
        onChangeBrushSize(computedSize);
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
        title={`Mode: ${meta.label} (Tap to toggle: Off → Erase → Restore • Drag vertically to resize brush)`}
        aria-label={`${meta.label} tool. Click to toggle mode. Drag up/down to adjust size (${brushSize}px).`}
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
        Appears to the right of the bump while click-holding / dragging vertically to adjust size
      */}
      {showCallout && (
        <div
          className="ml-3 pointer-events-none flex items-center gap-3.5 bg-slate-900/95 border border-slate-700/80 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md z-40 animate-in fade-in zoom-in-95 duration-100"
          style={{ minWidth: '190px' }}
        >
          {/* Triangular Flag Tip pointing directly back to the bump */}
          <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rotate-45 bg-slate-900 border-l border-b border-slate-700/80" />

          {/* Left Column: Tool mode badge, size number, and drag hint */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${meta.badgeClasses}`}
              >
                {meta.fullLabel}
              </span>
            </div>

            <div className="flex items-baseline gap-1">
              <span className="font-mono text-2xl font-black text-white tracking-tight">
                {brushSize}
              </span>
              <span className="font-mono text-xs text-slate-400 font-semibold">px</span>
            </div>

            <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5 font-medium">
              <div className="flex flex-col -space-y-1">
                <ChevronUp className="w-2.5 h-2.5 text-slate-400" />
                <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <span>Drag to resize</span>
            </div>
          </div>

          {/* Right Column: Footprint Circle Preview representing the exact effect area */}
          <div className="w-14 h-14 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-center shrink-0 relative overflow-hidden shadow-inner">
            <div
              className={`rounded-full border-2 flex items-center justify-center transition-all duration-75 ${meta.previewClasses}`}
              style={{
                width: `${footprintDiameter}px`,
                height: `${footprintDiameter}px`,
              }}
            >
              <div className={`w-1 h-1 rounded-full ${meta.dotClass}`} />
            </div>
          </div>
        </div>
      )}

      {/* Subtle Desktop Hover Tooltip when not actively interacting */}
      {!showCallout && isHovered && (
        <div className="ml-2.5 pointer-events-none hidden sm:flex items-center bg-slate-900/90 border border-slate-800 text-slate-300 text-[11px] font-medium px-2.5 py-1 rounded-lg shadow-lg backdrop-blur-sm whitespace-nowrap animate-in fade-in duration-150">
          <span className="text-white font-semibold mr-1.5">{meta.label}:</span>
          <span>Click to toggle • Drag ↕ to resize</span>
        </div>
      )}
    </div>
  );
};
