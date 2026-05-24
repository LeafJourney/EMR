"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * Three-state theme toggle: Light · Dark · System.
 *
 * - Persists choice in localStorage("leafjourney-theme") as
 *   "light" | "dark" | "system".
 * - When "system", follows `prefers-color-scheme` and updates live
 *   if the OS preference changes.
 * - SSR-safe: renders a stable shell, hydrates real state on mount
 *   to avoid hydration mismatches.
 * - Works in lockstep with the inline bootstrap script in
 *   `src/app/layout.tsx` which prevents FOUC by applying the
 *   resolved theme to <html> before paint.
 */

type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "leafjourney-theme";

function getStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // localStorage unavailable — fall back to system
  }
  return "system";
}

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function applyMode(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const resolved =
    mode === "dark" || (mode === "system" && getSystemPrefersDark())
      ? "dark"
      : "light";
  if (resolved === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

type Variant = "segmented" | "icon";

export function ThemeToggle({
  className,
  variant = "segmented",
}: {
  className?: string;
  variant?: Variant;
}) {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = getStoredMode();
    setMode(initial);
    applyMode(initial);
    setMounted(true);
  }, []);

  // Live-react to OS scheme changes while in "system" mode.
  useEffect(() => {
    if (!mounted) return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const handler = () => {
      if (getStoredMode() === "system") applyMode("system");
    };
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [mounted]);

  const choose = useCallback((next: ThemeMode) => {
    setMode(next);
    applyMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // keep visual change even if storage fails
    }
  }, []);

  if (variant === "icon") {
    return (
      <IconCycleToggle
        mode={mode}
        mounted={mounted}
        onCycle={choose}
        className={className}
      />
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted p-1",
        className,
      )}
    >
      <SegmentButton
        label="Light"
        active={mounted && mode === "light"}
        onClick={() => choose("light")}
        icon={<SunIcon />}
      />
      <SegmentButton
        label="System"
        active={mounted && mode === "system"}
        onClick={() => choose("system")}
        icon={<SystemIcon />}
      />
      <SegmentButton
        label="Dark"
        active={mounted && mode === "dark"}
        onClick={() => choose("dark")}
        icon={<MoonIcon />}
      />
    </div>
  );
}

function SegmentButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Tooltip content={`${label} theme`}>
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          active
            ? "bg-surface text-text shadow-sm"
            : "text-text-subtle hover:text-text",
        )}
      >
        <span aria-hidden="true" className="inline-flex">
          {icon}
        </span>
        <span>{label}</span>
      </button>
    </Tooltip>
  );
}

/**
 * Compact icon variant — single button that cycles Light → System → Dark.
 * Useful in dense headers / nav rails where a segmented control won't fit.
 */
function IconCycleToggle({
  mode,
  mounted,
  onCycle,
  className,
}: {
  mode: ThemeMode;
  mounted: boolean;
  onCycle: (next: ThemeMode) => void;
  className?: string;
}) {
  const order: ThemeMode[] = ["light", "system", "dark"];
  const next = () => {
    const idx = order.indexOf(mode);
    const n = order[(idx + 1) % order.length];
    onCycle(n);
  };
  const label =
    mode === "light"
      ? "Light theme (click for system)"
      : mode === "dark"
        ? "Dark theme (click for light)"
        : "System theme (click for dark)";
  return (
    <Tooltip content={label}>
    <button
      type="button"
      onClick={next}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md",
        "text-text-muted transition-colors hover:bg-surface-muted hover:text-text",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        className,
      )}
    >
      {/* Render a single icon, but render nothing until mounted so SSR
          and first client render match (avoids hydration warnings). */}
      {mounted && mode === "light" && <SunIcon />}
      {mounted && mode === "dark" && <MoonIcon />}
      {mounted && mode === "system" && <SystemIcon />}
      {!mounted && <span className="block h-[14px] w-[14px]" aria-hidden="true" />}
    </button>
    </Tooltip>
  );
}

function SunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <line x1="8" y1="20" x2="16" y2="20" />
      <line x1="12" y1="16" x2="12" y2="20" />
    </svg>
  );
}
