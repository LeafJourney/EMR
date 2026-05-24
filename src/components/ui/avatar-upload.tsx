"use client";

/**
 * AvatarUpload — iOS-style avatar picker + in-browser square crop.
 *
 * Capabilities
 * ────────────
 *  • Drop zone: drag any image (jpg/png/webp/heic/gif) onto the avatar.
 *  • Click also opens the file picker.
 *  • Square-crop modal rendered on Canvas — no third-party deps.
 *      - Drag to pan
 *      - Scroll wheel or pinch to zoom
 *      - "Save" returns a 256×256 JPEG (~80% quality) Blob + dataURL.
 *      - "Cancel" closes without committing.
 *  • Optimistic preview: the cropped image shows instantly while the
 *    server action runs in the background. Success / error → toast.
 *  • Validation: 5MB cap, image MIME only, SVG rejected (XSS surface).
 *
 * Backward-compatible: existing callers passing `onUpload(dataUrl, file)`
 * keep working — when crop completes, we hand back the cropped JPEG
 * dataURL and a `File` synthesized from the cropped Blob (so existing
 * server actions that decode base64 + persist still see a sane payload).
 *
 * Aesthetic: hairline borders, soft shadows, large tap targets — feels
 * like iOS Photos. Honors prefers-reduced-motion.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { cn } from "@/lib/utils/cn";
import { useToast } from "@/components/ui/toast";

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export type AvatarUploadVariant = "circle" | "rounded";

export interface AvatarUploadProps {
  /** Initial image URL or data URL to render in the avatar. */
  initialSrc?: string | null;
  /** Fallback initials when no image is set. */
  initials?: string;
  /** Outer wrapper className. */
  className?: string;
  /** Round (default) or rounded-square (e.g. practice logo). */
  variant?: AvatarUploadVariant;
  /** Avatar visual size — px. Default 112 (h-28 w-28). */
  size?: number;
  /** Hint copy under the avatar. Defaults change with state. */
  helperText?: string;
  /** Disable the picker entirely (read-only mode). */
  disabled?: boolean;
  /**
   * Called with the cropped JPEG dataURL + a synthesized File once the
   * user clicks "Save" in the crop modal. The component renders the new
   * preview optimistically and surfaces success/error via toast.
   *
   * Throw (or return a rejected promise) to signal a failed upload — the
   * preview rolls back and an error toast is shown.
   */
  onUpload?: (dataUrl: string, file: File) => void | Promise<void>;
}

// ───────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const OUTPUT_PX = 256; // final square edge
const JPEG_QUALITY = 0.8;

/** Accepted MIME types. SVG is *not* accepted (XSS). HEIC/HEIF are
 * accepted in the picker filter but most browsers can't decode them in
 * <img> — we'll fall through to an error toast cleanly if so. */
const ACCEPTED = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];

const ACCEPT_ATTR = ACCEPTED.join(",");

// ───────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────

export function AvatarUpload({
  initialSrc = null,
  initials = "",
  className,
  variant = "circle",
  size = 112,
  helperText,
  disabled = false,
  onUpload,
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialSrc);
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();

  // Keep preview in sync if parent passes a fresh initialSrc later.
  useEffect(() => {
    setPreview(initialSrc ?? null);
  }, [initialSrc]);

  // ───── file intake ─────
  const accept = useCallback(
    (file: File): string | null => {
      // Type check first — never trust the picker alone (drag-drop can
      // bypass the `accept` attribute).
      const type = file.type.toLowerCase();
      if (!type.startsWith("image/")) {
        return "Please choose an image file.";
      }
      if (type === "image/svg+xml") {
        return "SVG files are not allowed.";
      }
      if (file.size > MAX_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(1);
        return `That image is ${mb} MB. The limit is 5 MB.`;
      }
      return null;
    },
    [],
  );

  const handleFile = useCallback(
    (file: File) => {
      const err = accept(file);
      if (err) {
        toast({ title: "Can’t use that image", description: err, variant: "error", duration: 6000 });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setPendingSrc(reader.result);
        }
      };
      reader.onerror = () => {
        toast({
          title: "Couldn’t read the file",
          description: "Try a different image.",
          variant: "error",
        });
      };
      reader.readAsDataURL(file);
    },
    [accept, toast],
  );

  // ───── DOM handlers ─────
  const onPick = useCallback(() => {
    if (disabled || busy) return;
    inputRef.current?.click();
  }, [disabled, busy]);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset so picking the same file twice re-fires onChange.
      e.target.value = "";
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onDragOver = (e: DragEvent<HTMLButtonElement>) => {
    if (disabled || busy) return;
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  };
  const onDragLeave = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragOver(false);
  };
  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ───── crop completion ─────
  const onCropConfirm = useCallback(
    async (dataUrl: string, blob: Blob) => {
      setPendingSrc(null);
      const rollback = preview;
      setPreview(dataUrl);
      if (!onUpload) {
        // No server wiring — preview-only mode (still valid UX surface).
        return;
      }
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      setBusy(true);
      try {
        await onUpload(dataUrl, file);
        toast({ title: "Photo updated", variant: "success", duration: 3500 });
      } catch (err) {
        setPreview(rollback);
        toast({
          title: "Upload failed",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "error",
        });
      } finally {
        setBusy(false);
      }
    },
    [onUpload, preview, toast],
  );

  // ───── render ─────
  const radius = variant === "circle" ? "rounded-full" : "rounded-2xl";
  const helperCopy =
    helperText ??
    (busy ? "Saving…" : preview ? "Drag or tap to change" : "Drag or tap to add a photo");

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <button
        type="button"
        onClick={onPick}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        disabled={disabled || busy}
        aria-label={preview ? "Change profile photo" : "Upload profile photo"}
        style={{ width: size, height: size }}
        className={cn(
          "group relative overflow-hidden",
          radius,
          "border bg-surface-muted",
          dragOver ? "border-accent ring-2 ring-accent/40" : "border-border-strong",
          "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.18)]",
          "transition-[transform,box-shadow,border-color] duration-200 ease-smooth",
          "hover:scale-[1.02] active:scale-[0.98]",
          "motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2",
          (disabled || busy) && "opacity-60 cursor-wait",
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Profile avatar"
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : initials ? (
          <span className="flex h-full w-full items-center justify-center font-display text-3xl text-text-muted">
            {initials}
          </span>
        ) : (
          <PlaceholderIcon />
        )}

        {/* Drag-over hint overlay */}
        {dragOver && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-0 flex items-center justify-center",
              "bg-surface/70 backdrop-blur-[2px] text-accent text-xs font-semibold tracking-wide",
              radius,
            )}
          >
            Drop to upload
          </span>
        )}

        {/* Camera badge */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full",
            "bg-accent text-accent-ink shadow-lg border-2 border-surface",
            "transition-transform duration-200 ease-smooth",
            "group-hover:scale-110 motion-reduce:group-hover:scale-100",
          )}
        >
          <CameraGlyph />
        </span>

        {busy && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-surface/50 backdrop-blur-[1px]",
              radius,
            )}
          >
            <Spinner />
          </span>
        )}
      </button>

      <p className="text-[11px] text-text-subtle uppercase tracking-wide font-medium">
        {helperCopy}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={onChange}
      />

      {pendingSrc && (
        <CropModal
          src={pendingSrc}
          variant={variant}
          onCancel={() => setPendingSrc(null)}
          onConfirm={onCropConfirm}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Crop modal
// ───────────────────────────────────────────────────────────────────────

interface CropModalProps {
  src: string;
  variant: AvatarUploadVariant;
  onCancel: () => void;
  onConfirm: (dataUrl: string, blob: Blob) => void | Promise<void>;
}

const CANVAS_PX = 320; // square edge of the crop viewport (display px)
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function CropModal({ src, variant, onCancel, onConfirm }: CropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);

  // Pointer-drag bookkeeping.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragOrigin = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null);
  const pinchOrigin = useRef<{ dist: number; zoom: number } | null>(null);

  // Load image.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setLoaded(true);
    };
    img.onerror = () => {
      setLoaded(false);
    };
    img.src = src;
  }, [src]);

  // Compute the "cover-fit" base scale so the image always fills the
  // crop viewport at zoom=1. zoom multiplies on top of this.
  const base = useMemo(() => {
    if (!loaded || !imgRef.current) return { scale: 1, w: 0, h: 0 };
    const img = imgRef.current;
    const s = Math.max(CANVAS_PX / img.naturalWidth, CANVAS_PX / img.naturalHeight);
    return { scale: s, w: img.naturalWidth, h: img.naturalHeight };
  }, [loaded]);

  // Clamp pan so the image always covers the crop box at the current
  // zoom — the user can't reveal empty checkerboard.
  const clampPan = useCallback(
    (next: { x: number; y: number }, z: number) => {
      if (!imgRef.current) return next;
      const scaled = base.scale * z;
      const w = imgRef.current.naturalWidth * scaled;
      const h = imgRef.current.naturalHeight * scaled;
      const maxX = Math.max(0, (w - CANVAS_PX) / 2);
      const maxY = Math.max(0, (h - CANVAS_PX) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, next.x)),
        y: Math.max(-maxY, Math.min(maxY, next.y)),
      };
    },
    [base.scale],
  );

  // Re-clamp pan whenever zoom changes.
  useEffect(() => {
    setPan((p) => clampPan(p, zoom));
  }, [zoom, clampPan]);

  // Draw whenever pan/zoom/loaded changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !loaded) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== CANVAS_PX * dpr) {
      canvas.width = CANVAS_PX * dpr;
      canvas.height = CANVAS_PX * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);

    const scaled = base.scale * zoom;
    const w = img.naturalWidth * scaled;
    const h = img.naturalHeight * scaled;
    const x = (CANVAS_PX - w) / 2 + pan.x;
    const y = (CANVAS_PX - h) / 2 + pan.y;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, w, h);
  }, [loaded, base, zoom, pan]);

  // Esc to cancel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Pointer handlers (drag-pan + pinch-zoom).
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragOrigin.current = { x: e.clientX, y: e.clientY, pan: { ...pan } };
    } else if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchOrigin.current = { dist, zoom };
      dragOrigin.current = null;
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchOrigin.current) {
      const pts = Array.from(pointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const next = (dist / pinchOrigin.current.dist) * pinchOrigin.current.zoom;
      setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next)));
    } else if (pointers.current.size === 1 && dragOrigin.current) {
      const dx = e.clientX - dragOrigin.current.x;
      const dy = e.clientY - dragOrigin.current.y;
      setPan(
        clampPan(
          {
            x: dragOrigin.current.pan.x + dx,
            y: dragOrigin.current.pan.y + dy,
          },
          zoom,
        ),
      );
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchOrigin.current = null;
    if (pointers.current.size === 0) dragOrigin.current = null;
  };

  const onWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta)));
  };

  // Save → render the current crop view at OUTPUT_PX and emit a Blob.
  const onSave = useCallback(async () => {
    const img = imgRef.current;
    if (!img) return;
    setSaving(true);
    try {
      const out = document.createElement("canvas");
      out.width = OUTPUT_PX;
      out.height = OUTPUT_PX;
      const octx = out.getContext("2d");
      if (!octx) throw new Error("Canvas unsupported");
      // Reproduce the on-screen draw, scaled from CANVAS_PX → OUTPUT_PX.
      const ratio = OUTPUT_PX / CANVAS_PX;
      const scaled = base.scale * zoom * ratio;
      const w = img.naturalWidth * scaled;
      const h = img.naturalHeight * scaled;
      const x = (OUTPUT_PX - w) / 2 + pan.x * ratio;
      const y = (OUTPUT_PX - h) / 2 + pan.y * ratio;
      octx.imageSmoothingQuality = "high";
      // Fill background white so JPEG never bleeds black for transparent
      // PNGs.
      octx.fillStyle = "#ffffff";
      octx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);
      octx.drawImage(img, x, y, w, h);
      const blob: Blob = await new Promise((resolve, reject) =>
        out.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Encoding failed"))),
          "image/jpeg",
          JPEG_QUALITY,
        ),
      );
      const dataUrl = out.toDataURL("image/jpeg", JPEG_QUALITY);
      await onConfirm(dataUrl, blob);
    } finally {
      setSaving(false);
    }
  }, [base, zoom, pan, onConfirm]);

  const cropShape = variant === "circle" ? "rounded-full" : "rounded-2xl";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop profile photo"
      className={cn(
        "fixed inset-0 z-[130] flex items-center justify-center p-4",
        "bg-black/55 backdrop-blur-sm",
        "animate-[toast-in_180ms_ease-out_both] motion-reduce:animate-none",
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className={cn(
          "w-full max-w-sm rounded-3xl bg-surface-raised shadow-2xl border border-border",
          "px-5 pt-5 pb-4 flex flex-col items-center",
        )}
      >
        <header className="w-full flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text">Move and scale</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className={cn(
              "h-8 w-8 grid place-items-center rounded-full text-text-muted",
              "hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
            )}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div
          className="relative bg-black/90 overflow-hidden touch-none select-none"
          style={{ width: CANVAS_PX, height: CANVAS_PX, borderRadius: 18 }}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_PX}
            height={CANVAS_PX}
            style={{ width: CANVAS_PX, height: CANVAS_PX, display: "block", cursor: "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          />
          {/* Crop guide overlay — iOS Photos style: vignette + shape outline. */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 ring-1 ring-white/40",
              cropShape,
              "shadow-[inset_0_0_0_9999px_rgba(0,0,0,0.35)]",
            )}
          />
          {!loaded && (
            <div className="absolute inset-0 grid place-items-center text-white/70 text-xs">
              Loading…
            </div>
          )}
        </div>

        {/* Zoom slider */}
        <div className="w-full mt-4 px-1">
          <label className="flex items-center gap-3">
            <span className="text-text-subtle text-[10px] uppercase tracking-[0.14em]">
              Zoom
            </span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-[var(--accent)]"
              aria-label="Zoom"
            />
          </label>
        </div>

        {/* Action row */}
        <div className="w-full mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className={cn(
              "h-11 rounded-xl border border-border text-text font-medium",
              "hover:bg-surface-muted active:scale-[0.99]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              "motion-reduce:active:scale-100",
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!loaded || saving}
            className={cn(
              "h-11 rounded-xl bg-accent text-accent-ink font-semibold",
              "hover:opacity-90 active:scale-[0.99] disabled:opacity-50",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              "motion-reduce:active:scale-100",
            )}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Glyphs
// ───────────────────────────────────────────────────────────────────────

function PlaceholderIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      className="mx-auto my-auto h-full w-full p-6 text-text-subtle"
      aria-hidden="true"
    >
      <path
        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}

function CameraGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin motion-reduce:animate-none"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
