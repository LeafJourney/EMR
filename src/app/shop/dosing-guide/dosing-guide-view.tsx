"use client";

// EMR-371 — Dosing-guide entry surface with a mandatory disclaimer gate.
//
// Every entry point (one card per format) triggers the disclaimer modal BEFORE
// the guide opens. The shopper must explicitly acknowledge (check the box +
// continue) every time — there is no "remember my choice", by design. A
// deep-link (?format=tincture) pre-arms the gate so arriving from a PDP also
// passes through the disclaimer.

import * as React from "react";
import { ShieldAlert, ChevronRight, Clock, Hourglass, X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/ornament";
import { DOSING_GUIDE, dosingEntryForKey, type DosingGuideEntry } from "./dosing-guide-data";

export function DosingGuideView({ initialFormat }: { initialFormat?: string }) {
  // The format the shopper tapped but has NOT yet acknowledged.
  const [pending, setPending] = React.useState<DosingGuideEntry | null>(null);
  // The format whose guide is currently open (post-acknowledgement).
  const [active, setActive] = React.useState<DosingGuideEntry | null>(null);

  // Deep-link entry: arriving with ?format=… arms the disclaimer once.
  React.useEffect(() => {
    const entry = dosingEntryForKey(initialFormat);
    if (entry) setPending(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openGate = (entry: DosingGuideEntry) => setPending(entry);
  const cancel = () => setPending(null);
  const proceed = () => {
    setActive(pending);
    setPending(null);
  };

  if (active) {
    return <GuidePanel entry={active} onBack={() => setActive(null)} />;
  }

  return (
    <div>
      <div className="mb-6 max-w-2xl">
        <Eyebrow className="mb-2">Dosing guide</Eyebrow>
        <h1 className="font-display text-3xl tracking-tight text-text sm:text-4xl">
          Start low, go slow
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          General, evidence-informed guidance by product format. Pick a format to read how it tends
          to work — onset, duration, and a gentle way to find your level. This is education, not
          medical advice.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DOSING_GUIDE.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => openGate(entry)}
            className="group text-left"
            aria-haspopup="dialog"
          >
            <Card tone="raised" className="h-full transition-shadow group-hover:shadow-lg">
              <CardContent className="py-5">
                <span className="mb-3 block text-3xl" aria-hidden="true">
                  {entry.emoji}
                </span>
                <p className="font-medium text-text">{entry.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">{entry.blurb}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="neutral">
                    <Clock width={11} height={11} /> {entry.onset}
                  </Badge>
                  <Badge tone="neutral">
                    <Hourglass width={11} height={11} /> {entry.duration}
                  </Badge>
                </div>
                <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent">
                  Read the guide <ChevronRight width={14} height={14} />
                </span>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {pending && (
        <DosingDisclaimerModal entry={pending} onCancel={cancel} onProceed={proceed} />
      )}
    </div>
  );
}

function GuidePanel({ entry, onBack }: { entry: DosingGuideEntry; onBack: () => void }) {
  return (
    <div className="max-w-2xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text"
      >
        <ArrowLeft width={15} height={15} /> All formats
      </button>

      <div className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden="true">
          {entry.emoji}
        </span>
        <div>
          <Eyebrow>Dosing guide</Eyebrow>
          <h1 className="font-display text-3xl tracking-tight text-text">{entry.label}</h1>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge tone="accent">
          <Clock width={11} height={11} /> Onset · {entry.onset}
        </Badge>
        <Badge tone="accent">
          <Hourglass width={11} height={11} /> Duration · {entry.duration}
        </Badge>
      </div>

      <Card tone="raised" className="mt-5">
        <CardContent className="py-5">
          <p className="font-medium text-text">Finding your level</p>
          <ol className="mt-3 space-y-2.5">
            {entry.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-text-muted">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-medium text-accent">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card tone="ambient" className="mt-4">
        <CardContent className="py-5">
          <p className="font-medium text-text">Good to know</p>
          <ul className="mt-2 space-y-1.5 text-[14px] leading-relaxed text-text-muted">
            {entry.tips.map((tip, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                {tip}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <p className="mt-4 text-[12px] leading-relaxed text-text-subtle">
        This guidance is general and educational. It is not medical advice. Talk with your
        healthcare provider before starting any cannabis product or changing how you use one.
      </p>
    </div>
  );
}

export function DosingDisclaimerModal({
  entry,
  onCancel,
  onProceed,
}: {
  entry: DosingGuideEntry;
  onCancel: () => void;
  onProceed: () => void;
}) {
  const [agreed, setAgreed] = React.useState(false);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 backdrop-blur-sm sm:items-center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="dosing-disclaimer-title"
      aria-describedby="dosing-disclaimer-body"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-border bg-surface-raised p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-highlight-soft text-[color:var(--highlight-hover)]">
            <ShieldAlert width={20} height={20} />
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-8 w-8 place-items-center rounded-full text-text-muted hover:bg-surface-muted"
            aria-label="Close"
          >
            <X width={18} height={18} />
          </button>
        </div>

        <h2 id="dosing-disclaimer-title" className="font-display text-xl tracking-tight text-text">
          Before you read the {entry.label.toLowerCase()} guide
        </h2>

        <ul id="dosing-disclaimer-body" className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-text-muted">
          <li className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            This guide is <span className="font-medium text-text">evidence-based education only</span> — it is{" "}
            <span className="font-medium text-text">not medical advice</span>.
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            Always <span className="font-medium text-text">consult your healthcare provider</span> before starting any
            cannabis product or changing how you dose.
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            You are <span className="font-medium text-text">responsible for your own cannabis use</span> — not LeafMart.
          </li>
        </ul>

        <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3 text-[13px] text-text">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--accent)]"
          />
          <span>I understand and agree to the above.</span>
        </label>

        <div className="mt-4 flex gap-2">
          <Button ref={cancelRef} variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={onProceed} disabled={!agreed}>
            Continue to guide
          </Button>
        </div>
      </div>
    </div>
  );
}
