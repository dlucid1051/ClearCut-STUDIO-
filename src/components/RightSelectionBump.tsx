import React, { useState, useRef, useEffect } from 'react';
import {
  Wand2,
  Square,
  Circle,
  Star,
  Diamond,
  MousePointer,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import { SelectionShapeType } from '../utils/selectionProcessing';

export type SelectionToolMode = 'off' | 'wand' | 'shape';

interface RightSelectionBumpProps {
  toolMode: SelectionToolMode;
  onChangeToolMode: (mode: SelectionToolMode) => void;
  tolerance: number; // 5 to 100
  onChangeTolerance: (tolerance: number) => void;
  feather?: number; // 0 to 20 px
  onChangeFeather?: (feather: number) => void;
  activeShape: SelectionShapeType;
  onChangeShape: (shape: SelectionShapeType) => void;
}

const SHAPES: { type: SelectionShapeType; label: string; icon: React.ReactNode }[] = [
  { type: 'rect', label: 'Rectangle / Square', icon: <Square className="w-5 h-5 drop-shadow-sm" /> },
  { type: 'circle', label: 'Circle / Ellipse', icon: <Circle className="w-5 h-5 drop-shadow-sm" /> },
  { type: 'star', label: '5-Point Star', icon: <Star className="w-5 h-5 drop-shadow-sm" /> },
  { type: 'diamond', label: 'Diamond', icon: <Diamond className="w-5 h-5 drop-shadow-sm" /> },
];

export const RightSelectionBump: React.FC<RightSelectionBumpProps> = ({
  toolMode,
  onChangeToolMode,
  tolerance,
  onChangeTolerance,
  feather = 0,
  onChangeFeather,
  activeShape,
  onChangeShape,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Interaction tracking refs
  const isPointerDownRef = useRef<boolean>(false);
  const pointerIdRef = useRef<number | null>(null);
  const startYRef = useRef<number>(0);
  const startXRef = useRef<number>(0);
  const startValRef = useRef<number>(tolerance);
  const startFeatherRef = useRef<number>(feather);
  const startTimeRef = useRef<number>(0);
  const hasDraggedRef = useRef<boolean>(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentToleranceRef = useRef<number>(tolerance);
  const currentFeatherRef = useRef<number>(feather);
  const currentShapeRef = useRef<SelectionShapeType>(activeShape);
  const shapeDragAccRef = useRef<number>(0);

  useEffect(() => {
    currentToleranceRef.current = tolerance;
  }, [tolerance]);

  useEffect(() => {
    currentFeatherRef.current = feather;
  }, [feather]);

  useEffect(() => {
    currentShapeRef.current = activeShape;
  }, [activeShape]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
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
    startValRef.current = currentToleranceRef.current;
    startFeatherRef.current = currentFeatherRef.current;
    startTimeRef.current = Date.now();
    hasDraggedRef.current = false;
    shapeDragAccRef.current = 0;

    triggerHaptic('light');

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

    const deltaY = startYRef.current - e.clientY; // Upward is positive -> Tolerance
    const deltaX = startXRef.current - e.clientX; // Leftward (pulling into screen) is positive -> Feather
    const dist = Math.hypot(e.clientX - startXRef.current, e.clientY - startYRef.current);

    if (dist > 3 || Math.abs(deltaY) > 2 || Math.abs(deltaX) > 2) {
      if (!hasDraggedRef.current) {
        hasDraggedRef.current = true;
        setIsDragging(true);
      }

      if (toolMode === 'wand') {
        // 1. Vertical drag (Y-axis): Tolerance (5 to 100)
        const sensitivityY = 0.55;
        const computedTol = Math.max(
          5,
          Math.min(100, Math.round(startValRef.current + deltaY * sensitivityY))
        );
        if (computedTol !== currentToleranceRef.current) {
          onChangeTolerance(computedTol);
        }

        // 2. Horizontal drag (X-axis): Feather (0 to 20 px)
        if (onChangeFeather) {
          const absDeltaX = Math.abs(deltaX);
          if (absDeltaX > 5) {
            const effectiveDeltaX = (absDeltaX - 5) * Math.sign(deltaX);
            const sensitivityX = 0.12; // ~8px of drag per 1px feather
            const computedFeather = Math.max(
              0,
              Math.min(20, Math.round(startFeatherRef.current + effectiveDeltaX * sensitivityX))
            );
            if (computedFeather !== currentFeatherRef.current) {
              onChangeFeather(computedFeather);
            }
          }
        }
      } else if (toolMode === 'shape') {
        // Drag to cycle shapes
        const stepThreshold = 38; // px to advance to next shape
        const currentIdx = SHAPES.findIndex((s) => s.type === currentShapeRef.current);
        const steps = Math.floor(deltaY / stepThreshold);
        if (steps !== shapeDragAccRef.current) {
          const deltaStep = steps - shapeDragAccRef.current;
          shapeDragAccRef.current = steps;
          const nextIdx = (currentIdx - deltaStep + SHAPES.length * 10) % SHAPES.length;
          onChangeShape(SHAPES[nextIdx].type);
          triggerHaptic('selection');
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

    // If it was clicked and released without dragging: Cycle modes: Off -> Wand -> Shape -> Off
    if (!wasDragged && elapsed < 450) {
      const nextMode: SelectionToolMode =
        toolMode === 'off'
          ? 'wand'
          : toolMode === 'wand'
          ? 'shape'
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
      const nextMode: SelectionToolMode =
        toolMode === 'off' ? 'wand' : toolMode === 'wand' ? 'shape' : 'off';
      onChangeToolMode(nextMode);
      triggerHaptic('selection');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (toolMode === 'wand') {
        onChangeTolerance(Math.min(100, tolerance + 5));
        triggerHaptic('light');
      } else if (toolMode === 'shape') {
        const curIdx = SHAPES.findIndex((s) => s.type === activeShape);
        const nextIdx = (curIdx + 1) % SHAPES.length;
        onChangeShape(SHAPES[nextIdx].type);
        triggerHaptic('selection');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (toolMode === 'wand') {
        onChangeTolerance(Math.max(5, tolerance - 5));
        triggerHaptic('light');
      } else if (toolMode === 'shape') {
        const curIdx = SHAPES.findIndex((s) => s.type === activeShape);
        const nextIdx = (curIdx - 1 + SHAPES.length) % SHAPES.length;
        onChangeShape(SHAPES[nextIdx].type);
        triggerHaptic('selection');
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (toolMode === 'wand' && onChangeFeather) {
        onChangeFeather(Math.min(20, feather + 1));
        triggerHaptic('light');
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (toolMode === 'wand' && onChangeFeather) {
        onChangeFeather(Math.max(0, feather - 1));
        triggerHaptic('light');
      }
    }
  };

  const currentShapeObj = SHAPES.find((s) => s.type === activeShape) || SHAPES[0];

  const getToolMeta = () => {
    switch (toolMode) {
      case 'wand':
        return {
          label: 'Wand',
          fullLabel: 'Magic Wand',
          bumpClasses:
            'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400 shadow-indigo-950/50 shadow-lg ring-2 ring-indigo-500/30',
          badgeClasses: 'text-indigo-400 border-indigo-500/40 bg-indigo-500/10',
          icon: <Wand2 className="w-5 h-5 drop-shadow-sm" />,
          accentColor: 'indigo',
        };
      case 'shape':
        return {
          label: 'Shape',
          fullLabel: currentShapeObj.label,
          bumpClasses:
            'bg-purple-600 hover:bg-purple-500 text-white border-purple-400 shadow-purple-950/50 shadow-lg ring-2 ring-purple-500/30',
          badgeClasses: 'text-purple-400 border-purple-500/40 bg-purple-500/10',
          icon: currentShapeObj.icon,
          accentColor: 'purple',
        };
      case 'off':
      default:
        return {
          label: 'Select',
          fullLabel: 'Selection Off',
          bumpClasses:
            'bg-slate-800/90 hover:bg-slate-700/90 text-slate-300 hover:text-white border-slate-700/80 shadow-black/40 shadow-md',
          badgeClasses: 'text-slate-400 border-slate-600 bg-slate-800/60',
          icon: <MousePointer className="w-5 h-5 -scale-x-100" />,
          accentColor: 'slate',
        };
    }
  };

  const meta = getToolMeta();
  const showCallout = isDragging || isHolding;

  return (
    <div
      className="absolute right-0 top-1/2 -translate-y-1/2 z-30 flex items-center select-none"
      aria-label="Selection Bump Tool"
    >
      {/* 
        Call-out (Flag) Popout:
        Appears to the LEFT of the right bump when dragging/holding
      */}
      {showCallout && (
        <div
          className="mr-3 pointer-events-none flex items-center gap-3.5 bg-slate-900/95 border border-slate-700/80 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md z-40 animate-in fade-in zoom-in-95 duration-100 relative"
          style={{ minWidth: toolMode === 'wand' ? '225px' : '190px' }}
        >
          {/* Triangular Flag Tip pointing right to the bump */}
          <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rotate-45 bg-slate-900 border-r border-t border-slate-700/80" />

          {/* Left Column: Details */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${meta.badgeClasses}`}
              >
                {toolMode === 'wand' ? 'Magic Wand 2D' : 'Shape Select'}
              </span>
            </div>

            {toolMode === 'wand' ? (
              <>
                <div className="flex items-center gap-3">
                  {/* Tolerance Indicator */}
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">↕ Tol</span>
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-mono text-xl font-black text-white tracking-tight">
                        {tolerance}
                      </span>
                      <span className="font-mono text-[10px] text-indigo-400 font-semibold">%</span>
                    </div>
                  </div>

                  <div className="h-6 w-px bg-slate-800" />

                  {/* Feather Indicator */}
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">⟵ Feather</span>
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-mono text-xl font-black text-white tracking-tight">
                        {feather}
                      </span>
                      <span className="font-mono text-[10px] text-cyan-400 font-semibold">px</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1 font-medium">
                  <span className="text-indigo-400 font-bold">↕ Drag:</span>
                  <span>Tol</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-cyan-400 font-bold">⟵ Drag:</span>
                  <span>Feather</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-bold text-white tracking-tight capitalize truncate max-w-[110px]">
                    {activeShape}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5 font-medium">
                  <div className="flex flex-col -space-y-1">
                    <ChevronUp className="w-2.5 h-2.5 text-slate-400" />
                    <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
                  </div>
                  <span>Drag ↕ to cycle shape</span>
                </div>
              </>
            )}
          </div>

          {/* Right Column: Shape or Tolerance + Feather Visualizer */}
          <div className="w-14 h-14 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-center shrink-0 relative overflow-hidden shadow-inner">
            {toolMode === 'wand' ? (
              <div
                className="rounded-full border-2 border-indigo-400 bg-indigo-500/30 flex items-center justify-center transition-all duration-75"
                style={{
                  width: `${Math.max(10, Math.min(44, Math.round((tolerance / 100) * 44)))}px`,
                  height: `${Math.max(10, Math.min(44, Math.round((tolerance / 100) * 44)))}px`,
                  boxShadow: feather > 0 ? `0 0 ${feather * 1.5}px rgba(99, 102, 241, 0.85)` : 'none',
                  filter: feather > 0 ? `blur(${Math.min(3.5, feather * 0.25)}px)` : 'none',
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              </div>
            ) : (
              <div className="text-purple-400 flex items-center justify-center">
                {activeShape === 'rect' && <Square className="w-7 h-7 text-purple-400" />}
                {activeShape === 'circle' && <Circle className="w-7 h-7 text-purple-400" />}
                {activeShape === 'star' && <Star className="w-7 h-7 text-purple-400 fill-purple-400/20" />}
                {activeShape === 'diamond' && <Diamond className="w-7 h-7 text-purple-400 fill-purple-400/20" />}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subtle Desktop Hover Tooltip */}
      {!showCallout && isHovered && (
        <div className="mr-2.5 pointer-events-none hidden sm:flex items-center bg-slate-900/90 border border-slate-800 text-slate-300 text-[11px] font-medium px-2.5 py-1 rounded-lg shadow-lg backdrop-blur-sm whitespace-nowrap animate-in fade-in duration-150">
          <span className="text-white font-semibold mr-1.5">{meta.label}:</span>
          <span>
            {toolMode === 'wand'
              ? 'Click to toggle • Drag ↕ for tolerance • Drag ⟵ for feather'
              : toolMode === 'shape'
              ? 'Click to toggle • Drag ↕ for shapes'
              : 'Click to select (Wand / Shape)'}
          </span>
        </div>
      )}

      {/* 
        Minimal Half-Circle / Oval Bump 
        Flush with viewport right edge, sized minimally to wrap the icon
        w-10 h-12 rounded-l-full rounded-r-none border-y border-l border-r-0
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
        className={`group relative flex items-center justify-center w-10 h-12 rounded-l-full rounded-r-none border-y border-l border-r-0 transition-transform cursor-pointer touch-none active:scale-95 ${
          meta.bumpClasses
        } ${isDragging ? 'scale-105 shadow-2xl' : ''}`}
        title={`Selection Tool: ${meta.label} (Tap to cycle: Off → Wand → Shape • Drag vertically to adjust)`}
        aria-label={`${meta.label} selection tool. Click to toggle mode. Drag up/down to adjust.`}
      >
        {/* Tool Icon with slight right padding to center nicely inside the left-curved oval */}
        <div className="pr-0.5 flex items-center justify-center transition-transform group-active:scale-90">
          {meta.icon}
        </div>

        {/* Subtle pulse indicator when in active selection mode */}
        {toolMode !== 'off' && !isDragging && (
          <span
            className={`absolute -top-0.5 left-1 w-2 h-2 rounded-full ring-2 ring-slate-900 ${
              toolMode === 'wand' ? 'bg-indigo-300 animate-pulse' : 'bg-purple-300 animate-pulse'
            }`}
          />
        )}
      </button>
    </div>
  );
};
