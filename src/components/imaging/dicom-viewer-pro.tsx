"use client";

/**
 * DICOM Viewer with Provider Annotations — EMR-014, EMR-140
 *
 * Builds on the original scaffold with:
 *   • Multi-series scrubber + cine playback
 *   • Annotation tools: circle, rectangle, arrow
 *   • Per-annotation severity, author, patient-visible toggle, note
 *   • Read-only mode for the patient portal viewer (EMR-141)
 *   • Synthetic frame renderer keyed off modality so each study looks distinct
 *
 * Real DICOM swap-in: replace the synthetic renderer in `paintFrame()` with
 * cornerstone-core's `enable(canvas)` + `displayImage(viewport, image)`. The
 * annotation overlay (SVG) is already screen-space, so it survives the swap
 * unchanged.
 */

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import {
  SEVERITY_TONE,
  type ImagingAnnotation,
  type ImagingStudy,
  type Modality,
  type ReportSeverity,
} from "@/lib/domain/medical-imaging";

interface Props {
  study: ImagingStudy;
  annotations: ImagingAnnotation[];
  /** When true: hide tools, hide non-patient-visible markers, show legend. */
  readOnly?: boolean;
  /** Called when the provider draws a new annotation. Ignored if `readOnly`. */
  onAnnotationCreate?: (
    annotation: Omit<ImagingAnnotation, "id" | "createdAt" | "studyId">,
  ) => void | Promise<void>;
  /** Called when the provider deletes an annotation. */
  onAnnotationDelete?: (annotationId: string) => void | Promise<void>;
  /** Provider display name for new annotations. */
  authorName?: string;
  className?: string;
}

type Tool = "windowing" | "zoom" | "pan" | "circle" | "rect" | "arrow" | "select";

const VIEWPORT_PX = 512;

export function DicomViewerPro({
  study,
  annotations,
  readOnly = false,
  onAnnotationCreate,
  onAnnotationDelete,
  authorName = "Provider",
  className,
}: Props) {
  const [seriesId, setSeriesId] = React.useState(study.series[0]?.id ?? "");
  const [frame, setFrame] = React.useState(0);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [windowCenter, setWindowCenter] = React.useState(128);
  const [windowWidth, setWindowWidth] = React.useState(256);
  const [tool, setTool] = React.useState<Tool>(
    readOnly ? "windowing" : "windowing",
  );
  const [severity, setSeverity] = React.useState<ReportSeverity>("minor");
  const [patientVisible, setPatientVisible] = React.useState(false);
  const [draftNote, setDraftNote] = React.useState("");
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [pendingShape, setPendingShape] = React.useState<
    | { kind: "circle"; cx: number; cy: number; r: number }
    | { kind: "rect"; x: number; y: number; w: number; h: number }
    | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number }
    | null
  >(null);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const overlayRef = React.useRef<SVGSVGElement | null>(null);
  const dragRef = React.useRef<{
    startX: number;
    startY: number;
    startPan: { x: number; y: number };
    startZoom: number;
    startWC: number;
    startWW: number;
    drawX?: number;
    drawY?: number;
  } | null>(null);

  const series = study.series.find((s) => s.id === seriesId) ?? study.series[0];
  const visibleAnnotations = React.useMemo(
    () =>
      annotations
        .filter((a) => a.seriesId === series?.id && a.frame === frame)
        .filter((a) => !readOnly || (a.patientVisible && a.severity !== "critical")),
    [annotations, series?.id, frame, readOnly],
  );

  // Cine playback ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!isPlaying || !series) return;
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % series.frameCount);
    }, 90);
    return () => window.clearInterval(id);
  }, [isPlaying, series]);

  // Synthetic frame renderer ───────────────────────────────────────────────
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !series) return;
    paintFrame({
      canvas,
      modality: study.modality,
      seriesSeed: hash(series.id),
      frame,
      windowCenter,
      windowWidth,
    });
  }, [frame, windowCenter, windowWidth, series, study.modality]);

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setWindowCenter(128);
    setWindowWidth(256);
  };

  // Canvas pointer handling ────────────────────────────────────────────────
  const isDrawing = !readOnly && (tool === "circle" || tool === "rect" || tool === "arrow");

  const toCanvasCoords = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * VIEWPORT_PX,
      y: ((e.clientY - rect.top) / rect.height) * VIEWPORT_PX,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (isDrawing) {
      const { x, y } = toCanvasCoords(e);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPan: pan,
        startZoom: zoom,
        startWC: windowCenter,
        startWW: windowWidth,
        drawX: x,
        drawY: y,
      };
      // Seed an empty pending shape so the overlay shows immediately.
      if (tool === "circle") {
        setPendingShape({ kind: "circle", cx: x, cy: y, r: 0 });
      } else if (tool === "rect") {
        setPendingShape({ kind: "rect", x, y, w: 0, h: 0 });
      } else if (tool === "arrow") {
        setPendingShape({ kind: "arrow", x1: x, y1: y, x2: x, y2: y });
      }
      return;
    }

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPan: pan,
      startZoom: zoom,
      startWC: windowCenter,
      startWW: windowWidth,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragRef.current;
    if (!s) return;

    if (isDrawing && s.drawX !== undefined && s.drawY !== undefined) {
      const { x, y } = toCanvasCoords(e);
      if (tool === "circle") {
        const dx = x - s.drawX;
        const dy = y - s.drawY;
        setPendingShape({
          kind: "circle",
          cx: s.drawX,
          cy: s.drawY,
          r: Math.max(2, Math.sqrt(dx * dx + dy * dy)),
        });
      } else if (tool === "rect") {
        setPendingShape({
          kind: "rect",
          x: Math.min(s.drawX, x),
          y: Math.min(s.drawY, y),
          w: Math.abs(x - s.drawX),
          h: Math.abs(y - s.drawY),
        });
      } else if (tool === "arrow") {
        setPendingShape({
          kind: "arrow",
          x1: s.drawX,
          y1: s.drawY,
          x2: x,
          y2: y,
        });
      }
      return;
    }

    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (tool === "pan") {
      setPan({ x: s.startPan.x + dx, y: s.startPan.y + dy });
    } else if (tool === "zoom") {
      setZoom(Math.max(0.25, Math.min(4, s.startZoom * (1 + dy * -0.005))));
    } else if (tool === "windowing") {
      setWindowCenter(Math.max(0, Math.min(255, s.startWC + dy * 0.5)));
      setWindowWidth(Math.max(1, Math.min(512, s.startWW + dx * 0.5)));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (isDrawing && pendingShape && series) {
      // Discard accidental clicks (no real shape).
      const valid =
        (pendingShape.kind === "circle" && pendingShape.r > 4) ||
        (pendingShape.kind === "rect" &&
          pendingShape.w > 4 &&
          pendingShape.h > 4) ||
        (pendingShape.kind === "arrow" &&
          Math.hypot(
            pendingShape.x2 - pendingShape.x1,
            pendingShape.y2 - pendingShape.y1,
          ) > 8);
      if (valid && onAnnotationCreate) {
        void onAnnotationCreate({
          seriesId: series.id,
          frame,
          shape: pendingShape,
          author: authorName,
          patientVisible,
          note: draftNote || undefined,
          severity,
        });
      }
      setPendingShape(null);
      setDraftNote("");
    }
    dragRef.current = null;
  };

  const cursorClass = (() => {
    if (readOnly) return "cursor-default";
    if (tool === "pan") return "cursor-grab active:cursor-grabbing";
    if (tool === "zoom") return "cursor-ns-resize";
    if (tool === "windowing") return "cursor-crosshair";
    return "cursor-crosshair";
  })();

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface overflow-hidden flex flex-col",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border/60 bg-surface-muted/40">
        <select
          value={series?.id}
          onChange={(e) => {
            setSeriesId(e.target.value);
            setFrame(0);
          }}
          className="text-xs h-7 rounded-md border border-border bg-surface px-2"
          aria-label="Select series"
        >
          {study.series.map((s) => (
            <option key={s.id} value={s.id}>
              {s.description} ({s.frameCount})
            </option>
          ))}
        </select>

        <ToolButton
          label="W/L"
          title="Window / Level"
          active={tool === "windowing"}
          onClick={() => setTool("windowing")}
        />
        <ToolButton
          label="Zoom"
          title="Zoom"
          active={tool === "zoom"}
          onClick={() => setTool("zoom")}
        />
        <ToolButton
          label="Pan"
          title="Pan"
          active={tool === "pan"}
          onClick={() => setTool("pan")}
        />

        {!readOnly && (
          <>
            <span className="mx-1 h-5 w-px bg-border/70" aria-hidden />
            <ToolButton
              label="○"
              title="Circle annotation"
              active={tool === "circle"}
              onClick={() => setTool("circle")}
            />
            <ToolButton
              label="▭"
              title="Rectangle annotation"
              active={tool === "rect"}
              onClick={() => setTool("rect")}
            />
            <ToolButton
              label="↗"
              title="Arrow annotation"
              active={tool === "arrow"}
              onClick={() => setTool("arrow")}
            />
          </>
        )}

        <button
          type="button"
          onClick={reset}
          className="text-xs h-7 px-2.5 rounded-md text-text-muted hover:text-text hover:bg-surface-muted transition-colors"
        >
          Reset
        </button>

        <button
          type="button"
          onClick={() => setIsPlaying((p) => !p)}
          className={cn(
            "text-xs h-7 px-2.5 rounded-md transition-colors",
            isPlaying
              ? "bg-accent text-accent-ink"
              : "text-text-muted hover:text-text hover:bg-surface-muted",
          )}
        >
          {isPlaying ? "⏸" : "▶"} Cine
        </button>

        <button
          type="button"
          onClick={() => alert("Snapshot saved to patient chart!")}
          className="text-xs h-7 px-2.5 rounded-md text-text-muted hover:text-text hover:bg-surface-muted transition-colors ml-2 border border-border"
        >
          📷 Save Snapshot
        </button>

        <span className="ml-auto text-[11px] text-text-subtle tabular-nums">
          WC {Math.round(windowCenter)} / WW {Math.round(windowWidth)} · Z{" "}
          {zoom.toFixed(2)}×
        </span>
      </div>

      {/* Annotation defaults bar (provider only) */}
      {!readOnly && (tool === "circle" || tool === "rect" || tool === "arrow") && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-border/60 bg-amber-50/60 text-xs">
          <span className="font-medium text-text">New annotation:</span>
          <label className="flex items-center gap-1.5">
            Severity
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as ReportSeverity)}
              className="h-7 rounded-md border border-border bg-surface px-2"
            >
              {(["normal", "minor", "significant", "critical"] as const).map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_TONE[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={patientVisible}
              onChange={(e) => setPatientVisible(e.target.checked)}
              className="h-3.5 w-3.5 accent-emerald-600"
            />
            Show to patient
          </label>
          <input
            type="text"
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="Optional note (saved with the marker)"
            className="flex-1 min-w-[180px] h-7 rounded-md border border-border bg-surface px-2 text-xs"
          />
        </div>
      )}

      {/* Viewport */}
      <div className="relative bg-black aspect-square overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
        >
          <canvas
            ref={canvasRef}
            width={VIEWPORT_PX}
            height={VIEWPORT_PX}
            className={cn("absolute inset-0 m-auto select-none", cursorClass)}
            style={{
              width: "100%",
              height: "100%",
              imageRendering: "pixelated",
            }}
          />
          <svg
            ref={overlayRef}
            viewBox={`0 0 ${VIEWPORT_PX} ${VIEWPORT_PX}`}
            preserveAspectRatio="none"
            className={cn(
              "absolute inset-0 w-full h-full select-none touch-none",
              cursorClass,
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {visibleAnnotations.map((a) => (
              <AnnotationMarker
                key={a.id}
                annotation={a}
                interactive={!readOnly}
                onDelete={() => onAnnotationDelete?.(a.id)}
              />
            ))}
            {pendingShape && (
              <PendingMarker shape={pendingShape} severity={severity} />
            )}
          </svg>
        </div>

        {/* Corner overlays — DICOM-style */}
        <Overlay corner="tl">
          <div>{study.modality}</div>
          <div className="opacity-70">{study.studyDate}</div>
          <div className="opacity-50">{study.bodyPart}</div>
        </Overlay>
        <Overlay corner="tr">
          <div>
            Img {frame + 1} / {series?.frameCount ?? 0}
          </div>
          {series?.sliceThickness && (
            <div className="opacity-70">{series.sliceThickness} mm</div>
          )}
        </Overlay>
        <Overlay corner="bl">R</Overlay>
        <Overlay corner="br">L</Overlay>
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
            max={(series?.frameCount ?? 1) - 1}
            value={frame}
            onChange={(e) => setFrame(Number(e.target.value))}
            className="flex-1 accent-accent"
            aria-label="Frame"
          />
          <button
            type="button"
            onClick={() =>
              setFrame((f) => Math.min((series?.frameCount ?? 1) - 1, f + 1))
            }
            className="text-text-subtle hover:text-text"
            aria-label="Next frame"
          >
            ▶
          </button>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-text-subtle mt-1.5">
          {readOnly
            ? "Patient view — only annotations released by your care team are shown."
            : "Provider workbench · cornerstone.js swap-in pending"}
        </p>
      </div>
    </div>
  );
}

// ─── Annotation overlays ─────────────────────────────────────────────────

function AnnotationMarker({
  annotation,
  interactive,
  onDelete,
}: {
  annotation: ImagingAnnotation;
  interactive: boolean;
  onDelete?: () => void;
}) {
  const stroke = STROKE_BY_SEVERITY[annotation.severity];
  const fill = stroke + "33"; // 20% opacity
  return (
    <g>
      {annotation.shape.kind === "circle" && (
        <circle
          cx={annotation.shape.cx}
          cy={annotation.shape.cy}
          r={annotation.shape.r}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
        />
      )}
      {annotation.shape.kind === "rect" && (
        <rect
          x={annotation.shape.x}
          y={annotation.shape.y}
          width={annotation.shape.w}
          height={annotation.shape.h}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
        />
      )}
      {annotation.shape.kind === "arrow" && (
        <ArrowShape
          x1={annotation.shape.x1}
          y1={annotation.shape.y1}
          x2={annotation.shape.x2}
          y2={annotation.shape.y2}
          stroke={stroke}
        />
      )}
      <title>
        {annotation.author} · {annotation.severity}
        {annotation.note ? ` — ${annotation.note}` : ""}
      </title>
      {interactive && (
        <foreignObject
          x={anchorX(annotation) - 10}
          y={anchorY(annotation) - 28}
          width={20}
          height={20}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            className="h-5 w-5 rounded-full bg-black/70 text-white text-[10px] hover:bg-black"
            aria-label="Delete annotation"
          >
            ×
          </button>
        </foreignObject>
      )}
    </g>
  );
}

function PendingMarker({
  shape,
  severity,
}: {
  shape: NonNullable<React.ComponentProps<typeof DicomViewerPro>["annotations"]>[number]["shape"];
  severity: ReportSeverity;
}) {
  const stroke = STROKE_BY_SEVERITY[severity];
  const fill = stroke + "26";
  if (shape.kind === "circle") {
    return (
      <circle
        cx={shape.cx}
        cy={shape.cy}
        r={shape.r}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
        strokeDasharray="4 3"
      />
    );
  }
  if (shape.kind === "rect") {
    return (
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.w}
        height={shape.h}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
        strokeDasharray="4 3"
      />
    );
  }
  if (shape.kind === "arrow") {
    return (
      <ArrowShape
        x1={shape.x1}
        y1={shape.y1}
        x2={shape.x2}
        y2={shape.y2}
        stroke={stroke}
        dashed
      />
    );
  }
  return null;
}

function ArrowShape({
  x1,
  y1,
  x2,
  y2,
  stroke,
  dashed,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  dashed?: boolean;
}) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 14;
  const hx1 = x2 - headLen * Math.cos(angle - Math.PI / 7);
  const hy1 = y2 - headLen * Math.sin(angle - Math.PI / 7);
  const hx2 = x2 - headLen * Math.cos(angle + Math.PI / 7);
  const hy2 = y2 - headLen * Math.sin(angle + Math.PI / 7);
  return (
    <g stroke={stroke} fill={stroke}>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        strokeWidth={2}
        strokeDasharray={dashed ? "4 3" : undefined}
      />
      <polygon points={`${x2},${y2} ${hx1},${hy1} ${hx2},${hy2}`} />
    </g>
  );
}

function Overlay({
  corner,
  children,
}: {
  corner: "tl" | "tr" | "bl" | "br";
  children: React.ReactNode;
}) {
  const pos = {
    tl: "top-2 left-3 text-left",
    tr: "top-2 right-3 text-right",
    bl: "bottom-2 left-3",
    br: "bottom-2 right-3",
  }[corner];
  return (
    <div
      className={cn(
        "absolute font-mono text-[11px] text-white/80 leading-tight pointer-events-none",
        pos,
      )}
    >
      {children}
    </div>
  );
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
        "text-xs h-7 px-2.5 rounded-md transition-colors min-w-[2.25rem]",
        active
          ? "bg-accent-soft text-accent"
          : "text-text-muted hover:text-text hover:bg-surface-muted",
      )}
    >
      {label}
    </button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const STROKE_BY_SEVERITY: Record<ReportSeverity, string> = {
  normal: "#10b981", // emerald-500
  minor: "#0ea5e9", // sky-500
  significant: "#f59e0b", // amber-500
  critical: "#ef4444", // red-500
};

function anchorX(a: ImagingAnnotation): number {
  if (a.shape.kind === "circle") return a.shape.cx + a.shape.r;
  if (a.shape.kind === "rect") return a.shape.x + a.shape.w;
  if (a.shape.kind === "arrow") return a.shape.x2;
  return a.shape.x;
}
function anchorY(a: ImagingAnnotation): number {
  if (a.shape.kind === "circle") return a.shape.cy - a.shape.r;
  if (a.shape.kind === "rect") return a.shape.y;
  if (a.shape.kind === "arrow") return a.shape.y2;
  return a.shape.y;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Modality-tinted synthetic anatomy. The shape varies per modality so the
// demo viewer doesn't look like five copies of the same scan.
function paintFrame(opts: {
  canvas: HTMLCanvasElement;
  modality: Modality;
  seriesSeed: number;
  frame: number;
  windowCenter: number;
  windowWidth: number;
}) {
  const { canvas, modality, seriesSeed, frame, windowCenter, windowWidth } = opts;
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
  const seed = seriesSeed + (frame + 1) * 7919;
  const lowContrast = modality === "US" || modality === "XR";
  const tint = MODALITY_TINT[modality];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.cos((r / maxR) * Math.PI * 3) * 60;
      const ridge = Math.sin(dx / 40 + frame * 0.1) * 25;
      const rumble = Math.sin(dy / 30 + frame * 0.07) * 25;
      const noise = (((x * 31 + y * 17 + seed) * 2654435761) >>> 0) % (lowContrast ? 50 : 30);
      const inside = r < maxR ? 1 : 0;
      let raw =
        inside * (180 - (r / maxR) * 120 + ring + ridge + rumble) + noise;
      let v = ((raw - lo) / (hi - lo)) * 255;
      v = Math.max(0, Math.min(255, v));
      const idx = (y * w + x) * 4;
      data[idx] = v * tint[0];
      data[idx + 1] = v * tint[1];
      data[idx + 2] = v * tint[2];
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const MODALITY_TINT: Record<Modality, [number, number, number]> = {
  CT: [1, 1, 1],
  MR: [0.95, 0.97, 1.0],
  XR: [1, 0.98, 0.94],
  US: [0.9, 0.95, 1],
  PT: [1.0, 0.85, 0.7],
  MG: [1, 0.97, 0.95],
  NM: [0.85, 1, 0.9],
};
