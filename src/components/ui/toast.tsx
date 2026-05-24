"use client";

/**
 * Toast notification system — pure-React (no new deps).
 *
 * Goals:
 *  - Variants: success / error / info / warning, mapped to design tokens.
 *  - Auto-dismiss after 5s (configurable). Errors persist by default (duration: Infinity).
 *  - Stacks vertically, max 5 visible (FIFO eviction).
 *  - Optional action button slot (e.g. "Undo").
 *  - Position: bottom-right on >= sm, bottom-center on mobile.
 *  - Esc dismisses focused toast.
 *  - Respects prefers-reduced-motion.
 *  - aria-live="polite" for non-error, aria-live="assertive" for error.
 *
 * Usage:
 *   <ToastProvider> wraps the tree (already mounted in src/app/layout.tsx).
 *   const { toast } = useToast();
 *   toast({ title: "Saved", variant: "success" });
 *   toast({ title: "Failed", description: "...", variant: "error",
 *           action: { label: "Retry", onClick: () => retry() } });
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";

export type ToastVariant = "success" | "error" | "info" | "warning";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  /** Required short headline. */
  title: string;
  /** Optional secondary line. */
  description?: string;
  /** Visual variant. Defaults to "info". */
  variant?: ToastVariant;
  /**
   * Auto-dismiss after N ms. Default: 5000 for non-error, `Infinity` for error.
   * Pass `Infinity` (or a non-finite number) to make the toast sticky.
   */
  duration?: number;
  /** Optional action button (e.g. "Undo"). */
  action?: ToastAction;
  /** Stable id — if omitted, one is generated. Re-toasting the same id is a no-op. */
  id?: string;
};

type ToastRecord = Required<Pick<ToastOptions, "title" | "variant">> &
  Omit<ToastOptions, "title" | "variant"> & {
    id: string;
    createdAt: number;
  };

type ToastContextValue = {
  toast: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 5;
const DEFAULT_DURATION_MS = 5_000;

let _idCounter = 0;
function genId() {
  _idCounter += 1;
  return `t_${Date.now().toString(36)}_${_idCounter}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = opts.id ?? genId();
      const variant = opts.variant ?? "info";
      const duration =
        typeof opts.duration === "number"
          ? opts.duration
          : variant === "error"
            ? Number.POSITIVE_INFINITY
            : DEFAULT_DURATION_MS;

      setToasts((prev) => {
        if (prev.some((t) => t.id === id)) return prev;
        const next: ToastRecord = {
          id,
          title: opts.title,
          description: opts.description,
          variant,
          duration,
          action: opts.action,
          createdAt: Date.now(),
        };
        // FIFO eviction so the newest toast is always visible.
        const merged = [...prev, next];
        if (merged.length > MAX_VISIBLE) {
          const removed = merged.shift();
          if (removed) {
            const t = timersRef.current.get(removed.id);
            if (t) {
              clearTimeout(t);
              timersRef.current.delete(removed.id);
            }
          }
        }
        return merged;
      });

      if (Number.isFinite(duration)) {
        const timer = setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [dismiss],
  );

  // Clear any stragglers on unmount (mostly for HMR).
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toast, dismiss }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Soft-fallback so a stray useToast() never crashes a tree that forgot the provider.
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[useToast] called outside <ToastProvider>; falling back to console.",
      );
    }
    return {
      toast: (opts) => {
        if (typeof window !== "undefined") {
          // eslint-disable-next-line no-console
          console.info("[toast:noop]", opts);
        }
        return opts.id ?? "noop";
      },
      dismiss: () => {},
    };
  }
  return ctx;
}

// ---------- presentation ----------

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}) {
  // Split errors (assertive) from the rest (polite) so screen readers route correctly.
  const errorToasts = toasts.filter((t) => t.variant === "error");
  const otherToasts = toasts.filter((t) => t.variant !== "error");

  return (
    <>
      <div
        aria-live="assertive"
        aria-relevant="additions"
        className={VIEWPORT_CLASSES}
      >
        {errorToasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </div>
      <div
        aria-live="polite"
        aria-relevant="additions"
        className={VIEWPORT_CLASSES}
      >
        {otherToasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </div>
    </>
  );
}

const VIEWPORT_CLASSES =
  // Positioning: bottom-center mobile, bottom-right >= sm.
  "fixed bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 " +
  "z-[120] flex flex-col gap-2 pointer-events-none " +
  "w-[min(92vw,22rem)]";

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success:
    "border-success/40 bg-success/10 text-text " +
    "[--toast-accent:var(--success)]",
  error:
    "border-danger/40 bg-danger/10 text-text " +
    "[--toast-accent:var(--danger)]",
  info:
    "border-info/40 bg-info/10 text-text " +
    "[--toast-accent:var(--info)]",
  warning:
    "border-warning/40 bg-warning/10 text-text " +
    "[--toast-accent:var(--warning)]",
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onDismiss(toast.id);
      }
    },
    [onDismiss, toast.id],
  );

  return (
    <div
      ref={ref}
      role={toast.variant === "error" ? "alert" : "status"}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn(
        // Layout & surface
        "pointer-events-auto relative overflow-hidden rounded-lg border shadow-lg",
        "bg-surface-raised backdrop-blur-sm",
        "px-4 py-3 pr-10",
        "flex items-start gap-3",
        // Accent stripe on the left edge.
        "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1",
        "before:bg-[var(--toast-accent)]",
        // Motion: slide-up + fade-in. Respects reduced-motion (no transform).
        "animate-[toast-in_220ms_ease-out_both]",
        "motion-reduce:animate-none",
        // Focus ring for keyboard users.
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        VARIANT_CLASSES[toast.variant],
      )}
      data-toast-variant={toast.variant}
    >
      <ToastIcon variant={toast.variant} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug text-text break-words">
          {toast.title}
        </p>
        {toast.description ? (
          <p className="text-xs leading-snug text-text-muted mt-0.5 break-words">
            {toast.description}
          </p>
        ) : null}
        {toast.action ? (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
            className={cn(
              "mt-2 inline-flex items-center text-xs font-semibold",
              "text-[var(--toast-accent)] hover:underline",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded",
            )}
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className={cn(
          "absolute right-2 top-2 rounded p-1 text-text-muted",
          "hover:text-text hover:bg-surface-muted",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        )}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 3l8 8M11 3l-8 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  const common =
    "shrink-0 mt-0.5 size-4 text-[var(--toast-accent)]" as const;
  switch (variant) {
    case "success":
      return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={common}>
          <path
            d="M4 10.5l3.5 3.5L16 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "error":
      return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={common}>
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
          <path
            d="M10 6v5M10 13.5v.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "warning":
      return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={common}>
          <path
            d="M10 3l8 14H2L10 3z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M10 9v3M10 14.5v.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "info":
    default:
      return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={common}>
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
          <path
            d="M10 9v5M10 6.5v.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
