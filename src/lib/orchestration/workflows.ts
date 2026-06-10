import type { DomainEvent, EventName } from "./events";

export interface WorkflowStep {
  agent: string;
  input: (event: DomainEvent) => Record<string, unknown>;
  requiresApproval?: boolean;
}

export interface WorkflowDefinition {
  name: string;
  on: EventName[];
  steps: WorkflowStep[];
}

/**
 * The event → agent job routing table. Adding a workflow is a matter of
 * appending an object here. The dispatcher reads this table at runtime.
 */
export const workflows: WorkflowDefinition[] = [
  {
    name: "intake-completion",
    on: ["patient.intake.updated", "patient.intake.submitted", "patient.created"],
    steps: [
      {
        agent: "intake",
        input: (e) => ({ patientId: (e as any).patientId }),
      },
    ],
  },
  {
    name: "document-classify",
    on: ["document.uploaded"],
    steps: [
      {
        agent: "documentOrganizer",
        input: (e) => ({ documentId: (e as any).documentId }),
      },
    ],
  },
  {
    name: "visit-followup",
    on: ["encounter.completed"],
    steps: [
      {
        agent: "outcomeTracker",
        input: (e) => ({
          patientId: (e as any).patientId,
          lastCheckInAt: (e as any).completedAt,
        }),
      },
    ],
  },
  {
    name: "scribe-draft",
    on: ["encounter.note.draft.requested"],
    steps: [
      {
        agent: "scribe",
        input: (e) => ({ encounterId: (e as any).encounterId }),
        requiresApproval: true,
      },
    ],
  },
  {
    name: "coding-readiness",
    on: ["note.finalized"],
    steps: [
      {
        agent: "codingReadiness",
        input: (e) => ({ noteId: (e as any).noteId }),
      },
    ],
  },
  {
    name: "research-synth",
    on: ["research.query.submitted"],
    steps: [
      {
        agent: "researchSynthesizer",
        input: (e) => ({
          queryId: (e as any).queryId,
          query: (e as any).query,
          patientId: (e as any).patientId,
        }),
      },
    ],
  },
  {
    name: "message-draft",
    // EMR-1114 (PJ-2/PJ-M5) — patient.intake.stalled now routes to the same
    // approval-gated draft flow (WORKFLOWS.md always documented this pairing).
    // The scheduler emits it with intent "intake_nudge"; default it here too
    // so a bare event still drafts the right nudge.
    on: ["message.draft.requested", "patient.intake.stalled"],
    steps: [
      {
        agent: "messagingAssistant",
        input: (e) => ({
          patientId: (e as any).patientId,
          intent:
            (e as any).intent ??
            (e.name === "patient.intake.stalled" ? "intake_nudge" : "follow_up"),
        }),
        requiresApproval: true,
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────
  // EMR-1115 (PJ-3) — appointment lifecycle comms. Booking/cancelling
  // (either side) writes a portal Notification + a patient-visible
  // confirmation/cancellation Message. Auto-runs (no approval): the copy
  // is deterministic template text, not LLM output.
  // ─────────────────────────────────────────────────────────────────
  {
    name: "appointment-lifecycle",
    on: ["appointment.created", "appointment.cancelled"],
    steps: [
      {
        agent: "appointmentLifecycle",
        input: (e) => ({
          appointmentId: (e as any).appointmentId,
          type: e.name === "appointment.created" ? "created" : "cancelled",
          reason: (e as any).reason ?? null,
          source: (e as any).source ?? null,
        }),
        requiresApproval: false,
      },
    ],
  },
  // Correspondence Nurse — triages every inbound patient message and
  // drafts a clinically appropriate response. Approval-gated.
  {
    name: "correspondence-triage",
    on: ["message.received"],
    steps: [
      {
        agent: "correspondenceNurse",
        input: (e) => ({ threadId: (e as any).threadId }),
        requiresApproval: true,
      },
    ],
  },
  {
    name: "practice-launch",
    on: ["practice.onboarding.started"],
    steps: [
      {
        agent: "practiceLaunch",
        input: (e) => ({ organizationId: (e as any).organizationId }),
      },
    ],
  },
  {
    name: "registry-refresh",
    on: ["patient.diagnosis.updated"],
    steps: [
      {
        agent: "registry",
        input: (e) => ({ patientId: (e as any).patientId }),
      },
    ],
  },
  {
    name: "physician-nudge",
    on: ["note.finalized"],
    steps: [
      {
        agent: "physicianNudge",
        input: (e) => ({
          noteId: (e as any).noteId,
          encounterId: (e as any).encounterId,
        }),
      },
    ],
  },
  {
    name: "patient-outreach",
    on: ["encounter.completed"],
    steps: [
      {
        agent: "patientOutreach",
        input: (e) => ({
          patientId: (e as any).patientId,
          encounterId: (e as any).encounterId,
        }),
        requiresApproval: true,
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────
  // Billing workflows — Phase 3 of the Revenue Cycle PRD
  // ─────────────────────────────────────────────────────────────────
  {
    name: "claim-scrub",
    on: ["claim.created"],
    steps: [
      {
        agent: "chargeIntegrity",
        input: (e) => ({ claimId: (e as any).claimId }),
      },
    ],
  },
  {
    name: "denial-triage",
    on: ["claim.denied"],
    steps: [
      {
        agent: "denialTriage",
        input: (e) => ({ claimId: (e as any).claimId }),
      },
    ],
  },
  {
    name: "statement-explanation",
    on: ["statement.generated"],
    steps: [
      {
        agent: "patientExplanation",
        input: (e) => ({ statementId: (e as any).statementId }),
      },
    ],
  },
  {
    name: "aging-sweep",
    on: ["billing.aging.sweep"],
    steps: [
      {
        agent: "aging",
        input: (e) => ({ organizationId: (e as any).organizationId }),
      },
    ],
  },
  {
    name: "reconciliation-run",
    on: ["billing.reconciliation.run", "payment.received"],
    steps: [
      {
        agent: "reconciliation",
        input: (e) => ({ organizationId: (e as any).organizationId }),
      },
    ],
  },
  {
    name: "underpayment-scan",
    on: ["billing.underpayment.scan", "claim.paid"],
    steps: [
      {
        agent: "underpaymentDetection",
        input: (e) => ({ organizationId: (e as any).organizationId }),
      },
    ],
  },
  {
    name: "credit-scan",
    on: ["billing.credit.scan", "payment.received"],
    steps: [
      {
        agent: "refundCredit",
        input: (e) => ({ organizationId: (e as any).organizationId }),
      },
    ],
  },
  {
    name: "revenue-command-brief",
    on: ["billing.command.brief"],
    steps: [
      {
        agent: "revenueCommand",
        input: (e) => ({ organizationId: (e as any).organizationId }),
      },
    ],
  },
  {
    name: "cfo-report",
    on: ["cfo.report.generate", "cfo.expense.recorded", "cfo.cash.recorded"],
    steps: [
      {
        agent: "cfo",
        input: (e) => ({
          organizationId: (e as any).organizationId,
          period: (e as any).period ?? "weekly",
          anchorISO: (e as any).anchorISO,
        }),
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────
  // RCM Fleet — Phase 5 pre-submission pipeline (Layer 8, Flow 1)
  // ─────────────────────────────────────────────────────────────────
  // prior_auth.required → Prior Auth Verification
  {
    name: "prior-auth-check",
    on: ["prior_auth.required"],
    steps: [
      {
        agent: "priorAuthVerification",
        input: (e) => ({
          patientId: (e as any).patientId,
          coverageId: (e as any).coverageId,
          cptCode: (e as any).cptCode,
          organizationId: (e as any).organizationId,
        }),
      },
    ],
  },
  // claim.scrubbed → Clearinghouse Submission (when clean)
  {
    name: "clearinghouse-submission",
    on: ["claim.scrubbed"],
    steps: [
      {
        agent: "clearinghouseSubmission",
        input: (e) => ({
          claimId: (e as any).claimId,
          organizationId: (e as any).organizationId,
          scrubResultId: (e as any).scrubResultId,
        }),
      },
    ],
  },
  {
    name: "clearinghouse-queued-submission",
    on: ["clearinghouse.queued"],
    steps: [
      {
        agent: "clearinghouseSubmission",
        input: (e) => ({
          claimId: (e as any).claimId,
          organizationId: (e as any).organizationId,
          submissionId: (e as any).submissionId,
        }),
      },
    ],
  },
  // encounter.completed → Eligibility & Benefits → eligibility.checked
  {
    name: "eligibility-check",
    on: ["encounter.completed"],
    steps: [
      {
        agent: "eligibilityBenefits",
        input: (e) => ({
          encounterId: (e as any).encounterId,
          patientId: (e as any).patientId,
        }),
      },
    ],
  },
  // claim.created → Compliance & Audit (runs alongside scrubbing)
  {
    name: "compliance-audit",
    on: ["claim.created"],
    steps: [
      {
        agent: "complianceAudit",
        input: (e) => ({
          claimId: (e as any).claimId,
          organizationId: (e as any).organizationId,
        }),
      },
    ],
  },
  // coding.approved → Encounter Intelligence → charge.created
  // EMR-1097 (B4): this used to fire on encounter.completed, which created
  // charges BEFORE the physician ever saw the coding suggestions. Charges are
  // billing artifacts of the physician's coding decision, so extraction now
  // waits for coding.approved and carries the approved codes so the agent can
  // reconcile its extraction against them.
  {
    name: "encounter-charge-extraction",
    on: ["coding.approved"],
    steps: [
      {
        agent: "encounterIntelligence",
        input: (e) => ({
          encounterId: (e as any).encounterId,
          patientId: (e as any).patientId,
          noteId: (e as any).noteId,
          approvedIcd10: (e as any).approvedIcd10,
          approvedEmLevel: (e as any).approvedEmLevel ?? null,
        }),
      },
    ],
  },
  // charge.created → Coding Optimization → coding.recommended
  {
    name: "coding-optimization",
    on: ["charge.created"],
    steps: [
      {
        agent: "codingOptimization",
        input: (e) => ({
          chargeId: (e as any).chargeId,
          encounterId: (e as any).encounterId,
          patientId: (e as any).patientId,
          organizationId: (e as any).organizationId,
        }),
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────
  // RCM Fleet — Phase 7 post-adjudication loop (Layer 8, Flows 3-4)
  // ─────────────────────────────────────────────────────────────────
  // denial.detected → Denial Resolution v2 (CARC-based decision tree)
  {
    name: "denial-resolution",
    on: ["denial.detected"],
    steps: [
      {
        agent: "denialResolution",
        input: (e) => ({
          claimId: (e as any).claimId,
          denialEventId: (e as any).denialEventId,
          carcCode: (e as any).carcCode,
          groupCode: (e as any).groupCode,
          amountDeniedCents: (e as any).amountDeniedCents,
          organizationId: (e as any).organizationId,
        }),
      },
    ],
  },
  // adjudication.received → Adjudication Interpretation → payment/denial routing
  {
    name: "adjudication-interpretation",
    on: ["adjudication.received"],
    steps: [
      {
        agent: "adjudicationInterpretation",
        input: (e) => ({
          claimId: (e as any).claimId,
          adjudicationResultId: (e as any).adjudicationResultId,
          organizationId: (e as any).organizationId,
        }),
      },
    ],
  },
  // denial.classified (resolution=appeal) → Appeals Generation
  {
    name: "appeals-generation",
    on: ["denial.classified"],
    steps: [
      {
        agent: "appealsGeneration",
        input: (e) => ({
          claimId: (e as any).claimId,
          denialEventId: (e as any).denialEventId,
          organizationId: (e as any).organizationId,
        }),
      },
    ],
  },
  // coding.recommended → Claim Construction → claim.created
  // (Claim Construction also listens for coding.approved for human-reviewed cases)
  {
    name: "claim-construction",
    on: ["coding.recommended", "coding.approved"],
    steps: [
      {
        agent: "claimConstruction",
        input: (e) => ({
          encounterId: (e as any).encounterId,
          patientId: (e as any).patientId,
          organizationId: (e as any).organizationId,
        }),
      },
    ],
  },
  {
    name: "prescription-safety-check",
    on: ["dosing.regimen.created"],
    steps: [
      {
        agent: "prescriptionSafety",
        input: (e) => ({
          regimenId: (e as any).regimenId,
          patientId: (e as any).patientId,
        }),
      },
    ],
  },
  {
    name: "diagnosis-safety-check",
    on: ["patient.diagnosis.updated"],
    steps: [
      {
        agent: "diagnosisSafety",
        input: (e) => ({ patientId: (e as any).patientId }),
      },
    ],
  },
  {
    name: "adherence-drift-check",
    on: ["adherence.checkup.requested"],
    steps: [
      {
        agent: "adherenceDriftDetector",
        input: (e) => ({
          patientId: (e as any).patientId,
        }),
      },
    ],
  },
  {
    name: "message-urgency-observe",
    on: ["message.received"],
    steps: [
      {
        agent: "messageUrgencyObserver",
        input: (e) => ({
          messageId: (e as any).messageId,
          threadId: (e as any).threadId,
          patientId: (e as any).patientId,
        }),
      },
    ],
  },
  {
    name: "visit-discovery-whisper",
    on: ["note.finalized"],
    steps: [
      {
        agent: "visitDiscoveryWhisperer",
        input: (e) => ({
          noteId: (e as any).noteId,
          encounterId: (e as any).encounterId,
        }),
      },
    ],
  },
];

/** Find every workflow step that should fire for a given event. */
export function matchWorkflows(event: DomainEvent): Array<{ workflow: WorkflowDefinition; step: WorkflowStep }> {
  const matches: Array<{ workflow: WorkflowDefinition; step: WorkflowStep }> = [];
  for (const wf of workflows) {
    if (!wf.on.includes(event.name)) continue;
    for (const step of wf.steps) matches.push({ workflow: wf, step });
  }
  return matches;
}
