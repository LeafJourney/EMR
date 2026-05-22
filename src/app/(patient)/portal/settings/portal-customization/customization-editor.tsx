"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  defaultLayout,
  hideWidget,
  normalizeLayout,
  PORTAL_STORAGE_KEY,
  PORTAL_WIDGETS,
  reorderWidget,
  resetLayout,
  showWidget,
  type PortalLayout,
  type PortalWidgetId,
} from "@/lib/portal/customization";

interface CustomizationEditorProps {
  patientId: string;
}

interface AccentOption {
  id: NonNullable<PortalLayout["accent"]>;
  label: string;
  swatch: string;
  description: string;
}

const ACCENT_OPTIONS: AccentOption[] = [
  {
    id: "default",
    label: "Verdant",
    swatch: "#3a8560",
    description: "Default herbal greens.",
  },
  {
    id: "indigo",
    label: "Indigo",
    swatch: "#4f5dc2",
    description: "Cool blues for night owls.",
  },
  {
    id: "rose",
    label: "Rose",
    swatch: "#c46b97",
    description: "Soft rose with a warm lift.",
  },
  {
    id: "amber",
    label: "Amber",
    swatch: "#d4a657",
    description: "Wheat-field warmth.",
  },
  {
    id: "teal",
    label: "Teal",
    swatch: "#2c8587",
    description: "Pacific Ocean cool.",
  },
];

function readLayout(patientId: string): PortalLayout {
  if (typeof window === "undefined") return defaultLayout();
  try {
    const raw = window.localStorage.getItem(PORTAL_STORAGE_KEY(patientId));
    if (!raw) return defaultLayout();
    return normalizeLayout(JSON.parse(raw));
  } catch {
    return defaultLayout();
  }
}

function writeLayout(patientId: string, layout: PortalLayout) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PORTAL_STORAGE_KEY(patientId),
      JSON.stringify(layout),
    );
  } catch {
    // ignore quota
  }
}

export function CustomizationEditor({ patientId }: CustomizationEditorProps) {
  const [layout, setLayout] = useState<PortalLayout>(() => defaultLayout());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const next = readLayout(patientId);
    setLayout(next);
    setLoaded(true);
  }, [patientId]);

  function commit(next: PortalLayout) {
    setLayout(next);
    writeLayout(patientId, next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("portal-layout-changed"));
    }
  }

  const hiddenDefs = useMemo(
    () =>
      layout.hidden
        .map((id) => PORTAL_WIDGETS.find((w) => w.id === id))
        .filter((w): w is (typeof PORTAL_WIDGETS)[number] => Boolean(w)),
    [layout.hidden],
  );

  if (!loaded) {
    return (
      <Card tone="raised">
        <CardContent className="py-10 text-center text-sm text-text-subtle">
          Loading your preferences…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Accent palette */}
      <Card tone="raised">
        <CardContent className="py-6">
          <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
            <h2 className="font-display text-lg text-text">Accent palette</h2>
            <p className="text-xs text-text-subtle">
              Applied across the portal on this device.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {ACCENT_OPTIONS.map((opt) => {
              const active = layout.accent === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    commit({
                      ...layout,
                      accent: opt.id,
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className={`text-left rounded-xl border p-3 transition-all ${
                    active
                      ? "border-accent bg-accent-soft/40 shadow-sm"
                      : "border-border bg-surface hover:border-border-strong"
                  }`}
                  aria-pressed={active}
                >
                  <span
                    className="block h-6 w-6 rounded-full mb-2"
                    style={{ backgroundColor: opt.swatch }}
                    aria-hidden="true"
                  />
                  <span className="block text-sm font-medium text-text">
                    {opt.label}
                  </span>
                  <span className="block text-[11px] text-text-subtle mt-0.5 leading-snug">
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Display & Accessibility */}
      <Card tone="raised">
        <CardContent className="py-6 space-y-6">
          <div>
            <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
              <h2 className="font-display text-lg text-text">Display & Accessibility</h2>
            </div>
            
            <div className="space-y-5">
              {/* Theme */}
              <div>
                <p className="text-sm font-medium text-text mb-2">Visual Theme</p>
                <div className="flex bg-surface-muted rounded-lg p-1 w-full max-w-sm">
                  {(["system", "light", "dark"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => commit({ ...layout, theme: t, updatedAt: new Date().toISOString() })}
                      className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        layout.theme === t ? "bg-surface shadow-sm text-text" : "text-text-muted hover:text-text"
                      }`}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Scale */}
              <div>
                <p className="text-sm font-medium text-text mb-2">Typography Scale</p>
                <div className="flex bg-surface-muted rounded-lg p-1 w-full max-w-sm">
                  {(["normal", "large"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => commit({ ...layout, textScale: s, updatedAt: new Date().toISOString() })}
                      className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        layout.textScale === s ? "bg-surface shadow-sm text-text" : "text-text-muted hover:text-text"
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
                {layout.textScale === "large" && (
                  <p className="text-xs text-text-subtle mt-2">
                    Large text may cause some dashboard widgets to scroll.
                  </p>
                )}
              </div>

              {/* Reduce Motion */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text">Reduce Motion</p>
                  <p className="text-xs text-text-subtle">
                    Disables most micro-animations and spatial transitions.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={layout.reduceMotion}
                  onClick={() =>
                    commit({
                      ...layout,
                      reduceMotion: !layout.reduceMotion,
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
                    layout.reduceMotion ? "bg-accent" : "bg-border-strong"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      layout.reduceMotion ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order */}
      <Card tone="raised">
        <CardContent className="py-6">
          <h2 className="font-display text-lg text-text mb-1">
            Portal home order
          </h2>
          <p className="text-xs text-text-subtle mb-4">
            Top of the list shows up first on your portal home. Required widgets
            cannot be hidden.
          </p>

          <ol className="divide-y divide-border/50">
            {layout.order.map((id, idx) => {
              const def = PORTAL_WIDGETS.find((w) => w.id === id);
              if (!def) return null;
              const canUp = idx > 0;
              const canDown = idx < layout.order.length - 1;
              return (
                <li
                  key={id}
                  className="py-3 flex items-center gap-3"
                >
                  <span className="text-xl shrink-0" aria-hidden="true">
                    {def.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text flex items-center gap-2">
                      {def.label}
                      {def.required && (
                        <Badge tone="neutral" className="text-[9px]">
                          required
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-text-subtle line-clamp-1">
                      {def.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => commit(reorderWidget(layout, id, "up"))}
                    disabled={!canUp}
                    className="h-8 w-8 rounded-md border border-border text-text-muted disabled:opacity-30 hover:bg-surface-muted"
                    aria-label={`Move ${def.label} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => commit(reorderWidget(layout, id, "down"))}
                    disabled={!canDown}
                    className="h-8 w-8 rounded-md border border-border text-text-muted disabled:opacity-30 hover:bg-surface-muted"
                    aria-label={`Move ${def.label} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => commit(hideWidget(layout, id as PortalWidgetId))}
                    disabled={def.required}
                    className="text-xs text-text-subtle hover:text-danger disabled:opacity-30 px-2"
                  >
                    Hide
                  </button>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {/* Hidden */}
      {hiddenDefs.length > 0 && (
        <Card tone="raised">
          <CardContent className="py-6">
            <h2 className="font-display text-lg text-text mb-1">Hidden</h2>
            <p className="text-xs text-text-subtle mb-4">
              Bring any of these back to your portal home.
            </p>
            <ul className="space-y-2">
              {hiddenDefs.map((def) => (
                <li
                  key={def.id}
                  className="flex items-center gap-3 py-2 px-3 rounded-md bg-surface-muted/40"
                >
                  <span className="text-xl" aria-hidden="true">
                    {def.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text">{def.label}</p>
                    <p className="text-xs text-text-subtle line-clamp-1">
                      {def.description}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => commit(showWidget(layout, def.id))}
                  >
                    Show
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => commit(resetLayout())}
        >
          Reset to default
        </Button>
      </div>
    </div>
  );
}
