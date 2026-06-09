"use client";

// EMR-427 — Step 15: Publish the configuration.
//
// Specialty-adaptive: validation and the publish call go through the same
// `/api/configs/[id]/publish` endpoint for every specialty. We never
// hardcode a slug here.
//
// On click:
//   POST /api/configs/[draftId]/publish
//     200 → redirect to /practices?published=1 — the super-admin fleet
//           landing page surfaces a success banner and renders the newly
//           published practice as an expandable KPI card.
//     409 → server returned `{ missing: [...] }` — surface inline with
//           deep-links back to the relevant earlier step.
//
// The button is disabled until every prior step (1..14) reports complete,
// so in practice the 409 branch is rare — the server's check is the
// authoritative gate.

import * as React from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WIZARD_STEPS } from "@/lib/onboarding/wizard-steps";
import type { PracticeConfiguration } from "@/lib/practice-config/types";
import type {
  WizardStepDefinition,
  WizardStepId,
  WizardStepProps,
} from "@/lib/onboarding/wizard-types";
import { DraftSummaryPanel, useDraftSummary } from "./preview-chrome";

/** Maps a missing-field key from the publish API to the wizard step that owns it. */
const MISSING_FIELD_TO_STEP: Record<string, { stepId: WizardStepId; label: string }> = {
  selectedSpecialty: { stepId: "select-specialty", label: "Specialty" },
  careModel: { stepId: "select-care-model", label: "Care model" },
  enabledModalities: { stepId: "enable-modalities", label: "Enabled modalities" },
};

/**
 * Compute "are every prior step's `isComplete` returning true?" — used to
 * gate the publish button. We deliberately exclude the publish step itself
 * from the check since its own `isComplete` always returns false (publish
 * has to *succeed*, not be skipped).
 */
function arePriorStepsComplete(
  draft: Partial<PracticeConfiguration>,
): boolean {
  for (const step of WIZARD_STEPS) {
    if (step.id === "publish") continue;
    if (!step.isComplete(draft)) return false;
  }
  return true;
}

/** Local "missing required fields" preflight, mirroring the server's check. */
function preflightMissing(
  draft: Partial<PracticeConfiguration>,
): string[] {
  const missing: string[] = [];
  if (!draft.selectedSpecialty) missing.push("selectedSpecialty");
  if (!draft.careModel) missing.push("careModel");
  if (
    !Array.isArray(draft.enabledModalities) ||
    draft.enabledModalities.length === 0
  ) {
    missing.push("enabledModalities");
  }
  return missing;
}

export function Step15Publish({ draft, goBack }: WizardStepProps) {
  const router = useRouter();
  const summary = useDraftSummary(draft);

  const draftId = (draft as { id?: string }).id ?? "";
  const allPriorComplete = arePriorStepsComplete(draft);
  const localMissing = preflightMissing(draft);

  const [submitting, setSubmitting] = React.useState(false);
  const [serverMissing, setServerMissing] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const buttonDisabled =
    submitting || !allPriorComplete || !draftId || localMissing.length > 0;

  const missingToShow = serverMissing.length > 0 ? serverMissing : localMissing;

  async function handlePublish() {
    if (!draftId) {
      setError("Missing draft id — cannot publish.");
      return;
    }
    setError(null);
    setServerMissing([]);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/configs/${encodeURIComponent(draftId)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (res.ok) {
        // Land on the practice we just created — its detail page is the
        // "practice has been born" moment (?published=1 triggers the
        // celebratory hero state there). The publish response is the full
        // PracticeConfiguration; /practices/[id] keys on its `id` (configId).
        // Fall back to the fleet list only if the id is somehow absent.
        const published = (await res.json().catch(() => null)) as
          | { id?: string }
          | null;
        router.push(
          published?.id
            ? `/practices/${published.id}?published=1`
            : "/practices?published=1",
        );
        return;
      }

      if (res.status === 409) {
        const body = (await res.json().catch(() => null)) as
          | { missing?: string[] }
          | null;
        const missing = Array.isArray(body?.missing) ? body!.missing! : [];
        setServerMissing(missing);
        setError(
          "Some required fields are still missing. Resolve them below and try again.",
        );
        return;
      }

      // Any other non-2xx is unexpected — surface a generic error.
      const body = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(body?.error ?? `Publish failed (${res.status}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card tone="ambient" className="p-5">
        <h3 className="font-display text-lg font-medium text-text tracking-tight">
          Ready to publish
        </h3>
        <p className="text-sm text-text-muted mt-1.5 max-w-2xl">
          Publishing snapshots this draft as a versioned configuration, makes
          it active for the practice, and archives any prior published
          configuration. This action is reversible by publishing a new
          version.
        </p>
      </Card>

      <DraftSummaryPanel summary={summary} />

      {missingToShow.length > 0 && (
        <Card tone="outlined" className="p-5 border-[color:var(--danger)]/30">
          <div className="flex items-center gap-2 mb-3">
            <Badge tone="danger">Missing required fields</Badge>
          </div>
          <p className="text-sm text-text-muted mb-3">
            These fields are required before publishing. Use the links below
            to jump back to the step that owns each one.
          </p>
          <ul className="grid gap-2">
            {missingToShow.map((field) => {
              const meta = MISSING_FIELD_TO_STEP[field];
              return (
                <li
                  key={field}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-surface px-3 py-2 text-sm"
                >
                  <span className="text-text">
                    <span className="font-mono text-xs text-text-muted mr-2">
                      {field}
                    </span>
                    {meta?.label ?? field}
                  </span>
                  {meta && <DeepLinkToStep stepId={meta.stepId} />}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={goBack} disabled={submitting}>
          Back
        </Button>
        <Button
          size="lg"
          onClick={handlePublish}
          disabled={buttonDisabled}
        >
          {submitting ? "Publishing…" : "Publish configuration"}
        </Button>
      </div>
    </div>
  );
}

/**
 * "Jump to step" link. Today this re-renders the wizard at the same URL —
 * the wizard shell owns navigation in-memory, so we surface a Back button
 * instead of a real anchor. EMR-419's shell is responsible for picking
 * the deepest unfinished step on remount, so a hard reload achieves the
 * same effect when needed.
 */
function DeepLinkToStep({ stepId: _stepId }: { stepId: WizardStepId }) {
  // The wizard shell holds step state in React; we don't have a direct
  // `goToStep` from the publish step body. Surface a "Back" affordance —
  // users can also click the rail item directly to jump.
  return (
    <button
      type="button"
      onClick={() => {
        // Hard reload: the shell's `pickInitialIndex` resumes on the
        // earliest reachable-but-incomplete step, which is exactly the one
        // referenced by `_stepId` (since publish is reachable only when
        // the chain is otherwise complete).
        if (typeof window !== "undefined") window.location.reload();
      }}
      className="text-xs text-accent hover:text-accent-hover underline underline-offset-2"
    >
      Jump back
    </button>
  );
}

export const step15PublishDefinition: WizardStepDefinition = {
  id: "publish",
  title: "Publish",
  description:
    "Publish this configuration and make it active for the practice.",
  Component: Step15Publish,
  // The user shouldn't be able to "skip" publish — the only way out is to
  // succeed. Returning false means the rail never marks this step complete
  // until the post-publish redirect carries the user away.
  isComplete: () => false,
  isReachable: (_draft, completedSteps) =>
    completedSteps.has("preview-practice-admin"),
};
