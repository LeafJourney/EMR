import type { TaskKind } from "@prisma/client";

// Human labels for the worklist's task-type facet (EMR-1079). Mirrors the
// Back-Office Operations Audit's task categories.
export const KIND_LABELS: Record<TaskKind, string> = {
  verify_benefits: "Verify benefits",
  obtain_auth: "Obtain auth",
  refill: "Refill",
  recall: "Recall / outreach",
  message_reply: "Message reply",
  records_request: "Records request",
  billing_followup: "Billing follow-up",
  clinical_review: "Clinical review",
  patient_task: "Patient task",
  other: "Other",
};
