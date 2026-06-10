// Strongly-typed domain events. Dispatching an event is how the rest of the
// codebase talks to the orchestration layer — nothing else.

export type DomainEvent =
  | { name: "patient.created"; patientId: string; organizationId: string }
  | { name: "patient.intake.updated"; patientId: string; organizationId: string }
  | { name: "patient.intake.submitted"; patientId: string; organizationId: string }
  | { name: "patient.intake.stalled"; patientId: string; organizationId: string; intent: string }
  | { name: "patient.diagnosis.updated"; patientId: string; organizationId: string }
  | { name: "document.uploaded"; documentId: string; patientId: string; organizationId: string }
  | { name: "document.classified"; documentId: string }
  | { name: "assessment.assigned"; patientId: string; assessmentSlug: string }
  | { name: "assessment.submitted"; responseId: string; patientId: string }
  | { name: "encounter.scheduled"; encounterId: string; patientId: string }
  | { name: "encounter.started"; encounterId: string }
  | { name: "encounter.completed"; encounterId: string; patientId: string; completedAt: Date }
  | { name: "encounter.note.draft.requested"; encounterId: string; requestedBy: string }
  | { name: "note.finalized"; noteId: string; encounterId: string; finalizedBy: string }
  | { name: "message.draft.requested"; patientId: string; intent: string; organizationId: string }
  | { name: "message.sent"; messageId: string; threadId: string }
  | { name: "message.received"; messageId: string; threadId: string; patientId: string; organizationId: string }
  // EMR-1115 (PJ-3) — appointment lifecycle comms. `source` records which side
  // of the relationship initiated the change so downstream copy can differ.
  | {
      name: "appointment.created";
      appointmentId: string;
      patientId: string;
      organizationId: string;
      startAt: Date;
      modality: string;
      source: "patient" | "staff";
    }
  // The extra fields are optional for backward compatibility: the clinic-side
  // cancel (clinic/schedule/calendar/actions.ts) emits only `appointmentId`;
  // the consumer agent re-derives patient/org/reason from the DB + AuditLog.
  | {
      name: "appointment.cancelled";
      appointmentId: string;
      patientId?: string;
      organizationId?: string;
      reason?: string | null;
      source?: "patient" | "staff";
    }
  | { name: "dosing.regimen.created"; regimenId: string; patientId: string; productId: string; organizationId: string; prescribedById: string }
  | { name: "adherence.checkup.requested"; patientId: string; organizationId: string }
  | { name: "research.query.submitted"; queryId: string; query: string; patientId?: string }
  | { name: "practice.onboarding.started"; organizationId: string }
  // Billing events — Phase 3 (existing)
  | { name: "claim.created"; claimId: string; organizationId: string; patientId: string }
  | { name: "claim.submitted"; claimId: string; organizationId: string }
  | { name: "claim.denied"; claimId: string; organizationId: string; patientId: string }
  | { name: "claim.paid"; claimId: string; organizationId: string; patientId: string }
  | { name: "payment.received"; paymentId: string; claimId: string; organizationId: string }
  | { name: "statement.generated"; statementId: string; patientId: string; organizationId: string }
  | { name: "billing.aging.sweep"; organizationId: string }
  | { name: "billing.reconciliation.run"; organizationId: string }
  | { name: "billing.underpayment.scan"; organizationId: string }
  | { name: "billing.credit.scan"; organizationId: string }
  | { name: "billing.command.brief"; organizationId: string }
  | { name: "cfo.report.generate"; organizationId: string; period?: "weekly" | "monthly" | "quarterly" | "annual" | "daily"; anchorISO?: string }
  | { name: "cfo.expense.recorded"; expenseId: string; organizationId: string }
  | { name: "cfo.cash.recorded"; cashFlowEntryId: string; organizationId: string }
  // RCM Fleet events — Layer 4 (new)
  | { name: "encounter.documentation.updated"; encounterId: string; noteId: string; patientId: string }
  | { name: "charge.created"; chargeId: string; encounterId: string; patientId: string; organizationId: string }
  | { name: "eligibility.checked"; patientId: string; coverageId: string; snapshotId: string; eligible: boolean; networkStatus: string; priorAuthRequired: boolean }
  | { name: "eligibility.failed"; patientId: string; coverageId: string; reason: string; organizationId: string }
  | { name: "prior_auth.required"; patientId: string; coverageId: string; cptCode: string; organizationId: string }
  | { name: "prior_auth.obtained"; patientId: string; authNumber: string; organizationId: string }
  | { name: "coding.recommended"; encounterId: string; patientId: string; overallConfidence: number; requiresReview: boolean; organizationId: string }
  | { name: "coding.review_needed"; encounterId: string; patientId: string; reason: string; organizationId: string }
  // EMR-1097: emitted when the physician approves (or edits-then-approves) the
  // coding suggestions on a finalized note. Carries the approved codes so
  // downstream billing agents reconcile against the physician's decision.
  | { name: "coding.approved"; noteId: string; encounterId: string; patientId: string; organizationId: string; approvedBy: string; approvedIcd10: string[]; approvedEmLevel: string | null }
  | { name: "claim.scrubbed"; claimId: string; organizationId: string; status: "clean" | "warnings" | "blocked"; scrubResultId: string }
  | { name: "claim.blocked"; claimId: string; organizationId: string; violations: string[] }
  | { name: "clearinghouse.queued"; claimId: string; submissionId: string; organizationId: string; isSecondary: boolean }
  | { name: "clearinghouse.accepted"; claimId: string; submissionId: string; organizationId: string }
  | { name: "clearinghouse.rejected"; claimId: string; submissionId: string; rejectionCode: string; rejectionMessage: string; retryEligible: boolean; organizationId: string }
  | { name: "adjudication.received"; claimId: string; organizationId: string; adjudicationResultId: string; claimStatus: "paid" | "denied" | "partial"; totalPaidCents: number; totalDeniedCents: number }
  | { name: "denial.detected"; claimId: string; denialEventId: string; carcCode: string; groupCode: string; amountDeniedCents: number; organizationId: string }
  | { name: "denial.classified"; claimId: string; denialEventId: string; resolution: string; organizationId: string }
  | { name: "appeal.generated"; claimId: string; appealPacketId: string; organizationId: string }
  | { name: "appeal.submitted"; claimId: string; appealPacketId: string; organizationId: string }
  | { name: "appeal.outcome.received"; claimId: string; appealPacketId: string; outcome: "overturned" | "upheld"; organizationId: string }
  | { name: "payment.posted"; claimId: string; paymentId: string; amountCents: number; source: "payer" | "patient"; organizationId: string; remainingBalanceCents: number }
  | { name: "underpayment.detected"; claimId: string; expectedCents: number; actualCents: number; varianceCents: number; organizationId: string }
  | { name: "patient.balance.created"; patientId: string; claimId: string; amountCents: number; source: string; organizationId: string }
  | { name: "patient.statement.issued"; patientId: string; statementId: string; organizationId: string }
  | { name: "patient.payment.received"; patientId: string; amountCents: number; organizationId: string }
  | { name: "account.collections.escalated"; patientId: string; amountCents: number; organizationId: string }
  | { name: "claim.financial.closed"; claimId: string; closureType: string; totalCollectedCents: number; daysCycleTime: number; humanTouches: number; organizationId: string }
  | { name: "human.review.required"; sourceAgent: string; category: string; claimId?: string; patientId?: string; summary: string; suggestedAction: string; tier: number; organizationId: string }
  | { name: "compliance.flag.raised"; claimId: string; flagType: string; severity: "warning" | "block"; detail: string; organizationId: string }
  | { name: "write_off.requested"; claimId: string; amountCents: number; reason: string; requestedBy: string; organizationId: string };

export type EventName = DomainEvent["name"];
export type EventOf<N extends EventName> = Extract<DomainEvent, { name: N }>;
