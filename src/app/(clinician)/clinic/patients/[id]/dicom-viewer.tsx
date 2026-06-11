"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * DICOM Viewer Scaffold (EMR-014)
 *
 * Placeholder DICOM image viewer for the patient chart Images tab.
 *
 * This is a mock equivalent of cornerstone.js — it renders a synthetic
 * grayscale "scan" frame on a canvas and exposes the standard tools a
 * radiologist expects (zoom, pan, window/level, frame scrubber). The
 * full library swap-in happens later: cornerstone-core + cornerstone-wado-image-loader
 * binds to the same `<canvas>` ref via `cornerstone.enable(canvas)`,
 * and the toolbar callbacks become viewport setters
 * (cornerstone.setViewport).
 */

interface DicomStudy {
  id: string;
  modality: "CT" | "MR" | "XR" | "US" | "PT";
  description: string;
  studyDate: string;
  frameCount: number;
}

interface DicomViewerProps {
  /** Optional study to load. When absent, renders a demo synthetic frame. */
  study?: DicomStudy;
  className?: string;
}

const DEMO_STUDIES: DicomStudy[] = [
  {
    id: "demo-ct-1",
    modality: "CT",
    description: "CT Chest w/o Contrast",
    studyDate: "2026-04-12",
    frameCount: 64,
  },
  {
    id: "demo-mr-1",
    modality: "MR",
    description: "MRI Brain w/ Contrast",
    studyDate: "2026-03-28",
    frameCount: 32,
  },
];

export function DicomViewer({ study, className }: DicomViewerProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [activeStudy, setActiveStudy] = React.useState<DicomStudy>(
    study ?? DEMO_STUDIES[0]
  );
  const [frame, setFrame] = React.useState(0);
  const [zoom, setZoom] = React.useState(1);
  const [windowCenter, setWindowCenter] = React.useState(128);
  const [windowWidth, setWindowWidth] = React.useState(256);
  const [tool, setTool] = React.useState<"pan" | "zoom" | "windowing">(
    "windowing"
  );
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const dragStateRef = React.useRef<{
    startX: number;
    startY: number;
    startPan: { x: number; y: number };
    startZoom: number;
    startWC: number;
    startWW: number;
  } | null>(null);

  // Render a synthetic scan frame. Mimics what cornerstone.js produces
  // by drawing a circular gradient + radial noise modulated by the
  // window center / window width, so the brightness sliders feel real
  // even before a real DICOM payload is wired in.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) * 0.45;

    const lo = windowCenter - windowWidth / 2;
    const hi = windowCenter + windowWidth / 2;

    const img = ctx.createImageData(w, h);
    const data = img.data;
    const seed = (frame + 1) * 7919;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        // Synthetic anatomy: radial falloff + a few "structures"
        const ring = Math.cos((r / maxR) * Math.PI * 3) * 60;
        const ridge = Math.sin((dx / 40 + frame * 0.1)) * 25;
        const rumble = Math.sin((dy / 30 + frame * 0.07)) * 25;
        const noise = (((x * 31 + y * 17 + seed) * 2654435761) >>> 0) % 30;
        const inside = r < maxR ? 1 : 0;
        let raw = inside * (180 - (r / maxR) * 120 + ring + ridge + rumble) + noise;
        // Apply window/level (DICOM-style intensity remapping)
        let v = ((raw - lo) / (hi - lo)) * 255;
        v = Math.max(0, Math.min(255, v));
        const idx = (y * w + x) * 4;
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [frame, windowCenter, windowWidth, activeStudy.id]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPan: pan,
      startZoom: zoom,
      startWC: windowCenter,
      startWW: windowWidth,
    };
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = dragStateRef.current;
    if (!s) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (tool === "pan") {
      setPan({ x: s.startPan.x + dx, y: s.startPan.y + dy });
    } else if (tool === "zoom") {
      setZoom(Math.max(0.25, Math.min(4, s.startZoom * (1 + dy * -0.005))));
    } else {
      setWindowCenter(Math.max(0, Math.min(255, s.startWC + dy * 0.5)));
      setWindowWidth(Math.max(1, Math.min(512, s.startWW + dx * 0.5)));
    }
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    dragStateRef.current = null;
  };

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setWindowCenter(128);
    setWindowWidth(256);
    setFrame(0);
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface overflow-hidden",
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border/60 bg-surface-muted/40">
        <select
          value={activeStudy.id}
          onChange={(e) => {
            const next =
              DEMO_STUDIES.find((s) => s.id === e.target.value) ?? activeStudy;
            setActiveStudy(next);
            setFrame(0);
          }}
          className="text-xs h-7 rounded-md border border-border bg-surface px-2"
          aria-label="Select study"
        >
          {DEMO_STUDIES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.modality} · {s.description}
            </option>
          ))}
        </select>
        <ToolButton
          active={tool === "windowing"}
          onClick={() => setTool("windowing")}
          label="W/L"
          title="Window / Level — drag on image"
        />
        <ToolButton
          active={tool === "zoom"}
          onClick={() => setTool("zoom")}
          label="Zoom"
          title="Zoom — drag on image"
        />
        <ToolButton
          active={tool === "pan"}
          onClick={() => setTool("pan")}
          label="Pan"
          title="Pan — drag on image"
        />
        <button
          type="button"
          onClick={reset}
          className="text-xs h-7 px-2.5 rounded-md text-text-muted hover:text-text hover:bg-surface-muted transition-colors"
        >
          Reset
        </button>
        <span className="ml-auto text-[11px] text-text-subtle tabular-nums">
          WC {Math.round(windowCenter)} / WW {Math.round(windowWidth)} · Z{" "}
          {zoom.toFixed(2)}×
        </span>
      </div>

      {/* Viewport */}
      <div className="relative bg-black aspect-square sm:aspect-[4/3] overflow-hidden">
        <canvas
          ref={canvasRef}
          width={512}
          height={512}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={cn(
            "absolute inset-0 m-auto select-none touch-none",
            tool === "pan" && "cursor-grab active:cursor-grabbing",
            tool === "zoom" && "cursor-ns-resize",
            tool === "windowing" && "cursor-crosshair"
          )}
          style={{
            width: "100%",
            height: "100%",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            imageRendering: "pixelated",
          }}
        />
        {/* DICOM overlay (modality, frame, patient orientation) */}
        <div className="absolute top-2 left-3 text-[11px] font-mono text-white/80 leading-tight pointer-events-none">
          <div>{activeStudy.modality}</div>
          <div className="opacity-70">{mmddyyyy(activeStudy.studyDate)}</div>
        </div>
        <div className="absolute top-2 right-3 text-[11px] font-mono text-white/80 leading-tight pointer-events-none text-right">
          <div>
            Img {frame + 1} / {activeStudy.frameCount}
          </div>
        </div>
        <div className="absolute bottom-2 left-3 text-[11px] font-mono text-white/60 pointer-events-none">
          R
        </div>
        <div className="absolute bottom-2 right-3 text-[11px] font-mono text-white/60 pointer-events-none">
          L
        </div>
        <div className="absolute top-1/2 left-2 text-[11px] font-mono text-white/60 pointer-events-none -translate-y-1/2">
          A
        </div>
        <div className="absolute top-1/2 right-2 text-[11px] font-mono text-white/60 pointer-events-none -translate-y-1/2">
          P
        </div>
      </div>

      {/* Frame scrubber */}
      <div className="px-4 py-2 border-t border-border/60 bg-surface-muted/40">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setFrame((f) => Math.max(0, f - 1))}
            className="text-text-subtle hover:text-text"
            aria-label="Previous frame"
          >
            ◀
          </button>
          <input
            type="range"
            min={0}
            max={activeStudy.frameCount - 1}
            value={frame}
            onChange={(e) => setFrame(Number(e.target.value))}
            className="flex-1 accent-accent"
            aria-label="Frame"
          />
          <button
            type="button"
            onClick={() =>
              setFrame((f) => Math.min(activeStudy.frameCount - 1, f + 1))
            }
            className="text-text-subtle hover:text-text"
            aria-label="Next frame"
          >
            ▶
          </button>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-text-subtle mt-1.5">
          Scaffold viewer · cornerstone.js swap-in pending
        </p>
      </div>
    </div>
  );
}

/** Render an ISO date (YYYY-MM-DD) as MM-DD-YYYY for the study-date overlay. */
function mmddyyyy(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getUTCFullYear()}`;
}

function ToolButton({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "text-xs h-7 px-2.5 rounded-md transition-colors",
        active
          ? "bg-accent-soft text-accent"
          : "text-text-muted hover:text-text hover:bg-surface-muted"
      )}
    >
      {label}
    </button>
  );
}
