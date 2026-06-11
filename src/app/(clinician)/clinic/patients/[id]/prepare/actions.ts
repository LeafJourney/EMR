"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { dispatch } from "@/lib/orchestration/dispatch";
import {
  ForbiddenError,
  assertChartAccess,
  hasPermission,
} from "@/lib/rbac/permissions";
import {
  advanceVisitState,
  assignVisitProvider,
  resolveProviderForUser,
  selectActiveVisitEncounter,
} from "@/lib/domain/visit-state";
import { preVisitIntelligenceAgent } from "@/lib/agents/pre-visit-intelligence-agent";
import { resolveModelClient } from "@/lib/orchestration/model-client";
import { buildToolRegistry } from "@/lib/orchestration/tool-registry";
import type { AllowedAction, AgentLogEntry, StepResult } from "@/lib/orchestration/types";

export interface BriefingStep {
  step: number;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
  durationMs?: number;
}

export interface BriefingResult {
  ok: boolean;
  error?: string;
  briefing?: {
    patientSummary: string;
    lastVisitSummary: string | null;
    talkingPoints: string[];
    sections: Array<{
      title: string;
      content: string;
      priority: "high" | "medium" | "low";
      icon: string;
    }>;
    riskFlags: string[];
    confidence: number;
  };
  steps: BriefingStep[];
  totalDurationMs: number;
}

const STEP_LABELS = [
  "Loading patient profile and chart summary",
  "Reviewing recent encounters and notes",
  "Analyzing outcome trends (last 30 days)",
  "Checking medications and dosing adherence",
  "Scanning recent messages and assessments",
  "Cindy is at work!",
];

export async function generateBriefing(patientId: string): Promise<BriefingResult> {
  const user = await requireUser();
  const startTime = Date.now();

  // Verify access
  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });

  if (!patient) {
    return {
      ok: false,
      error: "Patient not found",
      steps: [],
      totalDurationMs: Date.now() - startTime,
    };
  }

  // Find the encounter that should receive this briefing (if any). We prefer
  // an in-progress encounter (clinician is already in the room) and fall back
  // to today's scheduled encounter. When neither exists, the briefing still
  // runs but won't be persisted — the user can click "Start Visit" and
  // `startVisitWithBriefing` will create the encounter with the briefing
  // attached. Passing encounterId here lets the Schedule tile's brief line
  // and any other downstream surface read the briefing the moment it's
  // generated, without waiting for the physician to start the visit.
  // Attach the briefing to the SAME encounter startVisitWithBriefing will
  // later reuse — via the shared visit-state selector — so briefing data and
  // the started visit never land on different rows (incl. same-day walk-ins,
  // which the old in_progress-OR-scheduled query missed).
  const encounterForBriefing = await selectActiveVisitEncounter(
    patientId,
    user.organizationId!,
  );

  // Build a mock context that captures logs as steps
  const logs: AgentLogEntry[] = [];
  const steps: BriefingStep[] = STEP_LABELS.map((label, i) => ({
    step: i + 1,
    label,
    status: "pending" as const,
  }));

  let currentStep = 0;

  const ctx = {
    jobId: `briefing-${Date.now()}`,
    organizationId: user.organizationId,
    log(level: AgentLogEntry["level"], message: string, data?: Record<string, unknown>) {
      logs.push({ at: new Date().toISOString(), level, message, data });

      // Match log messages to steps
      const stepMatch = message.match(/Step (\d)\/6/);
      if (stepMatch) {
        const stepNum = parseInt(stepMatch[1]);
        // Mark previous step done
        if (currentStep > 0 && steps[currentStep - 1]) {
          steps[currentStep - 1].status = "done";
          steps[currentStep - 1].durationMs = Date.now() - startTime;
        }
        currentStep = stepNum;
        if (steps[stepNum - 1]) {
          steps[stepNum - 1].status = "running";
        }
      }
    },
    async emit() {},
    assertCan(_action: AllowedAction) {},
    model: resolveModelClient(),
    tools: buildToolRegistry({
      agentName: "preVisitIntelligence",
      agentVersion: "1.0.0",
      organizationId: user.organizationId,
      allowed: new Set(["read.patient", "read.encounter", "read.note"] as AllowedAction[]),
      stepFn() {},
      sourceFn() {},
    }),
    stepResults: new Map<string, StepResult>(),
  };

  try {
    const result = await preVisitIntelligenceAgent.run(
      { patientId, encounterId: encounterForBriefing?.id },
      ctx,
    );

    // Mark all remaining steps done
    for (const step of steps) {
      if (step.status !== "done") step.status = "done";
      if (!step.durationMs) step.durationMs = Date.now() - startTime;
    }

    return {
      ok: true,
      briefing: result,
      steps,
      totalDurationMs: Date.now() - startTime,
    };
  } catch (err) {
    // Mark current step as error
    if (currentStep > 0 && steps[currentStep - 1]) {
      steps[currentStep - 1].status = "error";
      steps[currentStep - 1].detail =
        err instanceof Error ? err.message : "Unknown error";
    }

    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
      steps,
      totalDurationMs: Date.now() - startTime,
    };
  }
}

/**
 * Start a visit with briefing context pre-loaded.
 *
 * This creates/finds the encounter, stores the briefing data on it,
 * dispatches the scribe event, and redirects to notes. The scribe agent
 * picks up the briefingContext from the encounter and uses it to
 * pre-seed the note with talking points, risk flags, and assessment.
 */
export async function startVisitWithBriefing(
  patientId: string,
  briefing: BriefingResult["briefing"],
) {
  const user = await requireUser();

  // EMR-786 parity with startVisit — starting a (briefed) visit requires
  // write access to clinical notes. Front/back-office staff are denied.
  if (!hasPermission(user, "notes.edit")) {
    redirect(`/clinic/patients/${patientId}?tab=notes&error=unauthorized`);
  }

  // Chart-privacy gate — a doctor-only chart the user is not allowlisted for
  // must reject start-visit even with global notes.edit.
  try {
    await assertChartAccess(user, patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      redirect(`/clinic/patients/${patientId}?tab=notes&error=restricted`);
    }
    throw err;
  }

  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });
  if (!patient) {
    redirect(`/clinic/patients/${patientId}?tab=notes&error=not_found`);
  }

  // Reuse today's active encounter before minting a new one —
  // same selection as startVisit, via the shared visit-state spine.
  const currentProvider = await resolveProviderForUser(user.id, user.organizationId!);

  let encounter = await selectActiveVisitEncounter(patientId, user.organizationId!);

  if (!encounter) {
    encounter = await prisma.encounter.create({
      data: {
        organizationId: user.organizationId!,
        patientId,
        status: "in_progress",
        modality: "in_person",
        reason: "Visit",
        startedAt: new Date(),
        scheduledFor: new Date(),
        providerId: currentProvider?.id ?? undefined,
        // Store the briefing context so the scribe can use it
        briefingContext: briefing ? (briefing as any) : undefined,
      },
    });
  } else {
    // Capture the existing context BEFORE advancing — rooming/demeanor/intake
    // keys written by the front desk and saveEmotionalVital must survive.
    const existingCtx =
      encounter.briefingContext && typeof encounter.briefingContext === "object"
        ? (encounter.briefingContext as Record<string, unknown>)
        : {};

    // Advance the reused encounter into the visit (idempotent).
    encounter = (await advanceVisitState(encounter, "in_visit", user.id)).encounter;

    // Record the rendering provider without stealing scheduled ownership.
    encounter = await assignVisitProvider(encounter, currentProvider?.id ?? null);

    if (briefing) {
      // MERGE, never overwrite — the scribe reads patientSummary/talkingPoints/
      // riskFlags/sections; every other writer uses disjoint keys.
      await prisma.encounter.update({
        where: { id: encounter.id },
        data: { briefingContext: { ...existingCtx, ...briefing } as any },
      });
    }
  }

  // Dispatch the scribe event
  const jobs = await dispatch({
    name: "encounter.note.draft.requested",
    encounterId: encounter.id,
    requestedBy: user.id,
  });

  // Try to run the agent inline with a 15-second timeout
  let createdNoteId: string | null = null;
  try {
    if (jobs.length > 0) {
      const jobRows = await prisma.agentJob.findMany({ where: { id: { in: jobs } } });
      const { runJob } = await import("@/lib/orchestration/runner");

      await Promise.race([
        Promise.all(jobRows.map(job => runJob(job, "inline-briefed-visit"))),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 15000)
        ),
      ]);
    }

    // Find the note that was just created
    const latestNote = await prisma.note.findFirst({
      where: { encounterId: encounter.id },
      orderBy: { createdAt: "desc" },
    });
    createdNoteId = latestNote?.id ?? null;
  } catch {
    // Timeout is fine — job stays in the queue for the background worker
  }

  revalidatePath(`/clinic/patients/${patientId}`);

  // Redirect directly to the note if we have one, otherwise to the notes tab
  if (createdNoteId) {
    redirect(`/clinic/patients/${patientId}/notes/${createdNoteId}?from=briefing`);
  } else {
    redirect(`/clinic/patients/${patientId}?tab=notes`);
  }
}
