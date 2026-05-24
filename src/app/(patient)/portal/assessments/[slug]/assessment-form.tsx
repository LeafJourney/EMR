"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { submitAssessmentAction, type SubmitResult } from "./actions";
import type { AssessmentTemplate } from "./templates";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/ornament";
import { Badge } from "@/components/ui/badge";
import { SubmitButton as SharedSubmitButton } from "@/lib/ui/form-helpers";

// ---------------------------------------------------------------------------
// Submit button — driven by useFormStatus via the shared SubmitButton helper.
// ---------------------------------------------------------------------------

function SubmitButton() {
  return (
    <SharedSubmitButton
      size="lg"
      idleLabel="Submit assessment"
      pendingLabel="Submitting…"
    />
  );
}

// ---------------------------------------------------------------------------
// Option pill — styled radio button
// ---------------------------------------------------------------------------

function OptionPill({
  name,
  option,
  compact,
}: {
  name: string;
  option: { label: string; value: number };
  compact: boolean;
}) {
  return (
    <label className="relative cursor-pointer group">
      <input
        type="radio"
        name={name}
        value={option.value}
        className="peer sr-only"
      />
      <span
        className={
          "inline-flex items-center justify-center rounded-lg border border-border-strong/70 " +
          "bg-surface text-sm font-medium text-text-muted transition-all duration-200 " +
          "peer-checked:bg-accent peer-checked:text-accent-ink peer-checked:border-accent peer-checked:shadow-md " +
          "hover:bg-surface-muted hover:border-border-strong " +
          "peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface " +
          (compact ? "h-10 w-10 text-sm" : "h-10 px-4 min-w-[3rem]")
        }
      >
        {option.label}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export function AssessmentForm({ template }: { template: AssessmentTemplate }) {
  const [state, formAction] = useFormState<SubmitResult | null, FormData>(
    submitAssessmentAction,
    null
  );

  const isCompact = template.slug === "pain-vas";

  // After successful submission, show result card
  if (state?.ok) {
    return (
      <Card tone="raised" className="max-w-xl mx-auto">
        <CardHeader className="text-center pb-2">
          <Eyebrow className="justify-center mb-3">{template.title} Result</Eyebrow>
          <div className="mt-2">
            <span className="font-display text-5xl text-accent tracking-tight">
              {state.score}
            </span>
            <span className="text-lg text-text-muted ml-2">
              / {template.slug === "pain-vas" ? "10" : template.questions.length * 3}
            </span>
          </div>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <Badge
            tone={
              state.label === "Minimal" || state.label === "Mild"
                ? "success"
                : state.label === "Moderate"
                ? "warning"
                : "danger"
            }
            className="text-xs px-3 py-1"
          >
            {state.label}
          </Badge>
          <p className="text-sm text-text-muted leading-relaxed max-w-md mx-auto">
            {state.interpretation}
          </p>
        </CardContent>
        <CardFooter className="justify-center border-t border-border/60 pt-5">
          <Link href="/portal/assessments">
            <Button variant="secondary" size="md">
              Back to assessments
            </Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="slug" value={template.slug} />

      <Card tone="raised">
        <CardHeader>
          <Eyebrow className="mb-2">{template.title}</Eyebrow>
          <CardTitle className="text-xl">{template.title} Assessment</CardTitle>
          <CardDescription>{template.description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-0 divide-y divide-border/60">
          {template.questions.map((q, idx) => (
            <div key={q.id} className="py-5 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-text mb-3">
                <span className="text-text-subtle mr-2">{idx + 1}.</span>
                {q.text}
              </p>
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => (
                  <OptionPill
                    key={`${q.id}-${opt.value}`}
                    name={q.id}
                    option={opt}
                    compact={isCompact}
                  />
                ))}
              </div>
              {isCompact && (
                <div className="flex justify-between mt-1.5 px-1">
                  <span className="text-[11px] text-text-subtle">No pain</span>
                  <span className="text-[11px] text-text-subtle">Worst pain</span>
                </div>
              )}
            </div>
          ))}
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
