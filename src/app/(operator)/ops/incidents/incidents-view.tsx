"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldGroup, Input, Textarea } from "@/components/ui/input";
import {
  EmptyFilterState,
  FilterChips,
  MultiSelectFilter,
  SavedViewsBar,
  SortMenu,
  type ActiveChip,
} from "@/components/ui/filter-bar";
import {
  INCIDENT_CATEGORY_LABELS,
  type IncidentCategory,
  type IncidentReport,
  type IncidentSeverity,
} from "@/lib/domain/overnight-batch";
import { cn } from "@/lib/utils/cn";

const SEVERITY_TONES: Record<IncidentSeverity, "neutral" | "warning" | "highlight" | "danger"> = {
  low: "neutral",
  medium: "warning",
  high: "highlight",
  critical: "danger",
};

const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const SEVERITY_ORDER: IncidentSeverity[] = ["low", "medium", "high", "critical"];
const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};
const CATEGORY_OPTIONS = Object.keys(INCIDENT_CATEGORY_LABELS) as IncidentCategory[];

type StatusFilter = "open" | "resolved";
type SortKey = "newest" | "oldest" | "severity-desc" | "severity-asc";

type ViewState = {
  severities: IncidentSeverity[];
  categories: IncidentCategory[];
  statuses: StatusFilter[];
  patientAffectedOnly: boolean;
  sort: SortKey;
};

const DEFAULT_STATE: ViewState = {
  severities: [],
  categories: [],
  statuses: [],
  patientAffectedOnly: false,
  sort: "newest",
};

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "severity-desc", label: "Severity (high to low)" },
  { value: "severity-asc", label: "Severity (low to high)" },
] as const;

export function IncidentsView({ initialIncidents }: { initialIncidents: IncidentReport[] }) {
  const [incidents, setIncidents] = useState<IncidentReport[]>(initialIncidents);
  const [state, setState] = useState<ViewState>(DEFAULT_STATE);
  const [formOpen, setFormOpen] = useState(false);
  const [resolving, setResolving] = useState<IncidentReport | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [draft, setDraft] = useState({
    severity: "low" as IncidentSeverity,
    category: "safety" as IncidentCategory,
    title: "",
    description: "",
    patientAffected: false,
  });

  const filtered = useMemo(() => {
    const list = incidents.filter((i) => {
      if (state.severities.length > 0 && !state.severities.includes(i.severity)) {
        return false;
      }
      if (state.categories.length > 0 && !state.categories.includes(i.category)) {
        return false;
      }
      if (state.statuses.length > 0) {
        const status: StatusFilter = i.resolvedAt ? "resolved" : "open";
        if (!state.statuses.includes(status)) return false;
      }
      if (state.patientAffectedOnly && !i.patientAffected) return false;
      return true;
    });
    return list.sort((a, b) => {
      switch (state.sort) {
        case "newest":
          return b.reportedAt.localeCompare(a.reportedAt);
        case "oldest":
          return a.reportedAt.localeCompare(b.reportedAt);
        case "severity-desc":
          return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
        case "severity-asc":
          return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      }
    });
  }, [incidents, state]);

  const chips: ActiveChip[] = [];
  if (state.severities.length > 0) {
    chips.push({
      id: "severities",
      label: "Severity",
      value: state.severities.map((s) => SEVERITY_LABELS[s]),
    });
  }
  if (state.categories.length > 0) {
    chips.push({
      id: "categories",
      label: "Category",
      value: state.categories.map((c) => INCIDENT_CATEGORY_LABELS[c]),
    });
  }
  if (state.statuses.length > 0) {
    chips.push({
      id: "statuses",
      label: "Status",
      value: state.statuses.map((s) => (s === "open" ? "Open" : "Resolved")),
    });
  }
  if (state.patientAffectedOnly) {
    chips.push({ id: "patient", label: "Flag", value: "Patient affected" });
  }

  function removeChip(id: string) {
    setState((s) => {
      switch (id) {
        case "severities":
          return { ...s, severities: [] };
        case "categories":
          return { ...s, categories: [] };
        case "statuses":
          return { ...s, statuses: [] };
        case "patient":
          return { ...s, patientAffectedOnly: false };
        default:
          return s;
      }
    });
  }

  function clearAll() {
    setState({ ...DEFAULT_STATE, sort: state.sort });
  }

  function isDefault(s: ViewState) {
    return (
      s.severities.length === 0 &&
      s.categories.length === 0 &&
      s.statuses.length === 0 &&
      !s.patientAffectedOnly &&
      s.sort === DEFAULT_STATE.sort
    );
  }

  function submit() {
    if (!draft.title.trim()) return;
    const inc: IncidentReport = {
      id: `inc-${Date.now()}`,
      severity: draft.severity,
      category: draft.category,
      title: draft.title.trim(),
      description: draft.description.trim(),
      patientAffected: draft.patientAffected,
      reportedBy: "You",
      reportedAt: new Date().toISOString(),
    };
    setIncidents((prev) => [inc, ...prev]);
    setFormOpen(false);
    setDraft({ severity: "low", category: "safety", title: "", description: "", patientAffected: false });
  }

  function resolve() {
    if (!resolving) return;
    setIncidents((prev) =>
      prev.map((i) =>
        i.id === resolving.id
          ? { ...i, resolvedAt: new Date().toISOString(), resolution: resolutionNotes.trim() || "Resolved" }
          : i,
      ),
    );
    setResolving(null);
    setResolutionNotes("");
  }

  return (
    <div className="space-y-5">
      <SavedViewsBar
        storageKey="ops.incidents"
        currentState={state}
        isDefault={isDefault}
        onApply={(s) => setState(s)}
        onReset={() => setState(DEFAULT_STATE)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <MultiSelectFilter
            label="Severity"
            options={SEVERITY_ORDER.map((s) => ({
              value: s,
              label: SEVERITY_LABELS[s],
            }))}
            selected={state.severities}
            onChange={(next) =>
              setState((s) => ({ ...s, severities: next as IncidentSeverity[] }))
            }
            placeholder="All severities"
          />
          <MultiSelectFilter
            label="Category"
            options={CATEGORY_OPTIONS.map((c) => ({
              value: c,
              label: INCIDENT_CATEGORY_LABELS[c],
            }))}
            selected={state.categories}
            onChange={(next) =>
              setState((s) => ({ ...s, categories: next as IncidentCategory[] }))
            }
            placeholder="All categories"
          />
          <MultiSelectFilter
            label="Status"
            options={[
              { value: "open", label: "Open" },
              { value: "resolved", label: "Resolved" },
            ]}
            selected={state.statuses}
            onChange={(next) =>
              setState((s) => ({ ...s, statuses: next as StatusFilter[] }))
            }
            placeholder="Open & resolved"
          />
          <button
            type="button"
            onClick={() =>
              setState((s) => ({ ...s, patientAffectedOnly: !s.patientAffectedOnly }))
            }
            className={cn(
              "h-9 px-3 rounded-md border text-sm transition-colors",
              state.patientAffectedOnly
                ? "border-danger bg-red-50 text-danger font-medium"
                : "border-border-strong bg-surface text-text-muted hover:bg-surface-muted/60",
            )}
          >
            Patient affected
          </button>
          <SortMenu
            options={[...SORT_OPTIONS]}
            value={state.sort}
            onChange={(next) => setState((s) => ({ ...s, sort: next as SortKey }))}
          />
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          Report new incident
        </Button>
      </div>

      <FilterChips chips={chips} onRemove={removeChip} onClearAll={clearAll} />

      <Card tone="raised">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-text-subtle border-b border-border">
                <th className="px-5 py-3 font-medium">Severity</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium">Title</th>
                <th className="px-5 py-3 font-medium">Reported</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="border-b border-border/40 hover:bg-surface-muted/40">
                  <td className="px-5 py-3.5">
                    <Badge tone={SEVERITY_TONES[i.severity]}>{SEVERITY_LABELS[i.severity]}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-text-muted text-xs">
                    {INCIDENT_CATEGORY_LABELS[i.category]}
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-text">{i.title}</p>
                    <p className="text-[11px] text-text-subtle line-clamp-1">{i.description}</p>
                    {i.patientAffected && (
                      <span className="mt-1 inline-block text-[10px] text-danger">Patient affected</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-text-muted">
                    <div>{new Date(i.reportedAt).toLocaleDateString()}</div>
                    <div className="text-[10px] text-text-subtle">{i.reportedBy}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    {i.resolvedAt ? (
                      <Badge tone="success">Resolved</Badge>
                    ) : (
                      <Badge tone="warning">Open</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {!i.resolvedAt && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setResolving(i);
                          setResolutionNotes("");
                        }}
                      >
                        Resolve
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-4">
              <EmptyFilterState
                title="No incidents match"
                hint="Try widening severity or status, or clear the patient-affected toggle."
                onClear={clearAll}
              />
            </div>
          )}
        </div>
      </Card>

      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setFormOpen(false)}
        >
          <Card tone="raised" className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardContent className="py-6 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-text-subtle mb-1">New report</p>
                <h3 className="font-display text-xl text-text">Report an incident</h3>
              </div>

              <div>
                <p className="text-sm font-medium text-text mb-2">Severity</p>
                <div className="grid grid-cols-4 gap-2">
                  {SEVERITY_ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDraft({ ...draft, severity: s })}
                      className={cn(
                        "py-2 rounded-md border text-xs font-medium transition-colors",
                        draft.severity === s
                          ? "border-emerald-700 bg-emerald-700 text-white"
                          : "border-border bg-surface text-text-muted hover:bg-surface-muted",
                      )}
                    >
                      {SEVERITY_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <FieldGroup label="Category">
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value as IncidentCategory })}
                  className="flex w-full rounded-md border border-border-strong bg-surface px-3 h-10 text-sm text-text"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{INCIDENT_CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </FieldGroup>

              <FieldGroup label="Title">
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Short summary"
                />
              </FieldGroup>

              <FieldGroup label="Description">
                <Textarea
                  rows={4}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="What happened, who was involved, any immediate actions taken?"
                />
              </FieldGroup>

              <label className="flex items-center gap-2 text-sm text-text-muted">
                <input
                  type="checkbox"
                  checked={draft.patientAffected}
                  onChange={(e) => setDraft({ ...draft, patientAffected: e.target.checked })}
                  className="h-4 w-4"
                />
                Patient affected
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={submit} disabled={!draft.title.trim()}>
                  Submit report
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {resolving && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setResolving(null)}
        >
          <Card tone="raised" className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="py-6 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-text-subtle mb-1">Resolve</p>
                <h3 className="font-display text-lg text-text">{resolving.title}</h3>
              </div>
              <FieldGroup label="Resolution notes">
                <Textarea
                  rows={4}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="What corrective action was taken?"
                />
              </FieldGroup>
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setResolving(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={resolve}>
                  Mark resolved
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
