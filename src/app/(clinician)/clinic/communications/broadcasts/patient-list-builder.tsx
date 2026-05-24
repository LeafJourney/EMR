"use client";

// EMR-707 — Patient-list builder dialog for /clinic/communications/broadcasts.
//
// Free-text search (reuses /api/patients/search), Add button, table of
// selected patients with per-row trash icon + confirm-on-delete popup.
// The list is held in client state; selected IDs are emitted to the
// parent compose form via `onChange`, where they ride along to the
// campaign action as the `customPatientIds` audience filter.

import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type ListPatient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
};

type SearchResult = { patients: ListPatient[] };

export function PatientListBuilder({
  patients,
  onChange,
}: {
  patients: ListPatient[];
  onChange: (next: ListPatient[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ListPatient[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/patients/search?q=${encodeURIComponent(q)}`,
        { signal: ctrl.signal },
      );
      if (!res.ok) {
        setResults([]);
      } else {
        const data = (await res.json()) as SearchResult;
        setResults(data.patients ?? []);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(runSearch, 200);
    return () => clearTimeout(t);
  }, [open, runSearch]);

  const addPatient = (p: ListPatient) => {
    if (patients.some((x) => x.id === p.id)) return;
    onChange([...patients, p]);
  };

  const confirmDelete = (id: string) => {
    onChange(patients.filter((p) => p.id !== id));
    setPendingDelete(null);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        data-testid="open-patient-list-builder"
      >
        Create patient list
        {patients.length > 0 ? ` (${patients.length})` : ""}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Patient info</DialogTitle>
          </DialogHeader>

          <div className="flex items-end gap-2 mt-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="plb-q">
                Search — name, phone, DOB, medical life number
              </Label>
              <Input
                id="plb-q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results[0]) {
                    e.preventDefault();
                    addPatient(results[0]);
                    setQuery("");
                  }
                }}
                placeholder="e.g. Maya, 555-0100, 1989-03-12"
              />
            </div>
            <Button
              type="button"
              onClick={() => {
                if (results[0]) {
                  addPatient(results[0]);
                  setQuery("");
                }
              }}
              disabled={!results[0]}
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          {loading ? (
            <p className="text-xs text-text-subtle mt-2">Searching…</p>
          ) : results.length > 0 ? (
            <ul className="mt-2 max-h-32 overflow-y-auto rounded-md border border-border-strong divide-y">
              {results.map((p) => (
                <li
                  key={p.id}
                  className="px-3 py-1.5 text-xs hover:bg-surface-muted flex justify-between"
                >
                  <span>
                    {p.firstName} {p.lastName} · {p.dateOfBirth ?? "—"}
                  </span>
                  <button
                    type="button"
                    className="text-accent text-[11px]"
                    onClick={() => addPatient(p)}
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4">
            <p className="text-xs font-medium text-text mb-1">Patient list</p>
            <div className="rounded-md border border-border-strong overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-surface-muted text-text-subtle">
                  <tr>
                    <th className="text-left px-2 py-1">First</th>
                    <th className="text-left px-2 py-1">Last</th>
                    <th className="text-left px-2 py-1">DOB</th>
                    <th className="text-left px-2 py-1">Phone</th>
                    <th className="text-left px-2 py-1">Email</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {patients.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-2 py-3 text-center text-text-subtle"
                      >
                        No patients yet — search above to add.
                      </td>
                    </tr>
                  ) : (
                    patients.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-2 py-1">{p.firstName}</td>
                        <td className="px-2 py-1">{p.lastName}</td>
                        <td className="px-2 py-1">{p.dateOfBirth ?? "—"}</td>
                        <td className="px-2 py-1">{p.phone ?? "—"}</td>
                        <td className="px-2 py-1">{p.email ?? "—"}</td>
                        <td className="px-2 py-1 text-right">
                          <button
                            type="button"
                            aria-label="Remove patient"
                            onClick={() => setPendingDelete(p.id)}
                            className="text-danger hover:opacity-80"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>

          {pendingDelete ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="bg-surface rounded-lg p-4 shadow-lg max-w-xs">
                <p className="text-sm text-text mb-3">
                  Remove this patient from the list?
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setPendingDelete(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => confirmDelete(pendingDelete)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
