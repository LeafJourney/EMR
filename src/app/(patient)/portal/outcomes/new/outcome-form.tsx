"use client";

import { useEffect } from "react";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { submitOutcomeAction, type OutcomeResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/ornament";
import { LeafSprig } from "@/components/ui/ornament";
import { LeafCelebration } from "@/components/ui/leaf-celebration";

// ---------------------------------------------------------------------------
// Submit button
// ---------------------------------------------------------------------------

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Saving..." : "Save check-in"}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Scale pill selector (0-10)
// ---------------------------------------------------------------------------

function ScalePill({ name, value }: { name: string; value: number }) {
  // EMR-031: 44px tap targets on phones (iOS/Android guideline) shrinking
  // back to 36px on tablet+ where pointer accuracy isn't an issue.
  return (
    <label className="relative cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        className="peer sr-only"
      />
      <span
        className={
          "inline-flex items-center justify-center h-11 w-11 sm:h-9 sm:w-9 rounded-full border border-border-strong/70 " +
          "bg-surface text-base sm:text-sm font-medium text-text-muted transition-all duration-200 " +
          "peer-checked:bg-accent peer-checked:text-accent-ink peer-checked:border-accent peer-checked:shadow-md peer-checked:scale-105 " +
          "hover:bg-surface-muted hover:border-border-strong active:scale-95 " +
          "peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface"
        }
      >
        {value}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Metric row
// ---------------------------------------------------------------------------

interface MetricConfig {
  name: string;
  label: string;
  lowLabel: string;
  highLabel: string;
}

const METRICS: MetricConfig[] = [
  { name: "pain", label: "Pain", lowLabel: "No pain", highLabel: "Worst pain" },
  { name: "sleep", label: "Sleep quality", lowLabel: "Very poor", highLabel: "Excellent" },
  { name: "anxiety", label: "Anxiety", lowLabel: "None", highLabel: "Severe" },
  { name: "mood", label: "Mood", lowLabel: "Very low", highLabel: "Great" },
  { name: "nausea", label: "Nausea", lowLabel: "None", highLabel: "Severe" },
];

function MetricRow({ config }: { config: MetricConfig }) {
  return (
    <div className="py-5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2 mb-3">
        <LeafSprig size={14} className="text-accent/70" />
        <p className="text-sm font-medium text-text">{config.label}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }, (_, i) => (
          <ScalePill key={i} name={config.name} value={i} />
        ))}
      </div>
      <div className="flex justify-between mt-1.5 px-1">
        <span className="text-[11px] text-text-subtle">{config.lowLabel}</span>
        <span className="text-[11px] text-text-subtle">{config.highLabel}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export function OutcomeForm() {
  const [state, formAction] = useFormState<OutcomeResult | null, FormData>(
    submitOutcomeAction,
    null
  );

  useEffect(() => {
    if (state?.ok && state.newlyEarnedBadges && state.newlyEarnedBadges.length > 0) {
      import("@/components/portal/confetti-canvas").then(({ confettiEmitter }) => {
        confettiEmitter.emit({
          id: `badge-${Date.now()}`,
          type: "badge_earned",
          message: "You earned a new badge!",
        });
      });
    }
  }, [state]);

  // Success state
  if (state?.ok) {
    return (
      <Card tone="raised" className="max-w-xl mx-auto text-center relative overflow-hidden">
        {/* EMR-176: leaf + confetti shower greets the patient on save. */}
        <LeafCelebration />
        <CardHeader className="pb-2 relative">
          <Eyebrow className="justify-center mb-3">Check-in saved</Eyebrow>
          <CardTitle className="text-2xl">Thank you!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-text-muted leading-relaxed max-w-md mx-auto">
            Your check-in has been recorded. Your care team can now see how
            you are trending over time -- this helps them fine-tune your
            care plan.
          </p>
        </CardContent>
        <CardFooter className="justify-center gap-3">
          <Link href="/portal/outcomes">
            <Button variant="primary" size="md">
              View your trends
            </Button>
          </Link>
          <Link href="/portal">
            <Button variant="secondary" size="md">
              Back to home
            </Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <form action={formAction}>
      <Card tone="raised">
        <CardHeader>
          <Eyebrow className="mb-2">Daily check-in</Eyebrow>
          <CardTitle className="text-xl">How are you feeling today?</CardTitle>
        </CardHeader>

        <CardContent className="space-y-0 divide-y divide-border/60">
          {METRICS.map((m) => (
            <MetricRow key={m.name} config={m} />
          ))}

          {/* Optional note */}
          <div className="py-5">
            <p className="text-sm font-medium text-text mb-2">
              Anything else you want to share? <span className="text-text-subtle font-normal">(optional)</span>
            </p>
            <Textarea
              name="note"
              rows={3}
              placeholder="e.g. slept poorly last night, tried a new tincture before bed..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Positive note — required */}
      <Card className="mt-6 bg-highlight-soft border border-highlight/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <LeafSprig size={18} className="text-highlight" />
            Something good
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-muted leading-relaxed mb-3">
            Before you submit, share one positive thing about your life right
            now — a person, a moment, a feeling, anything good.
          </p>
          <Textarea
            name="positiveNote"
            rows={3}
            required
            placeholder="My daughter made me laugh today... / The weather was beautiful... / I slept better last night..."
          />
        </CardContent>
        <CardFooter>
          {state?.ok === false && (
            <p className="text-sm text-danger">{state.error}</p>
          )}
          <div className="ml-auto">
            <SubmitButton />
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}
