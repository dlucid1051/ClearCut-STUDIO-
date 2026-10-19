import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Film,
  ZoomIn,
  ZoomOut,
  Repeat,
  Check,
  CheckCircle2,
  Camera,
  Layers,
  FolderArchive,
  Loader2,
} from 'lucide-react';
import JSZip from 'jszip';
import { triggerHaptic } from '../utils/haptics';
import {
  canvasToPngBlob,
  canvasToWebpBlob,
  downloadBlob,
  copyImageToClipboard,
} from '../utils/imageProcessing';

interface SpriteSlideshowModalProps {
  sourceCanvas: HTMLCanvasElement;
  frameWidth: number;
  frameHeight: number;
  initialCol?: number;
  initialRow?: number;
  imageWidth: number;
  imageHeight: number;
  onSelectFrame?: (frameX: number, frameY: number) => void;
  onClose: () => void;
  showToast?: (
    title: string,
    message: string,
    type: 'loading' | 'success' | 'error',
    durationMs?: number
  ) => void;
}

type LoopMode = 'loop' | 'pingpong' | 'once';
type ZoomMode = 1 | 2 | 4 | 8;
type BackgroundMode = 'checker-dark' | 'checker-light' | 'white' | 'dark';

export const SpriteSlideshowModal: React.FC<SpriteSlideshowModalProps> = ({
  sourceCanvas,
  frameWidth: rawFrameW,
  frameHeight: rawFrameH,
  initialCol = 0,
  initialRow = 0,
  imageWidth,
  imageHeight,
  onSelectFrame,
  onClose,
  showToast,
}) => {
  // Safe clamped frame dimensions
  const frameWidth = Math.max(4, Math.min(imageWidth, Math.round(rawFrameW)));
  const frameHeight = Math.max(4, Math.min(imageHeight, Math.round(rawFrameH)));

  // Grid calculations based on image dimensions and frame size
  const totalCols = Math.max(1, Math.floor(imageWidth / frameWidth));
  const totalRows = Math.max(1, Math.floor(imageHeight / frameHeight));
  const totalFrames = totalCols * totalRows;

  // Frame indices (0-indexed)
  const initialIndex = Math.min(
    totalFrames - 1,
    Math.max(0, initialRow * totalCols + initialCol)
  );

  const [currentFrame, setCurrentFrame] = useState<number>(initialIndex);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [fps, setFps] = useState<number>(8); // 8 FPS default for pixel art
  const [loopMode, setLoopMode] = useState<LoopMode>('loop');
  const [zoom, setZoom] = useState<ZoomMode>(4); // 4x default zoom so small sprites are visible
  const [bgMode, setBgMode] = useState<BackgroundMode>('checker-dark');
  const [showOnionSkin, setShowOnionSkin] = useState<boolean>(false);

  // Playback direction for ping-pong
  const pingPongDirectionRef = useRef<1 | -1>(1);

  // Frame Range filter (for cycling specific animations like walk cycle or attack)
  const [startFrame, setStartFrame] = useState<number>(0);
  const [endFrame, setEndFrame] = useState<number>(totalFrames - 1);

  // Capture all frames & export modal state
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<'png' | 'webp'>('png');
  const [webpQuality, setWebpQuality] = useState<number>(0.95);
  const [isCapturingAll, setIsCapturingAll] = useState<boolean>(false);
  const [exportPercent, setExportPercent] = useState<number>(0);
  const [exportStageMessage, setExportStageMessage] = useState<string>('');
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);

  // Donut Progress Meter dimensions
  const DONUT_RADIUS = 38;
  const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS; // ~238.76
  const strokeDashoffset =
    DONUT_CIRCUMFERENCE - (Math.min(100, Math.max(0, exportPercent)) / 100) * DONUT_CIRCUMFERENCE;

  // References
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<number | null>(null);

  // Extract frame coordinates
  const getFrameCoords = useCallback(
    (index: number) => {
      const col = index % totalCols;
      const row = Math.floor(index / totalCols);
      return {
        col,
        row,
        x: col * frameWidth,
        y: row * frameHeight,
      };
    },
    [totalCols, frameWidth, frameHeight]
  );

  // Advance frame
  const nextFrame = useCallback(() => {
    setCurrentFrame((prev) => {
      const minF = Math.min(startFrame, endFrame);
      const maxF = Math.max(startFrame, endFrame);

      if (loopMode === 'loop') {
        if (prev >= maxF) return minF;
        return prev + 1;
      }

      if (loopMode === 'pingpong') {
        let dir = pingPongDirectionRef.current;
        let next = prev + dir;
        if (next >= maxF) {
          next = maxF;
          pingPongDirectionRef.current = -1;
        } else if (next <= minF) {
          next = minF;
          pingPongDirectionRef.current = 1;
        }
        return next;
      }

      // Once
      if (prev >= maxF) {
        setIsPlaying(false);
        return maxF;
      }
      return prev + 1;
    });
  }, [loopMode, startFrame, endFrame]);

  const prevFrame = useCallback(() => {
    setCurrentFrame((prev) => {
      const minF = Math.min(startFrame, endFrame);
      const maxF = Math.max(startFrame, endFrame);
      if (prev <= minF) return maxF;
      return prev - 1;
    });
  }, [startFrame, endFrame]);

  // Animation playback interval
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const intervalMs = Math.max(16, Math.round(1000 / fps));
    timerRef.current = window.setInterval(() => {
      nextFrame();
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, fps, nextFrame]);

  // Keyboard controls: Space to play/pause, Left/Right arrow to step
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        triggerHaptic('tap');
        setIsPlaying((p) => !p);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        triggerHaptic('light');
        nextFrame();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        triggerHaptic('light');
        prevFrame();
      } else if (e.code === 'Escape') {
        if (showExportModal) {
          if (!isCapturingAll) {
            triggerHaptic('tap');
            setShowExportModal(false);
          }
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextFrame, prevFrame, onClose, showExportModal, isCapturingAll]);

  // Render current frame to the preview canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    canvas.width = frameWidth;
    canvas.height = frameHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, frameWidth, frameHeight);

    // Optional Onion Skin (previous frame faintly rendered)
    if (showOnionSkin && totalFrames > 1) {
      const minF = Math.min(startFrame, endFrame);
      const maxF = Math.max(startFrame, endFrame);
      const prevIdx = currentFrame <= minF ? maxF : currentFrame - 1;
      const prevCoords = getFrameCoords(prevIdx);

      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.drawImage(
        sourceCanvas,
        prevCoords.x,
        prevCoords.y,
        frameWidth,
        frameHeight,
        0,
        0,
        frameWidth,
        frameHeight
      );
      ctx.restore();
    }

    // Current frame
    const coords = getFrameCoords(currentFrame);
    ctx.drawImage(
      sourceCanvas,
      coords.x,
      coords.y,
      frameWidth,
      frameHeight,
      0,
      0,
      frameWidth,
      frameHeight
    );
  }, [
    currentFrame,
    frameWidth,
    frameHeight,
    sourceCanvas,
    showOnionSkin,
    startFrame,
    endFrame,
    totalFrames,
    getFrameCoords,
  ]);

  // Current frame coordinates and metadata
  const currentCoords = useMemo(() => getFrameCoords(currentFrame), [currentFrame, getFrameCoords]);

  // Background style for preview box
  const getPreviewBgStyle = () => {
    switch (bgMode) {
      case 'white':
        return { backgroundColor: '#ffffff' };
      case 'dark':
        return { backgroundColor: '#020617' };
      case 'checker-light':
        return {
          backgroundImage:
            'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
          backgroundSize: '16px 16px',
          backgroundColor: '#ffffff',
        };
      case 'checker-dark':
      default:
        return {
          backgroundImage:
            'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
          backgroundSize: '16px 16px',
          backgroundColor: '#0f172a',
        };
    }
  };

  // Capture single frame screenshot
  const handleCaptureCurrentFrame = async () => {
    triggerHaptic('medium');
    try {
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = frameWidth;
      captureCanvas.height = frameHeight;
      const ctx = captureCanvas.getContext('2d');
      if (!ctx) return;

      if (bgMode === 'white') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, frameWidth, frameHeight);
      } else if (bgMode === 'dark') {
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, frameWidth, frameHeight);
      }

      ctx.drawImage(
        sourceCanvas,
        currentCoords.x,
        currentCoords.y,
        frameWidth,
        frameHeight,
        0,
        0,
        frameWidth,
        frameHeight
      );

      const blob = await canvasToPngBlob(captureCanvas);
      const filename = `sprite-frame-${currentFrame + 1}-${frameWidth}x${frameHeight}.png`;
      await downloadBlob(blob, filename);

      let copied = false;
      try {
        copied = await copyImageToClipboard(captureCanvas);
      } catch {
        copied = false;
      }

      triggerHaptic('success');
      showToast?.(
        'Frame Captured!',
        copied
          ? `Saved ${filename} & copied to clipboard.`
          : `Saved ${filename}.`,
        'success'
      );
    } catch (err) {
      console.error('Failed to capture frame:', err);
    }
  };

  // Capture ALL frames into a bundled ZIP archive with user-selected format (PNG or WebP)
  const handleStartExport = async () => {
    if (isCapturingAll || totalFrames <= 0) return;
    triggerHaptic('medium');
    setIsCapturingAll(true);
    setExportPercent(2);
    setExportSuccess(false);
    setExportStageMessage(`Preparing ${totalFrames} frames...`);

    const format = exportFormat;
    const isWebp = format === 'webp';
    const ext = isWebp ? 'webp' : 'png';

    try {
      const zip = new JSZip();
      const padDigits = Math.max(2, String(totalFrames).length);

      // Create horizontal sprite sheet / animation strip canvas
      const stripCanvas = document.createElement('canvas');
      stripCanvas.width = frameWidth * totalFrames;
      stripCanvas.height = frameHeight;
      const stripCtx = stripCanvas.getContext('2d');

      if (stripCtx && (bgMode === 'white' || bgMode === 'dark')) {
        stripCtx.fillStyle = bgMode === 'white' ? '#ffffff' : '#020617';
        stripCtx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);
      }

      // Generate individual frames and assemble strip
      for (let i = 0; i < totalFrames; i++) {
        const frameNum = i + 1;
        const framePercent = Math.max(3, Math.round((frameNum / totalFrames) * 70));
        setExportPercent(framePercent);
        setExportStageMessage(
          `Extracting frame ${frameNum} of ${totalFrames} (${ext.toUpperCase()})...`
        );

        const coords = getFrameCoords(i);
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = frameWidth;
        frameCanvas.height = frameHeight;
        const ctx = frameCanvas.getContext('2d');

        if (ctx) {
          if (bgMode === 'white') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, frameWidth, frameHeight);
          } else if (bgMode === 'dark') {
            ctx.fillStyle = '#020617';
            ctx.fillRect(0, 0, frameWidth, frameHeight);
          }

          ctx.drawImage(
            sourceCanvas,
            coords.x,
            coords.y,
            frameWidth,
            frameHeight,
            0,
            0,
            frameWidth,
            frameHeight
          );

          // Draw onto strip canvas
          if (stripCtx) {
            stripCtx.drawImage(
              frameCanvas,
              0,
              0,
              frameWidth,
              frameHeight,
              i * frameWidth,
              0,
              frameWidth,
              frameHeight
            );
          }

          const blob = isWebp
            ? await canvasToWebpBlob(frameCanvas, webpQuality)
            : await canvasToPngBlob(frameCanvas);
          const numStr = String(frameNum).padStart(padDigits, '0');
          zip.file(`frame_${numStr}_col${coords.col}_row${coords.row}.${ext}`, blob);
        }

        // Brief yield for UI responsiveness on large frame counts
        if (i % 4 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      // Add the assembled horizontal sprite sheet strip
      setExportPercent(74);
      setExportStageMessage(`Assembling ${ext.toUpperCase()} animation strip...`);
      if (stripCtx) {
        const stripBlob = isWebp
          ? await canvasToWebpBlob(stripCanvas, webpQuality)
          : await canvasToPngBlob(stripCanvas);
        zip.file(
          `spritesheet_strip_${totalFrames}frames_${frameWidth * totalFrames}x${frameHeight}.${ext}`,
          stripBlob
        );
      }

      setExportPercent(78);
      setExportStageMessage('Compressing frames into ZIP archive...');

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const timeTag = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const zipFilename = `sprite-frames-${totalFrames}pcs-${ext}-${frameWidth}x${frameHeight}-${timeTag}.zip`;

      const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        const zipFraction = Math.max(0, Math.min(1, metadata.percent / 100));
        const pct = Math.round(78 + zipFraction * 21);
        setExportPercent(pct);
        setExportStageMessage(`Compressing ZIP archive (${Math.round(metadata.percent)}%)...`);
      });

      setExportPercent(100);
      setExportStageMessage('ZIP ready! Downloading...');
      setExportSuccess(true);
      await downloadBlob(zipBlob, zipFilename);

      triggerHaptic('success');
      showToast?.(
        'All Frames Captured!',
        `Saved ${totalFrames} ${ext.toUpperCase()} frames & sprite strip in ${zipFilename}.`,
        'success',
        3500
      );

      // Auto-close modal after brief celebration
      setTimeout(() => {
        setShowExportModal(false);
        setIsCapturingAll(false);
        setExportSuccess(false);
        setExportPercent(0);
      }, 1200);
    } catch (err) {
      console.error('Failed to capture all frames:', err);
      triggerHaptic('error');
      setExportStageMessage('Export failed. Please try again.');
      showToast?.('Export Failed', 'Could not generate frame zip archive.', 'error');
      setIsCapturingAll(false);
    }
  };

  // Apply current frame to active crop
  const handleApplyFrameToCrop = () => {
    triggerHaptic('success');
    onSelectFrame?.(currentCoords.x, currentCoords.y);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl border border-slate-700/80 bg-slate-900/95 shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                Sprite Slideshow Player
                <span className="text-[11px] font-mono font-normal px-2 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-800/60 text-indigo-300">
                  {frameWidth}×{frameHeight}px
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                {totalCols} cols × {totalRows} rows • {totalFrames} frames detected
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              triggerHaptic('tap');
              onClose();
            }}
            className="rounded-xl p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Close Slideshow (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Center Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Main Visual Display Stage */}
          <div className="flex flex-col items-center">
            {/* Stage Container */}
            <div
              style={getPreviewBgStyle()}
              className="relative w-full h-56 sm:h-64 rounded-2xl border border-slate-700/80 flex items-center justify-center overflow-hidden shadow-inner"
            >
              <canvas
                ref={previewCanvasRef}
                style={{
                  imageRendering: 'pixelated',
                  width: `${frameWidth * zoom}px`,
                  height: `${frameHeight * zoom}px`,
                  maxWidth: '90%',
                  maxHeight: '90%',
                  objectFit: 'contain',
                }}
                className="drop-shadow-2xl transition-[width,height] duration-150 select-none"
              />

              {/* Floating Stage Controls (Top-Right): Zoom & Background */}
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/70 p-1 rounded-xl shadow-lg">
                {/* Zoom factor toggles */}
                <div className="flex items-center gap-0.5 text-[11px] font-mono text-slate-300 mr-1">
                  {([1, 2, 4, 8] as ZoomMode[]).map((z) => (
                    <button
                      key={z}
                      onClick={() => {
                        triggerHaptic('light');
                        setZoom(z);
                      }}
                      className={`px-1.5 py-0.5 rounded-md transition cursor-pointer ${
                        zoom === z
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                      title={`Zoom ${z}x`}
                    >
                      {z}×
                    </button>
                  ))}
                </div>

                <div className="w-px h-3.5 bg-slate-700" />

                {/* BG Mode Toggle */}
                <button
                  onClick={() => {
                    triggerHaptic('tap');
                    const modes: BackgroundMode[] = [
                      'checker-dark',
                      'checker-light',
                      'white',
                      'dark',
                    ];
                    const next = modes[(modes.indexOf(bgMode) + 1) % modes.length];
                    setBgMode(next);
                  }}
                  className="px-2 py-0.5 text-[10px] font-semibold text-slate-300 hover:text-white rounded-md hover:bg-slate-800 transition cursor-pointer"
                  title="Cycle preview background (Dark Grid, Light Grid, White, Dark)"
                >
                  BG
                </button>
              </div>

              {/* Floating Stage Indicator (Top-Left): Current Frame info */}
              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/70 px-2.5 py-1 rounded-xl font-mono text-xs shadow-lg">
                <span className="text-emerald-400 font-bold">
                  #{currentFrame + 1}
                </span>
                <span className="text-slate-500">/</span>
                <span className="text-slate-400">{totalFrames}</span>
                <span className="text-slate-600">•</span>
                <span className="text-indigo-300 text-[11px]">
                  Col {currentCoords.col}, Row {currentCoords.row}
                </span>
              </div>
            </div>

            {/* Playback Transport Bar */}
            <div className="w-full mt-3 flex flex-wrap items-center justify-between gap-2 bg-slate-800/80 border border-slate-700/60 p-2 rounded-2xl">
              {/* Play / Step Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setIsPlaying(false);
                    setCurrentFrame(startFrame);
                  }}
                  className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                  title="Reset to First Frame"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setIsPlaying(false);
                    prevFrame();
                  }}
                  className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                  title="Previous Frame (Left Arrow)"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    triggerHaptic('medium');
                    setIsPlaying((p) => !p);
                  }}
                  className={`flex items-center gap-1 px-4 py-2 rounded-xl font-bold text-xs transition active:scale-95 cursor-pointer shadow-md ${
                    isPlaying
                      ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                  }`}
                  title="Play / Pause (Spacebar)"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Play</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setIsPlaying(false);
                    nextFrame();
                  }}
                  className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                  title="Next Frame (Right Arrow)"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Loop Mode & Onion Skin */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    triggerHaptic('tap');
                    const modes: LoopMode[] = ['loop', 'pingpong', 'once'];
                    const next = modes[(modes.indexOf(loopMode) + 1) % modes.length];
                    setLoopMode(next);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-900/60 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition cursor-pointer"
                  title={`Loop mode: ${loopMode}`}
                >
                  <Repeat className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="capitalize">{loopMode}</span>
                </button>

                <button
                  onClick={() => {
                    triggerHaptic('tap');
                    setShowOnionSkin((s) => !s);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    showOnionSkin
                      ? 'border-indigo-500 bg-indigo-950/80 text-indigo-300'
                      : 'border-slate-700 bg-slate-900/60 hover:bg-slate-700 text-slate-400'
                  }`}
                  title="Toggle Onion Skinning (overlay previous frame at 25% opacity)"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Ghost</span>
                </button>
              </div>

              {/* Speed / FPS Selector */}
              <div className="flex items-center gap-1.5 border-l border-slate-700/60 pl-2">
                <span className="text-[11px] text-slate-400 font-mono">Speed:</span>
                {[4, 8, 12, 24].map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      triggerHaptic('light');
                      setFps(f);
                    }}
                    className={`px-2 py-1 rounded-lg text-xs font-mono transition cursor-pointer ${
                      fps === f
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'bg-slate-900/70 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60'
                    }`}
                  >
                    {f}
                  </button>
                ))}
                <span className="text-[10px] text-slate-500 font-mono">FPS</span>
              </div>
            </div>
          </div>

          {/* Timeline Scrubber */}
          <div className="space-y-1.5 bg-slate-800/40 p-3 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Timeline:</span>
              <span className="text-slate-200">
                Frame {currentFrame + 1} of {totalFrames}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={totalFrames - 1}
              value={currentFrame}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentFrame(parseInt(e.target.value, 10));
              }}
              className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg appearance-none"
            />
          </div>

          {/* Filmstrip / Thumbnail Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
              <span className="flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-indigo-400" />
                <span>Frames ({totalFrames}):</span>
              </span>
              <span className="text-[11px] text-slate-400">Click any frame to jump</span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 no-scrollbar max-w-full">
              {Array.from({ length: Math.min(totalFrames, 48) }).map((_, idx) => {
                const c = getFrameCoords(idx);
                const isSelected = currentFrame === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setIsPlaying(false);
                      setCurrentFrame(idx);
                    }}
                    className={`relative shrink-0 flex flex-col items-center justify-center p-1 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-indigo-400 bg-indigo-950/80 ring-2 ring-indigo-500/50 shadow-md'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-850'
                    }`}
                    style={{ width: '64px', height: '64px' }}
                    title={`Frame #${idx + 1} (Col ${c.col}, Row ${c.row}) [${c.x}, ${c.y}]`}
                  >
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        backgroundImage: `url(${sourceCanvas.toDataURL()})`,
                        backgroundPosition: `-${c.x * (42 / frameWidth)}px -${c.y * (42 / frameHeight)}px`,
                        backgroundSize: `${imageWidth * (42 / frameWidth)}px ${imageHeight * (42 / frameHeight)}px`,
                        imageRendering: 'pixelated',
                      }}
                      className="rounded"
                    />
                    <span className="absolute bottom-0.5 right-1 text-[9px] font-mono text-slate-400">
                      #{idx + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCaptureCurrentFrame}
              disabled={isCapturingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Save PNG screenshot of current frame"
            >
              <Camera className="w-3.5 h-3.5 text-indigo-400" />
              <span>Snapshot Frame</span>
            </button>

            <button
              onClick={() => {
                triggerHaptic('tap');
                setShowExportModal(true);
              }}
              disabled={isCapturingAll}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-indigo-500/50 bg-indigo-950/70 hover:bg-indigo-900/70 text-indigo-200 text-xs font-bold transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-indigo-950/40"
              title={`Export all ${totalFrames} frames as individual transparent PNG or WebP images + sprite strip in a ZIP archive`}
            >
              <FolderArchive className="w-3.5 h-3.5 text-indigo-300" />
              <span>Capture All Frames ({totalFrames})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                triggerHaptic('tap');
                onClose();
              }}
              className="px-3.5 py-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-medium transition cursor-pointer"
            >
              Close
            </button>

            {onSelectFrame && (
              <button
                onClick={handleApplyFrameToCrop}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition active:scale-95 cursor-pointer"
                title="Move crop boundary directly to this frame"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Jump Crop to Frame #{currentFrame + 1}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Export Format & Donut Progress Modal */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (!isCapturingAll) {
              triggerHaptic('tap');
              setShowExportModal(false);
            }
          }}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl p-5 text-slate-100 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400">
                  <FolderArchive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {isCapturingAll ? 'Exporting Frames ZIP' : 'Capture All Frames'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {totalFrames} frames • {frameWidth}×{frameHeight}px
                  </p>
                </div>
              </div>

              {!isCapturingAll && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap');
                    setShowExportModal(false);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Modal Body: Donut Progress Meter or Format Selection */}
            {isCapturingAll ? (
              /* Donut Progress Meter State */
              <div className="py-6 flex flex-col items-center justify-center">
                <div className="relative flex items-center justify-center">
                  <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
                    <defs>
                      <linearGradient id="donutProgressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="50%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#ec4899" />
                      </linearGradient>
                    </defs>
                    {/* Background Track */}
                    <circle
                      cx="50"
                      cy="50"
                      r={DONUT_RADIUS}
                      stroke="rgba(51, 65, 85, 0.4)"
                      strokeWidth="7"
                      fill="transparent"
                    />
                    {/* Dynamic Progress Ring */}
                    <circle
                      cx="50"
                      cy="50"
                      r={DONUT_RADIUS}
                      stroke="url(#donutProgressGrad)"
                      strokeWidth="7"
                      strokeDasharray={DONUT_CIRCUMFERENCE}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      fill="transparent"
                      className="transition-all duration-200 ease-out"
                    />
                  </svg>

                  {/* Centered Percentage & Format */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    {exportSuccess ? (
                      <CheckCircle2 className="w-10 h-10 text-emerald-400 animate-in zoom-in-75 duration-200" />
                    ) : (
                      <>
                        <span className="text-2xl font-black text-white tracking-tight">
                          {Math.round(exportPercent)}%
                        </span>
                        <span className="text-[10px] uppercase font-bold text-indigo-300 tracking-wider">
                          {exportFormat}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress Details */}
                <div className="mt-4 text-center px-2">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-200">
                    {!exportSuccess && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 shrink-0" />
                    )}
                    <span className="truncate max-w-[240px]">
                      {exportStageMessage || 'Packaging ZIP...'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {exportSuccess
                      ? 'ZIP archive downloaded successfully'
                      : `Building ZIP with ${totalFrames} frames + sprite strip`}
                  </p>
                </div>
              </div>
            ) : (
              /* Format Options State */
              <div className="pt-3">
                <p className="text-xs text-slate-300 mb-2.5 font-medium">
                  Choose frame image format:
                </p>

                <div className="space-y-2 mb-3">
                  {/* PNG Option (Default) */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap');
                      setExportFormat('png');
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 ${
                      exportFormat === 'png'
                        ? 'border-indigo-500 bg-indigo-950/40 ring-1 ring-indigo-500/50'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-800/40'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        exportFormat === 'png'
                          ? 'border-indigo-500 bg-indigo-500 text-white'
                          : 'border-slate-600'
                      }`}
                    >
                      {exportFormat === 'png' && (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">PNG Format</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          Default • Lossless
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        Lossless alpha transparency. Universal compatibility for game engines, Godot, Unity, and sprite sheets.
                      </p>
                    </div>
                  </button>

                  {/* WebP Option */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap');
                      setExportFormat('webp');
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 ${
                      exportFormat === 'webp'
                        ? 'border-purple-500 bg-purple-950/40 ring-1 ring-purple-500/50'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-800/40'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        exportFormat === 'webp'
                          ? 'border-purple-500 bg-purple-500 text-white'
                          : 'border-slate-600'
                      }`}
                    >
                      {exportFormat === 'webp' && (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">WebP Format</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Compact • Smaller ZIP
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        Modern web format with transparency. Dramatically reduces ZIP size by up to 60-80% with high visual fidelity.
                      </p>
                    </div>
                  </button>
                </div>

                {/* WebP Quality Preset selector */}
                {exportFormat === 'webp' && (
                  <div className="mb-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-300 font-medium">
                      WebP Quality: <strong className="text-white">{Math.round(webpQuality * 100)}%</strong>
                    </span>
                    <div className="flex items-center gap-1">
                      {[
                        { label: '85%', val: 0.85 },
                        { label: '95%', val: 0.95 },
                        { label: '100%', val: 1.0 },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            triggerHaptic('tap');
                            setWebpQuality(item.val);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                            webpQuality === item.val
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80 mb-4 text-[11px] text-slate-400">
                  <span className="text-slate-300 font-semibold">ZIP package contains:</span> all {totalFrames} individual {exportFormat.toUpperCase()} frames + 1 combined animation strip.
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap');
                      setShowExportModal(false);
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleStartExport}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 hover:from-indigo-600 hover:to-pink-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition active:scale-95 cursor-pointer"
                  >
                    <FolderArchive className="w-3.5 h-3.5" />
                    <span>Export {exportFormat.toUpperCase()} ZIP</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
