"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  kioskSearchPatients,
  getKioskCheckInContext,
  kioskCheckIn,
  type KioskPatientHit,
  type KioskCheckInContext,
} from "./actions";

// Front-desk kiosk flow. Four steps, all client-driven over the three kiosk
// server actions:
//   search  → patient types their name, picks themselves from a short list
//   confirm → "is this you?" with full name + DOB (shown only after selection)
//   done    → check-in result + a launcher listing what's available in their
//             patient portal
//
// PII hygiene: the result LIST shows first name + last initial only, so a
// bystander glancing at the screen can't read a roster. Full name + DOB appear
// only on the confirmation card, after the patient has chosen their own row.

type Step =
  | { kind: "search" }
  | { kind: "confirm"; hit: KioskPatientHit }
  | { kind: "done"; context: KioskCheckInContext | null; alreadyCheckedIn: boolean };

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 220;

function formatDob(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${m}/${d}/${y}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Workflows shipped in the patient portal — surfaced as a "what's next" menu. */
const PORTAL_WORKFLOWS: Array<{ emoji: string; label: string; blurb: string }> = [
  { emoji: "🌤️", label: "Daily check-in", blurb: "Rate pain, sleep, mood & more in seconds" },
  { emoji: "📋", label: "Health assessments", blurb: "Quick questionnaires your care team recommends" },
  { emoji: "✍️", label: "Update your intake", blurb: "Keep your history and goals current" },
  { emoji: "📨", label: "Consent forms", blurb: "Review and sign outstanding forms" },
];

export function KioskFlow() {
  const [step, setStep] = useState<Step>({ kind: "search" });

  if (step.kind === "search") {
    return <SearchStep onSelect={(hit) => setStep({ kind: "confirm", hit })} />;
  }
  if (step.kind === "confirm") {
    return (
      <ConfirmStep
        hit={step.hit}
        onBack={() => setStep({ kind: "search" })}
        onDone={(context, alreadyCheckedIn) =>
          setStep({ kind: "done", context, alreadyCheckedIn })
        }
      />
    );
  }
  return (
    <DoneStep
      context={step.context}
      alreadyCheckedIn={step.alreadyCheckedIn}
      onReset={() => setStep({ kind: "search" })}
    />
  );
}

function SearchStep({ onSelect }: { onSelect: (hit: KioskPatientHit) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KioskPatientHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((q: string) => {
    startTransition(async () => {
      const hits = await kioskSearchPatients(q);
      setResults(hits);
      setSearched(true);
    });
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearched(false);
      return;
    }
    timer.current = setTimeout(() => runSearch(q), DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, runSearch]);

  return (
    <div className="space-y-5">
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Start typing your first or last name…"
        aria-label="Your name"
        className="w-full text-center text-xl px-6 py-5 rounded-2xl border border-border bg-surface focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-all"
      />

      {query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH && (
        <p className="text-sm text-text-subtle">Keep typing…</p>
      )}

      {results.length > 0 && (
        <ul className="space-y-2 text-left">
          {results.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => onSelect(hit)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 rounded-xl border border-border/60 bg-surface hover:border-accent hover:bg-accent/5 transition-all text-left"
              >
                <span className="text-lg font-medium text-text">
                  {hit.firstName} {hit.lastName.charAt(0)}.
                </span>
                <span aria-hidden="true" className="text-text-subtle text-xl">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {searched && !isPending && results.length === 0 && (
        <p className="text-sm text-text-muted">
          We couldn&rsquo;t find that name. Try your other name, or see the front desk.
        </p>
      )}
    </div>
  );
}

function ConfirmStep({
  hit,
  onBack,
  onDone,
}: {
  hit: KioskPatientHit;
  onBack: () => void;
  onDone: (context: KioskCheckInContext | null, alreadyCheckedIn: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await kioskCheckIn(hit.id);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please see the front desk.");
        return;
      }
      const context = await getKioskCheckInContext(hit.id);
      onDone(context, Boolean(result.alreadyCheckedIn));
    });
  }

  const dob = formatDob(hit.dob);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface px-6 py-8">
        <p className="text-sm text-text-subtle mb-2">Is this you?</p>
        <p className="font-display text-3xl text-text tracking-tight">
          {hit.firstName} {hit.lastName}
        </p>
        {dob && <p className="text-text-muted mt-1">Date of birth · {dob}</p>}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-col gap-3">
        <Button size="lg" variant="primary" onClick={handleConfirm} disabled={isPending}>
          {isPending ? "Checking you in…" : "Yes, check me in"}
        </Button>
        <Button size="lg" variant="ghost" onClick={onBack} disabled={isPending}>
          No, that&rsquo;s not me
        </Button>
      </div>
    </div>
  );
}

function DoneStep({
  context,
  alreadyCheckedIn,
  onReset,
}: {
  context: KioskCheckInContext | null;
  alreadyCheckedIn: boolean;
  onReset: () => void;
}) {
  // Auto-reset back to the search screen after a short dwell, so the kiosk is
  // ready for the next walk-in without a staff tap.
  useEffect(() => {
    const t = setTimeout(onReset, 25_000);
    return () => clearTimeout(t);
  }, [onReset]);

  const appt = context?.appointment ?? null;
  const time = formatTime(appt?.time ?? null);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="text-5xl" aria-hidden="true">
          {alreadyCheckedIn ? "👍" : "✅"}
        </div>
        <h2 className="font-display text-3xl text-text tracking-tight">
          {alreadyCheckedIn ? "You're already checked in" : "You're checked in!"}
        </h2>
        {context?.firstName && (
          <p className="text-text-muted">
            Thanks, {context.firstName}. Please have a seat — we&rsquo;ll call you shortly.
          </p>
        )}
        {(time || appt?.providerName) && (
          <p className="text-sm text-text-subtle">
            {time && <>Appointment at {time}</>}
            {time && appt?.providerName && " · "}
            {appt?.providerName && <>with {appt.providerName}</>}
          </p>
        )}
        {!appt && (
          <p className="text-sm text-text-subtle">
            We&rsquo;ve let the front desk know you&rsquo;re here.
          </p>
        )}
      </div>

      <div className="text-left">
        <p className="text-[11px] uppercase tracking-[0.18em] text-text-subtle font-medium mb-3">
          While you wait — explore your patient portal
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {PORTAL_WORKFLOWS.map((w) => (
            <li
              key={w.label}
              className="flex items-start gap-3 rounded-xl border border-border/50 bg-surface/60 px-4 py-3"
            >
              <span className="text-2xl" aria-hidden="true">
                {w.emoji}
              </span>
              <span>
                <span className="block text-sm font-medium text-text">{w.label}</span>
                <span className="block text-xs text-text-muted leading-snug">{w.blurb}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Button size="lg" variant="secondary" onClick={onReset}>
        Done
      </Button>
    </div>
  );
}
