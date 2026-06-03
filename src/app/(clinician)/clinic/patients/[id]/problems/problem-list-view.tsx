"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, FieldGroup } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  COMMON_PROBLEMS,
  STATUS_STYLES,
  type ProblemListEntry,
  type ProblemStatus,
} from "@/lib/domain/problem-list";
import { cn } from "@/lib/utils/cn";

import {
  addProblemAction,
  updateProblemAction,
  deleteProblemAction,
} from "./actions";

interface Props {
  patientId: string;
  providerName: string;
  initialProblems: ProblemListEntry[];
}

export function ProblemListView({ patientId, providerName, initialProblems }: Props) {
  const [problems, setProblems] = useState<ProblemListEntry[]>(initialProblems);
  const [hydrated, setHydrated] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setProblems(initialProblems);
  }, [initialProblems]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  async function addProblem(p: Omit<ProblemListEntry, "id" | "addedBy" | "addedAt">) {
    const entry: ProblemListEntry = {
      ...p,
      id: `temp-${Date.now()}`,
      addedBy: providerName,
      addedAt: new Date().toISOString(),
    };
    setProblems((prev) => [entry, ...prev]);

    await addProblemAction(patientId, {
      icd10: p.icd10,
      description: p.description,
      status: p.status,
      onsetDate: p.onsetDate,
      notes: p.notes,
      addedBy: providerName,
    });
  }

  async function updateProblem(id: string, patch: Partial<ProblemListEntry>) {
    setProblems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

    await updateProblemAction(patientId, id, {
      status: patch.status ?? "active",
      onsetDate: patch.onsetDate,
      resolvedDate: patch.resolvedDate,
      notes: patch.notes,
    });
  }

  async function changeStatus(id: string, status: ProblemStatus) {
    const patch: Partial<ProblemListEntry> = { status };
    if (status === "resolved") {
      patch.resolvedDate = new Date().toISOString().slice(0, 10);
    }
    await updateProblem(id, patch);
  }

  async function removeProblem(id: string) {
    setProblems((prev) => prev.filter((p) => p.id !== id));
    await deleteProblemAction(patientId, id);
  }

  const grouped = useMemo(() => {
    const order: ProblemStatus[] = ["active", "chronic", "inactive", "resolved"];
    const map: Record<ProblemStatus, ProblemListEntry[]> = {
      active: [],
      chronic: [],
      inactive: [],
      resolved: [],
    };
    for (const p of problems) map[p.status].push(p);
    return order.map((s) => ({ status: s, items: map[s] }));
  }, [problems]);

  if (!hydrated) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setAdding(true)}>
          Add problem
        </Button>
      </div>

      {adding && (
        <AddProblemForm
          onCancel={() => setAdding(false)}
          onSubmit={(p) => {
            addProblem(p);
            setAdding(false);
          }}
        />
      )}

      {problems.length === 0 && !adding ? (
        <EmptyState
          title="No problems recorded yet"
          description="Add the first ICD-10 problem to begin building this patient's problem list."
        />
      ) : (
        grouped.map(({ status, items }) =>
          items.length === 0 ? null : (
            <section key={status}>
              <h2 className="text-[11px] uppercase tracking-[0.14em] text-text-subtle font-medium mb-3">
                {STATUS_STYLES[status].label} · {items.length}
              </h2>
              <div className="space-y-3">
                {items.map((p) =>
                  editingId === p.id ? (
                    <EditProblemForm
                      key={p.id}
                      entry={p}
                      onCancel={() => setEditingId(null)}
                      onSave={(patch) => {
                        updateProblem(p.id, patch);
                        setEditingId(null);
                      }}
                    />
                  ) : (
                    <ProblemCard
                      key={p.id}
                      entry={p}
                      onEdit={() => setEditingId(p.id)}
                      onStatusChange={(s) => changeStatus(p.id, s)}
                      onRemove={() => removeProblem(p.id)}
                    />
                  ),
                )}
              </div>
            </section>
          ),
        )
      )}
    </div>
  );
}

function ProblemCard({
  entry,
  onEdit,
  onStatusChange,
  onRemove,
}: {
  entry: ProblemListEntry;
  onEdit: () => void;
  onStatusChange: (s: ProblemStatus) => void;
  onRemove: () => void;
}) {
  const style = STATUS_STYLES[entry.status];
  return (
    <Card tone="raised">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full",
                  style.bg,
                  style.text,
                )}
              >
                {style.label}
              </span>
              <span className="text-[11px] font-mono text-text-subtle tabular-nums">
                {entry.icd10}
              </span>
            </div>
            <p className="text-sm font-medium text-text">{entry.description}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-text-subtle">
              {entry.onsetDate && <span>Onset: {entry.onsetDate}</span>}
              {entry.resolvedDate && <span>Resolved: {entry.resolvedDate}</span>}
              <span>Added by {entry.addedBy}</span>
            </div>
            {entry.notes && (
              <p className="text-xs text-text-muted mt-2 leading-relaxed">
                {entry.notes}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={onEdit}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={onRemove}>
                Remove
              </Button>
            </div>
            <div className="flex gap-1">
              {(["active", "chronic", "inactive", "resolved"] as ProblemStatus[])
                .filter((s) => s !== entry.status)
                .map((s) => (
                  <button
                    key={s}
                    onClick={() => onStatusChange(s)}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-border-strong/60 text-text-muted hover:bg-surface-muted"
                  >
                    Mark {STATUS_STYLES[s].label}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AddProblemForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (p: Omit<ProblemListEntry, "id" | "addedBy" | "addedAt">) => void;
}) {
  const [query, setQuery] = useState("");
  const [icd10, setIcd10] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProblemStatus>("active");
  const [onsetDate, setOnsetDate] = useState("");
  const [notes, setNotes] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMON_PROBLEMS.slice(0, 8);
    return COMMON_PROBLEMS.filter(
      (p) =>
        p.icd10.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [query]);

  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle className="text-base">New problem</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <FieldGroup label="Search ICD-10">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by code or description..."
            />
          </FieldGroup>

          {matches.length > 0 && (
            <ul className="border border-border rounded-lg divide-y divide-border/60 bg-surface-raised">
              {matches.map((m) => (
                <li key={m.icd10}>
                  <button
                    type="button"
                    onClick={() => {
                      setIcd10(m.icd10);
                      setDescription(m.description);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-muted",
                      icd10 === m.icd10 && "bg-emerald-50",
                    )}
                  >
                    <span className="font-mono text-xs text-text-subtle tabular-nums w-20 shrink-0">
                      {m.icd10}
                    </span>
                    <span className="flex-1 text-text">{m.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FieldGroup label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProblemStatus)}
                className="flex h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text"
              >
                <option value="active">Active</option>
                <option value="chronic">Chronic</option>
                <option value="inactive">Inactive</option>
                <option value="resolved">Resolved</option>
              </select>
            </FieldGroup>
            <FieldGroup label="Onset date">
              <Input
                type="date"
                value={onsetDate}
                onChange={(e) => setOnsetDate(e.target.value)}
              />
            </FieldGroup>
          </div>

          <FieldGroup label="Notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Clinical notes / context..."
            />
          </FieldGroup>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!icd10 || !description}
              onClick={() =>
                onSubmit({
                  icd10,
                  description,
                  status,
                  onsetDate: onsetDate || undefined,
                  notes: notes || undefined,
                })
              }
            >
              Add to problem list
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EditProblemForm({
  entry,
  onCancel,
  onSave,
}: {
  entry: ProblemListEntry;
  onCancel: () => void;
  onSave: (patch: Partial<ProblemListEntry>) => void;
}) {
  const [status, setStatus] = useState<ProblemStatus>(entry.status);
  const [onsetDate, setOnsetDate] = useState(entry.onsetDate ?? "");
  const [notes, setNotes] = useState(entry.notes ?? "");

  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle className="text-base">
          Edit · {entry.icd10} {entry.description}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FieldGroup label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProblemStatus)}
                className="flex h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text"
              >
                <option value="active">Active</option>
                <option value="chronic">Chronic</option>
                <option value="inactive">Inactive</option>
                <option value="resolved">Resolved</option>
              </select>
            </FieldGroup>
            <FieldGroup label="Onset date">
              <Input
                type="date"
                value={onsetDate}
                onChange={(e) => setOnsetDate(e.target.value)}
              />
            </FieldGroup>
          </div>

          <FieldGroup label="Notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FieldGroup>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() =>
                onSave({
                  status,
                  onsetDate: onsetDate || undefined,
                  notes: notes || undefined,
                })
              }
            >
              Save changes
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
