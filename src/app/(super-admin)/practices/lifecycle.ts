// Practice lifecycle — a DERIVED view over existing data, not a new stored
// enum. PracticeConfiguration.status stays the load-bearing 3-state machine
// (draft | published | archived); this maps the real signals (status, selected
// specialty, role coverage, KPIs, freshness) onto the richer operational stage
// the super-admin actually reasons about. No schema migration.
//
// Pure module (no server-only imports) so both the server detail page and the
// list cards can compute the same stage.

import type { PracticeCardData } from "./types";

export type PracticeLifecycleStage =
  | "draft"
  | "onboarding"
  | "needs_review"
  | "ready_for_invites"
  | "ready_for_activation"
  | "active"
  | "archived";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "highlight";

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  /** Gentle, guiding hint shown when not done. Never developer-ish. */
  hint?: string;
}

export interface NextAction {
  label: string;
  /** Only set when it routes to a confirmed-existing surface (no dead links). */
  href?: string;
  primary?: boolean;
}

export interface PracticeLifecycle {
  stage: PracticeLifecycleStage;
  label: string;
  tone: BadgeTone;
  /** 0–100, derived from required-checklist completion. */
  readinessScore: number;
  checklist: ChecklistItem[];
  /** Human-friendly review signals — guidance, not shame. */
  reviewFlags: string[];
  nextActions: NextAction[];
}

const STAGE_META: Record<PracticeLifecycleStage, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  onboarding: { label: "In onboarding", tone: "info" },
  needs_review: { label: "Needs review", tone: "warning" },
  ready_for_invites: { label: "Ready for invites", tone: "accent" },
  ready_for_activation: { label: "Ready for activation", tone: "highlight" },
  active: { label: "Active", tone: "success" },
  archived: { label: "Archived", tone: "neutral" },
};

const STALE_DAYS = 14;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/**
 * Derive the operational lifecycle for a practice from already-loaded data.
 * `npi` and `launch` (PracticeLaunchStatus) are optional enrichments — when
 * absent, readiness is computed from the required-checklist completion.
 */
export function derivePracticeLifecycle(
  practice: PracticeCardData,
  opts?: {
    npi?: string | null;
    launch?: { readinessScore?: number; blockers?: string[] } | null;
  },
): PracticeLifecycle {
  const owner = practice.officeManagers.find((m) => m.role === "practice_owner");
  const admin = practice.officeManagers.find((m) => m.role === "practice_admin");
  const hasProviders =
    practice.leadProviders.length > 0 || practice.kpi.providerCount > 0;
  const hasSpecialty = !!practice.specialty;
  const hasAddress = !!(practice.city || practice.state);
  const hasContact = !!(practice.primaryContactName || practice.primaryContactEmail);
  const npi = opts?.npi ?? null;

  // Required-for-activation checklist (drives readiness score).
  const checklist: ChecklistItem[] = [
    { key: "profile", label: "Practice profile", done: !!practice.practiceName },
    {
      key: "npi",
      label: "NPI entered",
      done: !!npi,
      hint: "Add the practice NPI so claims and credentialing can resolve.",
    },
    {
      key: "address",
      label: "Address added",
      done: hasAddress,
      hint: "Add the practice location.",
    },
    {
      key: "specialty",
      label: "Specialty selected",
      done: hasSpecialty,
      hint: "Pick the clinical specialty to apply the right templates.",
    },
    {
      key: "owner",
      label: "Owner assigned",
      done: !!owner,
      hint: "This practice has no primary owner yet.",
    },
    {
      key: "admin",
      label: "Admin assigned",
      done: !!admin,
      hint: "Invite a practice admin to manage day-to-day setup.",
    },
    {
      key: "providers",
      label: "Provider roster started",
      done: hasProviders,
      hint: "No providers have been added yet.",
    },
    {
      key: "published",
      label: "Configuration published",
      done: practice.status === "published",
      hint: "Publish the configuration from the onboarding wizard to take it live.",
    },
  ];

  const doneCount = checklist.filter((c) => c.done).length;
  const derivedScore = Math.round((doneCount / checklist.length) * 100);
  const readinessScore =
    typeof opts?.launch?.readinessScore === "number"
      ? opts.launch.readinessScore
      : derivedScore;

  // Review flags — gentle, guiding language.
  const reviewFlags: string[] = [];
  if (!owner) reviewFlags.push("This practice is missing a primary owner.");
  if (!hasSpecialty) reviewFlags.push("No specialty has been selected yet.");
  if (!hasProviders) reviewFlags.push("No providers have been added yet.");
  if (!npi) reviewFlags.push("This practice has no NPI on file.");
  if (!hasContact)
    reviewFlags.push("Primary contact information is incomplete.");
  const idleDays = daysSince(practice.updatedAt);
  if (practice.status === "draft" && idleDays != null && idleDays >= STALE_DAYS) {
    reviewFlags.push(
      `This setup was started ${idleDays} days ago and hasn't changed since.`,
    );
  }
  for (const b of opts?.launch?.blockers ?? []) reviewFlags.push(b);

  // Stage derivation.
  let stage: PracticeLifecycleStage;
  if (practice.status === "archived") {
    stage = "archived";
  } else if (practice.status === "published") {
    stage = "active";
  } else {
    // draft lineage
    const coreComplete = !!practice.practiceName && hasAddress && hasSpecialty;
    const hasSeriousGap = !owner || !hasSpecialty;
    if (hasSeriousGap && (hasAddress || hasSpecialty || owner)) {
      // Enough started that the gaps are worth surfacing for correction.
      stage = "needs_review";
    } else if (!coreComplete) {
      stage = idleDays != null && idleDays >= 1 ? "onboarding" : "draft";
    } else if (!owner || !admin || !hasProviders) {
      stage = "ready_for_invites";
    } else {
      stage = "ready_for_activation";
    }
  }

  // State-aware next actions (hrefs only to confirmed-existing surfaces).
  const resumeHref = practice.configId
    ? `/onboarding/wizard/${practice.configId}`
    : undefined;
  const nextActions: NextAction[] = [];
  switch (stage) {
    case "draft":
    case "onboarding":
      nextActions.push({ label: "Resume onboarding", href: resumeHref, primary: true });
      break;
    case "needs_review":
      nextActions.push({ label: "Review & fix in onboarding", href: resumeHref, primary: true });
      break;
    case "ready_for_invites":
      nextActions.push({ label: "Invite your team", primary: true });
      nextActions.push({ label: "View providers", href: "?tab=providers" });
      break;
    case "ready_for_activation":
      nextActions.push({ label: "Finish & publish in onboarding", href: resumeHref, primary: true });
      break;
    case "active":
      nextActions.push({ label: "View activity", href: "?tab=activity", primary: true });
      nextActions.push({ label: "View providers", href: "?tab=providers" });
      break;
    case "archived":
      break;
  }

  return {
    stage,
    label: STAGE_META[stage].label,
    tone: STAGE_META[stage].tone,
    readinessScore,
    checklist,
    reviewFlags,
    nextActions,
  };
}
