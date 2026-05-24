"use client";

/**
 * FileUpload — multi-file drag-drop primitive with queue, progress, retry.
 *
 * Used across LeafJourney for chart attachments, lab uploads, COA docs,
 * fax attachments, vendor tax forms, feedback screenshots, and more. It is
 * deliberately backend-agnostic: callers supply an `onUpload(file)` that
 * returns the persisted `{ id, url }` and the primitive handles the
 * choreography — concurrency, retry, cancellation, validation, a11y.
 *
 * Why a single primitive?
 *   • Today there are 4+ bespoke dropzones, each with subtly different
 *     validation, error UX, and aesthetic. That fragmentation hurts both
 *     users and reviewers. One primitive, one mental model.
 *   • A surgical surface area (one prop bag, one render slot) makes
 *     adoption mechanical: replace the bespoke <input type=file> with
 *     <FileUpload onUpload={...}/> and ship.
 *
 * Apple-iOS aesthetic:
 *   • Hairline borders, generous whitespace, soft accent for drag-over.
 *   • Smooth (cubic-bezier) progress animation.
 *   • Reduced-motion friendly.
 *   • Min 44pt tap targets for retry / cancel / remove buttons.
 *
 * Accessibility:
 *   • Drop zone has `aria-label` + keyboard activation (Enter/Space).
 *   • File list is `role="list"` with `role="listitem"` children.
 *   • Per-row status announces via `aria-live="polite"` region.
 *   • Hidden <input> is keyboard-focusable through the visible button.
 *
 * No new dependencies. Pure React.
 */

import * as React from "react";
import { cn } from "@/lib/utils/cn";

// ───────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────

export type FileUploadStatus =
  | "queued"
  | "uploading"
  | "uploaded"
  | "failed"
  | "canceled";

export interface UploadedFile {
  /** Server-assigned id (storage key, db id, etc.) */
  id: string;
  /** A URL the client can use to preview / link. May be a signed URL. */
  url?: string;
  /** Optional server-supplied display name. Falls back to the local name. */
  name?: string;
}

export interface FileUploadHandlerArgs {
  /** Reports progress 0..100. Optional — handlers without progress data
   *  should call once with 100 on success. */
  onProgress?: (pct: number) => void;
  /** AbortSignal — handler should fetch with `{ signal }` to support
   *  cancel. */
  signal: AbortSignal;
}

export type FileUploadHandler = (
  file: File,
  args: FileUploadHandlerArgs,
) => Promise<UploadedFile>;

export interface FileUploadItem {
  /** Stable local key — also used as React key. */
  id: string;
  file: File;
  status: FileUploadStatus;
  progress: number;
  error?: string;
  result?: UploadedFile;
}

export interface FileUploadProps {
  /** Comma-separated `accept` value — e.g. ".pdf,image/*". Also enforced
   *  client-side via extension + MIME check. */
  accept?: string;
  /** Max simultaneous files in the queue. Excess files are rejected with
   *  an inline error and never enter the queue. */
  maxFiles?: number;
  /** Per-file size cap in megabytes. */
  maxSizeMB?: number;
  /** Concurrency cap for in-flight uploads. */
  concurrency?: number;
  /** Allow multi-select / multi-drop. Defaults to true. Set false to lock
   *  the picker to one file. */
  multiple?: boolean;
  /** Hide the drop zone label / icon (when host UI supplies its own). */
  bare?: boolean;
  /** Headline shown in the drop zone. */
  label?: string;
  /** Helper line under the headline. */
  hint?: string;
  /** Disable the entire control. */
  disabled?: boolean;
  /** className for the outer wrapper. */
  className?: string;
  /** Per-file uploader. Throw / reject to flip the row to `failed`. */
  onUpload: FileUploadHandler;
  /** Fired once after every batch settles (succeeds or fails). */
  onComplete?: (items: FileUploadItem[]) => void;
  /** Render a custom row in place of the default. */
  renderFile?: (item: FileUploadItem, controls: FileRowControls) => React.ReactNode;
}

export interface FileRowControls {
  retry: () => void;
  cancel: () => void;
  remove: () => void;
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx).toLowerCase();
}

/** Returns null when accepted, or a reason string when rejected. */
function validateAccept(file: File, accept: string | undefined): string | null {
  if (!accept) return null;
  const tokens = accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const ext = getExtension(file.name);
  const mime = (file.type || "").toLowerCase();
  for (const token of tokens) {
    if (token.startsWith(".")) {
      if (ext === token) return null;
      continue;
    }
    if (token.endsWith("/*")) {
      const prefix = token.slice(0, -1); // keep "image/"
      if (mime.startsWith(prefix)) return null;
      continue;
    }
    if (token === mime) return null;
  }
  return `Type not accepted (${mime || ext || "unknown"})`;
}

let __seq = 0;
function nextId(): string {
  __seq += 1;
  return `fu-${Date.now().toString(36)}-${__seq}`;
}

// ───────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────

export function FileUpload({
  accept,
  maxFiles = 10,
  maxSizeMB = 25,
  concurrency = 3,
  multiple = true,
  bare = false,
  label = "Drop files here or click to browse",
  hint,
  disabled = false,
  className,
  onUpload,
  onComplete,
  renderFile,
}: FileUploadProps) {
  const [items, setItems] = React.useState<FileUploadItem[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const [globalError, setGlobalError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const dropRef = React.useRef<HTMLDivElement | null>(null);

  // Abort controllers, keyed by item id, so cancel() can abort in-flight
  // fetches and retry() can spin up a fresh one.
  const controllers = React.useRef<Map<string, AbortController>>(new Map());

  // Single source of truth for the queue, mirrored for the worker loop so
  // it never reads stale React state.
  const itemsRef = React.useRef<FileUploadItem[]>([]);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Stable refs for callbacks so the worker loop doesn't restart when the
  // parent re-renders with new prop identities.
  const onUploadRef = React.useRef(onUpload);
  const onCompleteRef = React.useRef(onComplete);
  React.useEffect(() => {
    onUploadRef.current = onUpload;
  }, [onUpload]);
  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const maxBytes = maxSizeMB * 1024 * 1024;

  // ───── intake ─────
  const intake = React.useCallback(
    (incoming: FileList | File[]) => {
      if (disabled) return;
      const incomingArr = Array.from(incoming);
      const accepted: FileUploadItem[] = [];
      const rejectedReasons: string[] = [];
      const existing = itemsRef.current;
      let slots = Math.max(0, maxFiles - existing.length);

      for (const file of incomingArr) {
        if (slots <= 0) {
          rejectedReasons.push(`Skipped "${file.name}" — queue is full (${maxFiles} max)`);
          continue;
        }
        if (file.size === 0) {
          rejectedReasons.push(`"${file.name}" is empty`);
          continue;
        }
        if (file.size > maxBytes) {
          rejectedReasons.push(`"${file.name}" is ${formatBytes(file.size)} (max ${maxSizeMB} MB)`);
          continue;
        }
        const typeReason = validateAccept(file, accept);
        if (typeReason) {
          rejectedReasons.push(`"${file.name}": ${typeReason}`);
          continue;
        }
        accepted.push({
          id: nextId(),
          file,
          status: "queued",
          progress: 0,
        });
        slots -= 1;
      }

      if (accepted.length > 0) {
        setItems((prev) => [...prev, ...accepted]);
      }
      setGlobalError(rejectedReasons.length > 0 ? rejectedReasons.join(" · ") : null);
    },
    [accept, disabled, maxBytes, maxFiles, maxSizeMB],
  );

  // ───── worker loop ─────
  // Whenever the queue changes, top up the in-flight slots up to
  // `concurrency`. Each upload is launched as its own async task; the
  // loop is reentrant-safe because we mark "uploading" before awaiting.
  React.useEffect(() => {
    let canceled = false;
    const tick = () => {
      if (canceled) return;
      const snap = itemsRef.current;
      const inFlight = snap.filter((i) => i.status === "uploading").length;
      const free = Math.max(0, concurrency - inFlight);
      if (free <= 0) return;
      const nextBatch = snap.filter((i) => i.status === "queued").slice(0, free);
      if (nextBatch.length === 0) return;

      // Mark them as uploading before awaiting to claim the slot.
      setItems((prev) =>
        prev.map((i) =>
          nextBatch.find((n) => n.id === i.id) ? { ...i, status: "uploading", progress: 0 } : i,
        ),
      );

      for (const item of nextBatch) {
        const controller = new AbortController();
        controllers.current.set(item.id, controller);
        void (async () => {
          try {
            const result = await onUploadRef.current(item.file, {
              signal: controller.signal,
              onProgress: (pct) => {
                if (canceled) return;
                const clamped = Math.max(0, Math.min(100, Math.round(pct)));
                setItems((prev) =>
                  prev.map((i) =>
                    i.id === item.id && i.status === "uploading"
                      ? { ...i, progress: clamped }
                      : i,
                  ),
                );
              },
            });
            if (canceled) return;
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? { ...i, status: "uploaded", progress: 100, result, error: undefined }
                  : i,
              ),
            );
          } catch (err) {
            if (canceled) return;
            // Abort → "canceled", everything else → "failed".
            const aborted =
              (err instanceof DOMException && err.name === "AbortError") ||
              controller.signal.aborted;
            const message =
              err instanceof Error ? err.message : typeof err === "string" ? err : "Upload failed";
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status: aborted ? "canceled" : "failed",
                      error: aborted ? undefined : message,
                    }
                  : i,
              ),
            );
          } finally {
            controllers.current.delete(item.id);
          }
        })();
      }
    };
    tick();
    return () => {
      canceled = true;
    };
  }, [items, concurrency]);

  // Fire onComplete once nothing is queued or in-flight (and we have any
  // results to report).
  const completeReportedRef = React.useRef(0);
  React.useEffect(() => {
    if (items.length === 0) {
      completeReportedRef.current = 0;
      return;
    }
    const settled = items.every(
      (i) => i.status === "uploaded" || i.status === "failed" || i.status === "canceled",
    );
    if (settled && completeReportedRef.current !== items.length) {
      completeReportedRef.current = items.length;
      onCompleteRef.current?.(items);
    }
  }, [items]);

  // ───── per-row controls ─────
  const retry = React.useCallback((id: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id && (i.status === "failed" || i.status === "canceled")
          ? { ...i, status: "queued", progress: 0, error: undefined }
          : i,
      ),
    );
  }, []);

  const cancel = React.useCallback((id: string) => {
    const ctrl = controllers.current.get(id);
    if (ctrl) ctrl.abort();
    // Optimistically mark canceled — the catch arm above will confirm.
    setItems((prev) =>
      prev.map((i) =>
        i.id === id && (i.status === "uploading" || i.status === "queued")
          ? { ...i, status: "canceled" }
          : i,
      ),
    );
  }, []);

  const remove = React.useCallback((id: string) => {
    const ctrl = controllers.current.get(id);
    if (ctrl) ctrl.abort();
    controllers.current.delete(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // ───── DOM handlers ─────
  const onBrowse = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) intake(e.target.files);
    // Reset so picking the same file twice re-fires onChange.
    e.target.value = "";
  };

  const onDragEnter = (e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    setDragOver(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    // Only clear when leaving the dropzone itself, not its children.
    if (e.target === dropRef.current) setDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      intake(e.dataTransfer.files);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onBrowse();
    }
  };

  // ───── render ─────
  const hintCopy =
    hint ?? `${accept ? accept.replace(/\./g, "").toUpperCase() + " · " : ""}up to ${maxSizeMB} MB · ${maxFiles} files max`;

  return (
    <div className={cn("w-full space-y-3", className)}>
      <div
        ref={dropRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-disabled={disabled || undefined}
        onClick={onBrowse}
        onKeyDown={onKeyDown}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2",
          "rounded-2xl border-2 border-dashed",
          "px-6 py-8 text-center cursor-pointer select-none",
          "transition-colors duration-200 ease-out",
          dragOver
            ? "border-accent bg-accent-soft/40"
            : "border-border-strong bg-surface-muted/40 hover:bg-surface-muted/70",
          disabled && "cursor-not-allowed opacity-60",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2",
        )}
      >
        {!bare && (
          <>
            <UploadGlyph className={cn("h-7 w-7", dragOver ? "text-accent" : "text-text-subtle")} />
            <p className="text-sm font-medium text-text">{label}</p>
            <p className="text-[11px] text-text-subtle">{hintCopy}</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={onInputChange}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {globalError && (
        <p role="alert" className="text-xs text-danger">
          {globalError}
        </p>
      )}

      {items.length > 0 && (
        <ul
          role="list"
          aria-label="Upload queue"
          className="divide-y divide-border/60 rounded-xl border border-border bg-surface"
        >
          {items.map((item) =>
            renderFile ? (
              <li role="listitem" key={item.id}>
                {renderFile(item, {
                  retry: () => retry(item.id),
                  cancel: () => cancel(item.id),
                  remove: () => remove(item.id),
                })}
              </li>
            ) : (
              <FileRow
                key={item.id}
                item={item}
                onRetry={() => retry(item.id)}
                onCancel={() => cancel(item.id)}
                onRemove={() => remove(item.id)}
              />
            ),
          )}
        </ul>
      )}

      {/* Live region — announces status changes for screen readers. */}
      <div className="sr-only" aria-live="polite" role="status">
        {items
          .filter((i) => i.status === "uploaded" || i.status === "failed")
          .map((i) =>
            i.status === "uploaded"
              ? `${i.file.name} uploaded.`
              : `${i.file.name} failed: ${i.error ?? "unknown error"}.`,
          )
          .join(" ")}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Default row
// ───────────────────────────────────────────────────────────────────────

function FileRow({
  item,
  onRetry,
  onCancel,
  onRemove,
}: {
  item: FileUploadItem;
  onRetry: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const statusCopy: Record<FileUploadStatus, string> = {
    queued: "Queued",
    uploading: `Uploading… ${item.progress}%`,
    uploaded: "Uploaded",
    failed: item.error ? `Failed — ${item.error}` : "Failed",
    canceled: "Canceled",
  };

  const isDone = item.status === "uploaded";
  const isFail = item.status === "failed" || item.status === "canceled";
  const isBusy = item.status === "uploading" || item.status === "queued";

  return (
    <li role="listitem" className="flex items-center gap-3 px-3 py-2.5">
      <FileIcon mime={item.file.type} className="h-9 w-9 shrink-0 text-text-subtle" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-text">{item.file.name}</p>
          <span
            className={cn(
              "shrink-0 text-[10px] uppercase tracking-wider font-semibold",
              isDone && "text-accent",
              isFail && "text-danger",
              isBusy && "text-text-subtle",
            )}
          >
            {statusCopy[item.status]}
          </span>
        </div>
        <p className="text-[11px] text-text-subtle mt-0.5">
          {formatBytes(item.file.size)}
          {item.file.type ? ` · ${item.file.type}` : ""}
        </p>
        {/* Progress bar — animated while uploading, locked at 100% on
            success, hidden on terminal failure. */}
        {(isBusy || isDone) && (
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
            aria-hidden="true"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300 ease-out",
                isDone ? "bg-accent" : "bg-gradient-to-r from-accent to-accent-strong",
              )}
              style={{ width: `${isDone ? 100 : item.progress}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.status === "uploading" && (
          <RowButton onClick={onCancel} label={`Cancel ${item.file.name}`}>
            Cancel
          </RowButton>
        )}
        {isFail && (
          <RowButton onClick={onRetry} label={`Retry ${item.file.name}`} accent>
            Retry
          </RowButton>
        )}
        {!isBusy && (
          <RowButton onClick={onRemove} label={`Remove ${item.file.name}`} subtle>
            Remove
          </RowButton>
        )}
      </div>
    </li>
  );
}

function RowButton({
  children,
  onClick,
  label,
  accent,
  subtle,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  accent?: boolean;
  subtle?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex h-9 min-w-[44px] items-center justify-center rounded-md px-2 text-xs font-medium",
        "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        accent && "text-accent hover:bg-accent-soft/60",
        subtle && "text-text-subtle hover:text-text hover:bg-surface-muted",
        !accent && !subtle && "text-text hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Glyphs
// ───────────────────────────────────────────────────────────────────────

function UploadGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function FileIcon({ mime, className }: { mime: string; className?: string }) {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <rect
          x="3"
          y="4"
          width="18"
          height="16"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="9" cy="10" r="1.5" fill="currentColor" />
        <path
          d="M21 16l-5-5-8 8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Helpers consumers may want: a tiny FormData-fetch handler factory.
// ───────────────────────────────────────────────────────────────────────

export interface FetchUploadHandlerOptions {
  /** URL or endpoint to POST. */
  url: string;
  /** Field name for the file in the FormData. Defaults to "file". */
  fieldName?: string;
  /** Extra form fields appended on every request. */
  extra?: Record<string, string>;
  /** Map the JSON response shape to `UploadedFile`. */
  pickResult?: (json: unknown) => UploadedFile;
}

/**
 * Build a FileUpload handler that POSTs a multipart/form-data body via
 * XMLHttpRequest (the only browser API that exposes real upload progress).
 * Aborts when the FileUpload signals cancel.
 */
export function createFetchUploadHandler(
  opts: FetchUploadHandlerOptions,
): FileUploadHandler {
  return function fetchUpload(file, { signal, onProgress }) {
    return new Promise<UploadedFile>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", opts.url, true);
      xhr.responseType = "json";

      const fd = new FormData();
      fd.append(opts.fieldName ?? "file", file, file.name);
      if (opts.extra) {
        for (const [k, v] of Object.entries(opts.extra)) fd.append(k, v);
      }

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress((e.loaded / e.total) * 100);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const json = xhr.response as unknown;
            const picked = opts.pickResult
              ? opts.pickResult(json)
              : (json as UploadedFile);
            resolve(picked);
          } catch (err) {
            reject(err instanceof Error ? err : new Error("Bad response"));
          }
        } else {
          const msg =
            (xhr.response && (xhr.response as { error?: string }).error) ||
            `HTTP ${xhr.status}`;
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

      signal.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.send(fd);
    });
  };
}
