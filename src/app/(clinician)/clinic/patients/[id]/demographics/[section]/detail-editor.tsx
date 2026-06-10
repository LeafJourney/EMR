"use client";

/**
 * Editable demographics detail page (EMR-848 / EMR-850).
 *
 * Each demographics subsection opens here as its own page where staff can
 * type, add, edit and erase information. Known fields per section are seeded
 * from the chart; an "additional fields" list lets staff add arbitrary
 * key/value rows.
 *
 * FO-B3 (EMR-1109): "Save changes" now persists server-side through
 * `saveDemographicsSection` (audited, org-scoped, permission-gated) instead
 * of the old localStorage-only buffer. Server data is the initial state and
 * the saved-at stamp comes from the server result.
 */

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  saveDemographicsSection,
  type DemographicsExtraRow,
} from "./actions";

interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
}

export function DemographicsDetailEditor({
  patientId,
  section,
  fields,
  seed,
  initialExtras,
  initialSavedAt,
  canEdit,
  patientLifeNumber,
}: {
  patientId: string;
  section: string;
  fields: FieldDef[];
  seed: Record<string, string>;
  initialExtras: DemographicsExtraRow[];
  initialSavedAt: string | null;
  canEdit: boolean;
  patientLifeNumber: string;
}) {
  const [values, setValues] = React.useState<Record<string, string>>(seed);
  const [extras, setExtras] = React.useState<DemographicsExtraRow[]>(initialExtras);
  const [savedAtLabel, setSavedAtLabel] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [newLabel, setNewLabel] = React.useState("");

  // Format the server's last-saved stamp after mount so SSR and client
  // markup can't disagree on locale formatting.
  React.useEffect(() => {
    if (initialSavedAt) {
      const d = new Date(initialSavedAt);
      if (!Number.isNaN(d.getTime())) {
        setSavedAtLabel(`Last saved ${d.toLocaleString()}`);
      }
    }
  }, [initialSavedAt]);

  function setField(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveDemographicsSection(
          patientId,
          section,
          values,
          extras,
        );
        if (result.ok) {
          setSavedAtLabel(
            `Saved at ${new Date(result.savedAt).toLocaleTimeString()}`,
          );
        } else {
          setError(result.error);
        }
      } catch {
        setError("Couldn't save — try again.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {section === "identity" && (
        <Card tone="raised">
          <CardContent className="pt-5 pb-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-subtle mb-1">
              Patient Life #
            </p>
            <p className="font-mono text-sm text-text">{patientLifeNumber}</p>
          </CardContent>
        </Card>
      )}

      <Card tone="raised">
        <CardContent className="pt-5 pb-5 space-y-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-text-subtle mb-1">
                {f.label}
              </label>
              <input
                value={values[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.placeholder ?? ""}
                disabled={!canEdit}
                className="w-full text-sm rounded-md border border-border bg-surface px-3 py-2 text-text focus:outline-none focus:border-accent disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Add arbitrary extra fields */}
      <Card tone="outlined">
        <CardContent className="pt-5 pb-5 space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">
            Additional information
          </p>
          {extras.map((row) => (
            <div key={row.id} className="flex items-center gap-2">
              <input
                value={row.label}
                onChange={(e) =>
                  setExtras((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, label: e.target.value } : r,
                    ),
                  )
                }
                placeholder="Label"
                disabled={!canEdit}
                className="w-40 text-sm rounded-md border border-border bg-surface px-2 py-1.5 text-text focus:outline-none focus:border-accent disabled:opacity-60"
              />
              <input
                value={row.value}
                onChange={(e) =>
                  setExtras((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, value: e.target.value } : r,
                    ),
                  )
                }
                placeholder="Value"
                disabled={!canEdit}
                className="flex-1 text-sm rounded-md border border-border bg-surface px-2 py-1.5 text-text focus:outline-none focus:border-accent disabled:opacity-60"
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setExtras((prev) => prev.filter((r) => r.id !== row.id))}
                  className="text-text-subtle hover:text-danger px-1"
                  aria-label="Erase"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {canEdit && (
            <div className="flex items-center gap-2">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Add a field…"
                className="flex-1 text-sm rounded-md border border-dashed border-border bg-surface px-2 py-1.5 text-text focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newLabel.trim()) return;
                  setExtras((prev) => [
                    ...prev,
                    { id: `x_${Date.now()}`, label: newLabel.trim(), value: "" },
                  ]);
                  setNewLabel("");
                }}
                className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-border text-text-muted hover:bg-surface-muted"
              >
                Add field
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-xs text-danger text-right">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {savedAtLabel && !error && (
          <span className="text-[11px] text-text-subtle">{savedAtLabel}</span>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="px-4 py-2 text-sm font-medium rounded-md bg-accent text-accent-ink hover:bg-accent-strong transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>
    </div>
  );
}
