"use client";

/**
 * Editable demographics detail page (EMR-848 / EMR-850).
 *
 * Each demographics subsection opens here as its own page where staff can
 * type, add, edit and erase information. Known fields per section are seeded
 * from the chart; an "additional fields" list lets staff add arbitrary
 * key/value rows. Persisted per patient+section in localStorage (no schema
 * change permitted this sprint) with a stable shape a server store can adopt.
 */

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { usePersistentState } from "../../chart-kit";

interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
}

interface ExtraRow {
  id: string;
  label: string;
  value: string;
}

export function DemographicsDetailEditor({
  patientId,
  section,
  fields,
  seed,
  patientLifeNumber,
}: {
  patientId: string;
  section: string;
  fields: FieldDef[];
  seed: Record<string, string>;
  patientLifeNumber: string;
}) {
  const storeKey = `demographics-detail:${patientId}:${section}:v1`;
  const [values, setValues] = usePersistentState<Record<string, string>>(
    storeKey,
    seed,
  );
  const [extras, setExtras] = usePersistentState<ExtraRow[]>(
    `${storeKey}:extras`,
    [],
  );
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [newLabel, setNewLabel] = React.useState("");

  function setField(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function save() {
    // usePersistentState already writes through; this just flags a save.
    setSavedAt(new Date().toLocaleTimeString());
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
                className="w-full text-sm rounded-md border border-border bg-surface px-3 py-2 text-text focus:outline-none focus:border-accent"
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
                className="w-40 text-sm rounded-md border border-border bg-surface px-2 py-1.5 text-text focus:outline-none focus:border-accent"
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
                className="flex-1 text-sm rounded-md border border-border bg-surface px-2 py-1.5 text-text focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setExtras((prev) => prev.filter((r) => r.id !== row.id))}
                className="text-text-subtle hover:text-danger px-1"
                aria-label="Erase"
              >
                ×
              </button>
            </div>
          ))}
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
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {savedAt && (
          <span className="text-[11px] text-text-subtle">Saved at {savedAt}</span>
        )}
        <button
          type="button"
          onClick={save}
          className="px-4 py-2 text-sm font-medium rounded-md bg-accent text-accent-ink hover:bg-accent-strong transition-colors"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
