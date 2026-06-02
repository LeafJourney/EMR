"use client";

// EMR-959 — ICD-10 coding picker popup for the eligibility "Recommended
// Next Steps" list.
//
// Renders the "Document qualifying condition with ICD-10 coding" next-step
// as a clickable button that opens a ModalShell. Inside the modal:
//   • a search Input + a "Search" button (Enter also searches)
//   • as the provider types a code OR a diagnosis term, a typeahead
//     dropdown surfaces the TOP 5 best matches
//   • on Search/Enter, EVERY match renders in two columns (code | desc)
//   • each row is clickable to ADD it to the staged diagnoses list
//
// NOTE on persistence: the eligibility checker is a stateless tool with no
// selected patient / patientId and there is no Prisma-backed diagnosis
// model wired to this surface (the patient problem list itself is
// localStorage-only). So per spec we stage selections client-side as
// "Added" chips and surface a clear note rather than inventing schema or a
// server action. When a patient context lands on this page, swap the
// `onAdd` handler for a server action without touching this component's UX.

import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/utils/cn";
import { searchIcd10, type Icd10Entry } from "./icd10-data";

const TYPEAHEAD_LIMIT = 5;

export function Icd10PickerButton({
  /** Optional seed query (e.g. the eligibility form's free-text diagnosis). */
  seedQuery = "",
}: {
  seedQuery?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left underline decoration-accent/40 underline-offset-2 hover:decoration-accent text-text-muted hover:text-accent transition-colors"
      >
        Document qualifying condition with ICD-10 coding
      </button>

      <Icd10PickerModal
        open={open}
        onClose={() => setOpen(false)}
        seedQuery={seedQuery}
      />
    </>
  );
}

function Icd10PickerModal({
  open,
  onClose,
  seedQuery,
}: {
  open: boolean;
  onClose: () => void;
  seedQuery: string;
}) {
  const [query, setQuery] = useState(seedQuery);
  // The "committed" query — set on Search/Enter — drives the full two-column
  // results list. While the provider is still typing, only the typeahead
  // dropdown is shown.
  const [committed, setCommitted] = useState("");
  const [typeaheadOpen, setTypeaheadOpen] = useState(false);
  const [added, setAdded] = useState<Icd10Entry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Top-5 typeahead as the provider types.
  const typeahead = useMemo(
    () => (query.trim() ? searchIcd10(query).slice(0, TYPEAHEAD_LIMIT) : []),
    [query],
  );

  // EVERY match for the committed search, shown in two columns.
  const results = useMemo(
    () => (committed.trim() ? searchIcd10(committed) : []),
    [committed],
  );

  const addedCodes = useMemo(
    () => new Set(added.map((a) => a.code)),
    [added],
  );

  function runSearch() {
    setCommitted(query);
    setTypeaheadOpen(false);
  }

  function addEntry(entry: Icd10Entry) {
    setAdded((prev) =>
      prev.some((a) => a.code === entry.code) ? prev : [...prev, entry],
    );
  }

  function removeEntry(code: string) {
    setAdded((prev) => prev.filter((a) => a.code !== code));
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow="EMR-959 · ICD-10 coding"
      title="Document qualifying condition"
      description="Search by ICD-10 code or diagnosis term, then add codes to this encounter's diagnoses."
      maxWidth="max-w-2xl"
      placement="center"
    >
      <div className="px-6 py-5 space-y-5">
        {/* Search row: Input + Search button on the right */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setTypeaheadOpen(true);
                }}
                onFocus={() => setTypeaheadOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch();
                  }
                }}
                placeholder="e.g. G89.29, chronic pain, anxiety, PTSD…"
                autoComplete="off"
              />

              {/* Typeahead dropdown — top 5 best matches */}
              {typeaheadOpen && typeahead.length > 0 && (
                <>
                  <button
                    type="button"
                    aria-label="Close suggestions"
                    className="fixed inset-0 z-40"
                    onClick={() => setTypeaheadOpen(false)}
                  />
                  <ul className="absolute z-50 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface-raised shadow-lg">
                    {typeahead.map((c) => (
                      <li key={c.code}>
                        <button
                          type="button"
                          onClick={() => {
                            addEntry(c);
                            setTypeaheadOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-muted"
                        >
                          <span className="font-mono text-xs text-accent tabular-nums w-20 shrink-0">
                            {c.code}
                          </span>
                          <span className="text-text truncate">
                            {c.description}
                          </span>
                          <span className="ml-auto text-[10px] uppercase tracking-wide text-text-subtle shrink-0">
                            {addedCodes.has(c.code) ? "Added" : "Add"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <Button onClick={runSearch}>Search</Button>
          </div>
          <p className="mt-1.5 text-[11px] text-text-subtle">
            Type a code or diagnosis for instant suggestions, or press Search /
            Enter to list every match.
          </p>
        </div>

        {/* Added (staged) chips */}
        {added.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-text-subtle">
              Added ({added.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {added.map((a) => (
                <Badge key={a.code} tone="accent" className="pr-1">
                  <span className="font-mono tabular-nums">{a.code}</span>
                  <span className="opacity-80 truncate max-w-[22ch]">
                    {a.description}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeEntry(a.code)}
                    aria-label={`Remove ${a.code}`}
                    className="ml-1 h-4 w-4 inline-flex items-center justify-center rounded-full hover:bg-accent/20 text-accent"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <p className="text-[11px] text-text-subtle italic">
              Staged on this device only — the eligibility checker has no
              selected patient to persist diagnoses to. Re-enter these on the
              patient&apos;s problem list to save them to the chart.
            </p>
          </div>
        )}

        {/* Full results — two columns: code | description */}
        {committed.trim() && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-subtle mb-2">
              Results ({results.length})
            </p>
            {results.length === 0 ? (
              <p className="px-3 py-6 text-sm text-text-subtle text-center border border-border rounded-xl">
                No ICD-10 codes match &ldquo;{committed}&rdquo;.
              </p>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                <div className="grid grid-cols-[7rem_1fr] bg-surface-muted px-3 py-1.5 sticky top-0 z-10">
                  <span className="text-[10px] uppercase tracking-wider text-text-subtle font-medium">
                    Code
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-text-subtle font-medium">
                    Description
                  </span>
                </div>
                <ul className="divide-y divide-border/60">
                  {results.map((c) => {
                    const isAdded = addedCodes.has(c.code);
                    return (
                      <li key={c.code}>
                        <button
                          type="button"
                          onClick={() => addEntry(c)}
                          className={cn(
                            "w-full grid grid-cols-[7rem_1fr] items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors",
                            isAdded
                              ? "bg-accent-soft/60"
                              : "hover:bg-surface-muted",
                          )}
                        >
                          <span className="font-mono text-xs text-accent tabular-nums">
                            {c.code}
                          </span>
                          <span className="flex items-center justify-between gap-2 min-w-0">
                            <span className="text-text truncate">
                              {c.description}
                            </span>
                            <span
                              className={cn(
                                "text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-md shrink-0",
                                isAdded
                                  ? "bg-accent text-accent-ink"
                                  : "bg-surface-muted text-text-muted",
                              )}
                            >
                              {isAdded ? "Added" : "Add"}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
