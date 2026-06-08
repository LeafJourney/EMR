import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  ForbiddenError,
  assertChartAccess,
  canViewSection,
  canEditSection,
} from "@/lib/rbac/permissions";
import { AccessDenied } from "@/components/rbac/access-denied";
import { PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/ui/sparkline";
import { MetricTile } from "@/components/ui/metric-tile";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow, LeafSprig } from "@/components/ui/ornament";
import { formatDate, formatRelative } from "@/lib/utils/format";
import { ChartTabs, type TabKey, type TabPeeks } from "./chart-tabs";
import { ChartFrame } from "./chart-frame";
import { loadPeekSummaries } from "./peek-summary";
import { TrackPatientView } from "@/components/shell/recent-patients";
import { TrackChartView } from "@/components/patient/track-chart-view";
import { dueScreenings } from "@/lib/domain/uspstf-screenings";
import { CorrespondenceTab, type SerializedThread } from "./correspondence-tab";
import { MemoryTab } from "./memory-tab";
// EMR-588 — Confidential clinician-only notes (private provider notes).
// Tab + server-action surface; storage is interim-backed by AuditLog
// rows until Legal sign-off on retention. See private-notes-actions.ts.
import { PrivateNotesTab } from "./private-notes-tab";
import { listPrivateNotes } from "./private-notes-actions";
import { ChartingTimer } from "./charting-timer";
import { startVisit, convertFollowUpToTask } from "./actions";
import { checkInteractions, getSeverityLabel, type DrugInteraction } from "@/lib/domain/drug-interactions";
import { InteractionBadge } from "@/components/ui/interaction-badge";
import { generateCDSAlerts } from "@/lib/domain/clinical-decision-support";
import { CDSPanel } from "./cds-panel";
import { TagManager } from "./tag-manager";
import { PatientAvatar } from "./patient-avatar";
import { HeaderContact } from "./header-contact";
import { AllergyManager, AllergyBadge } from "./allergy-manager";
import { MedicalHistoryManager } from "./medical-history-manager";
import { MedicationsManager } from "./medications-manager";
import { ClinicianUploadForm } from "./documents/clinician-upload-form";
import { DicomViewer } from "./dicom-viewer";
import { AgeBandBadge } from "@/components/clinical/age-band-badge";
import { PediatricModule } from "@/components/clinical/pediatric-module";
import {
  getAgeBand,
  isPediatric,
} from "@/lib/utils/patient-age";
import { CarePlanSection } from "@/components/patient/CarePlanSection";
import { ChartTaskList } from "@/components/patient/ChartTaskList";
import { PatientActivityTimeline } from "@/components/patient/PatientActivityTimeline";
import { loadPatientActivity } from "@/lib/domain/patient-activity";
import { UnresolvedFollowUpsPanel } from "@/components/patient/UnresolvedFollowUpsPanel";
import { buildUnresolvedFollowUps } from "@/lib/domain/unresolved-followups";
import { BirthdayCelebration } from "@/components/patient/birthday-celebration";
import { BirthdayBadge } from "@/components/patient/birthday-badge";
import { logger } from "@/lib/observability/log";
import { BirthdayBanner } from "./birthday-banner";
import { MessagePatientDock } from "@/app/(clinician)/clinic/messages/dock-compose";
import {
  formatDemographicValue,
  formatEmergencyContact,
  formatInsuranceMemberId,
  formatInsurancePlan,
} from "@/lib/patient/chart-demographics";
// UX inline editing — Notion / Linear-style click-to-edit on chart
// demographics + insurance. See src/components/ui/inline-edit.tsx.
import { InlineDemographicsCard } from "./inline-demographics-card";
import { RxTab } from "./rx-tab";
import { FloatingActionMenu } from "./floating-action-menu";
import { serializeRegimen, serializeDoseLog } from "./rx-serialize";
import { resolveModuleFlags, type ModuleFlags } from "@/lib/clinical/module-opt-in";
import { CurrentMedicationsCard } from "./current-medications-card";
import { ScreeningsPanel } from "./screenings-panel";
import { AlertsButton } from "./alerts-button";
import { CindySays } from "./chart-kit";
import { sexColorKey, SEX_BUBBLE_CLASSES } from "@/lib/clinical/chart-bubbles";
import { CINDY_PREFIX } from "@/lib/clinical/cindy-says";
import { RecordsTab, type ChartDoc } from "./records-tab";
import { ImagesTab } from "./images-tab";
import { LsvTab } from "./lsv-tab";
import { NotesTab } from "./notes-tab";
import { PrivateNotesButton } from "./private-notes-button";

function cleanMarkdownSummary(md: string): string {
  if (!md) return "";
  return md
    // Strip headers (e.g. # Header, ## Subheader)
    .replace(/^#+\s+/gm, "")
    // Strip bullets and lists (e.g. - list item, * list item, 1. list item)
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    // Strip bold/italic/strike markers (e.g. **bold**, *italic*, ~~strike~~)
    .replace(/(\*\*|\*|~~|_)/g, "")
    // Strip links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Normalize spaces/newlines
    .replace(/\s+/g, " ")
    .trim();
}
/** Flatten a Prisma document row into the plain ChartDoc the Records /
 *  Images client tabs consume (EMR-862..865, 899..902). */
function toChartDoc(d: any): ChartDoc {
  return {
    id: d.id,
    name: d.originalName || "Untitled document",
    kind: d.kind ?? "unclassified",
    mimeType: d.mimeType ?? "",
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
    tags: Array.isArray(d.tags) ? d.tags : [],
  };
}

/* ── Types ────────────────────────────────────────────────────── */

interface PageProps {
  params: { id: string };
  searchParams: { tab?: string; scribe?: string };
}

/* ═══════════════════════════════════════════════════════════════════
   Page component — server-side data fetch + render
   ═══════════════════════════════════════════════════════════════════ */

export default async function PatientChartPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const tab = (searchParams.tab as TabKey) || "demographics";

  // EMR-786 — Enforce the role/chart-privacy gate *before* loading any
  // PHI. Front-office staff with no clinical permission, or any user
  // hitting a chart flagged restricted/doctor-only who is not on the
  // allowlist, lands on the AccessDenied surface instead of pulling
  // notes/encounters/medications into the query plan.
  try {
    await assertChartAccess(user, params.id);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      const reason =
        err.reason === "chart_restricted"
          ? "This chart is flagged restricted/doctor-only. You are not on the provider allowlist."
          : "Your role does not permit access to patient charts.";
      return <AccessDenied reason={reason} />;
    }
    throw err;
  }

  // EMR-786 — Office roles cannot land on the clinical tabs at all. If
  // a front-office user navigates to ?tab=notes or ?tab=clinical, route
  // them back to the demographics tab they are allowed to see.
  const CLINICAL_TABS: ReadonlySet<string> = new Set([
    "notes",
    "clinical",
    "medications",
    "prescribe",
    "labs",
    "imaging",
    "problems",
    // EMR-588 — private clinician-only notes are clinical-tier and must
    // bounce front-office users back to demographics like the rest.
    "private_notes",
  ]);
  if (CLINICAL_TABS.has(tab) && !canViewSection(user, "notes")) {
    redirect(`/clinic/patients/${params.id}?tab=demographics`);
  }

  // EMR-178 — `?tab=billing` is a legacy entry point. The billing
  // experience now lives on the dedicated /billing route (Financial
  // Cockpit). Redirect direct/bookmarked hits so they don't render
  // the truncated inline summary.
  if (tab === "billing") {
    redirect(`/clinic/patients/${params.id}/billing`);
  }

  /* ── Parallel data fetch ──────────────────────────────────── */
  const [
    patient,
    allNotes,
    threads,
    assessmentResponses,
    dosingRegimens,
    recentDoseLogs,
    cannabisProducts,
    patientMedications,
    patientMemories,
    clinicalObservations,
    patientClaims,
    pastConditions,
    pastSurgeries,
  ] = await Promise.all([
    prisma.patient.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId!,
        deletedAt: null,
      },
      include: {
        chartSummary: true,
        documents: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
        },
        encounters: {
          orderBy: { scheduledFor: "desc" },
          include: {
            notes: {
              include: { codingSuggestion: true },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    }),
    // Flatten notes via encounters (separate query to keep the patient query lean).
    // Cap: a patient with a decade of weekly visits has ~500 notes; the chart
    // tab paginates anyway. 200 is the most-recent slice the UI actually
    // renders before the user has to scroll.
    prisma.note.findMany({
      where: {
        encounter: {
          patientId: params.id,
          organization: { id: user.organizationId! },
        },
      },
      include: {
        encounter: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.messageThread.findMany({
      where: { patientId: params.id },
      orderBy: { lastMessageAt: "desc" },
      take: 20,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          include: {
            sender: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.assessmentResponse.findMany({
      where: { patientId: params.id },
      include: { assessment: true },
      orderBy: { submittedAt: "desc" },
      take: 100,
    }),
    // Cannabis dosing regimens with product info. 100 historical regimens
    // is well past any realistic patient — capping protects against a row
    // explosion without truncating real history.
    prisma.dosingRegimen.findMany({
      where: { patientId: params.id },
      include: { product: true },
      orderBy: { startDate: "desc" },
      take: 100,
    }),
    // Recent dose logs
    prisma.doseLog.findMany({
      where: { patientId: params.id },
      include: { regimen: { include: { product: true } } },
      orderBy: { loggedAt: "desc" },
      take: 10,
    }),
    // Organization's cannabis product formulary. 500 is a defensive ceiling
    // for an active formulary on a single org — most are well under 100.
    prisma.cannabisProduct.findMany({
      where: { organizationId: user.organizationId!, active: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    // Patient's conventional medications (active only). Cap at 100 — past
    // that there's a polypharmacy review needed, not a render problem.
    prisma.patientMedication.findMany({
      where: { patientId: params.id, active: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
    // Agentic memory harness: longitudinal memories + recent observations
    prisma.patientMemory.findMany({
      where: { patientId: params.id, validUntil: null },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.clinicalObservation.findMany({
      where: { patientId: params.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    // Claims for clinical billing summary
    prisma.claim.findMany({
      where: { patientId: params.id },
      orderBy: { serviceDate: "desc" },
      take: 20,
      include: {
        payments: true,
        denialEvents: { orderBy: { createdAt: "desc" } },
        appealPackets: { orderBy: { createdAt: "desc" } },
        adjustments: true,
        charges: true,
      },
    }),
    prisma.pastMedicalCondition.findMany({
      where: { patientId: params.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pastSurgery.findMany({
      where: { patientId: params.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!patient) notFound();

  /* ── Partition documents ──────────────────────────────────── */
  const recordDocs = patient.documents.filter(
    (d) => d.kind !== "image" && d.kind !== "lab"
  );
  const imageDocs = patient.documents.filter((d) => d.kind === "image");
  const labDocs = patient.documents.filter((d) => d.kind === "lab");

  /* ── Tab counts ───────────────────────────────────────────── */
  const activeRegimens = dosingRegimens.filter((r: any) => r.active);

  const openClaimCount = await prisma.claim.count({
    where: {
      patientId: params.id,
      status: { in: ["draft", "scrubbing", "scrub_blocked", "ready", "submitted", "ch_rejected", "accepted", "adjudicated", "denied", "partial", "appealed"] },
    },
  });

  // Open tasks for this patient (EMR-180: task list on chart open)
  const openTasks = await prisma.task.findMany({
    where: { patientId: params.id, status: "open" },
    orderBy: { dueAt: "asc" },
    take: 8,
  });

  // EMR-132: most recent in-progress encounter, used to anchor the
  // ChartingTimer to wall time across page navigations.
  const activeEncounter = patient.encounters.find(
    (e: any) => ["in_visit", "in_progress"].includes(e.status) && e.startedAt,
  );

  // EMR-132: trailing org charting-time benchmark (median seconds from
  // startedAt → chartingCompletedAt over the last 60 finalized
  // encounters). Cheap aggregate; null when there isn't enough history.
  const recentCharted = await prisma.encounter.findMany({
    where: {
      organizationId: user.organizationId!,
      startedAt: { not: null },
      chartingCompletedAt: { not: null },
    },
    orderBy: { chartingCompletedAt: "desc" },
    take: 60,
    select: { startedAt: true, chartingCompletedAt: true },
  });
  const benchmarkSeconds = computeMedianChartingSeconds(recentCharted);

  const openObservationCount = clinicalObservations.filter(
    (o: any) => !o.acknowledgedAt,
  ).length;

  // EMR-588 — Pull private clinician-only notes for the chart sidebar
  // count + the tab render. Loader is permission-gated internally and
  // writes a read-audit row; we only call it when the caller can see
  // notes at all, so back-office without notes.read never triggers it.
  const userCanSeePrivateNotes = canViewSection(user, "notes");
  const privateNotes = userCanSeePrivateNotes
    ? await listPrivateNotes(params.id).catch((err) => {
        logger.error({
          event: "private_notes_load_failed",
          patientId: params.id,
          err: String(err),
        });
        return [];
      })
    : [];

  // Activity timeline (Linear/Notion-style chart event feed). We only
  // hit the timeline aggregator when the tab is actually open — every
  // other render keeps its zero-cost baseline. The count shown on the
  // tab badge is an approximation derived from data we already have so
  // it doesn't require its own query on every chart open.
  const activityEvents = tab === "timeline"
    ? await loadPatientActivity(prisma, params.id, { limit: 200 })
    : [];
  const timelineCount =
    patient.encounters.length + threads.length + allNotes.length;

  const counts = {
    demographics: 1,
    memory: patientMemories.length + openObservationCount,
    timeline: timelineCount,
    records: recordDocs.length,
    images: imageDocs.length,
    labs: labDocs.length + assessmentResponses.length,
    notes: allNotes.length,
    private_notes: privateNotes.length,
    correspondence: threads.length,
    rx: activeRegimens.length,
    billing: openClaimCount,
  };

  /* ── Hover-peek entries (slices 3a + 3b) ────────────────────
   * Five most recent items per tab, derived from the data we already
   * fetched. No new queries — just a reshape. 3a introduced labs,
   * notes, and rx; 3b adds records, images, correspondence, memory,
   * and billing so every tab that carries a list has a peek. */
  const tabPeeks: TabPeeks = {
    labs: labDocs.slice(0, 5).map((d: any) => ({
      id: d.id,
      title: d.originalName || "Untitled lab",
      meta: formatRelative(d.createdAt),
      href: `/clinic/patients/${params.id}?tab=labs`,
    })),
    notes: allNotes.slice(0, 5).map((n: any) => {
      // Notes store their chief complaint inside a Json `blocks` payload
      // whose shape is validated at write-time. For peek purposes we just
      // read defensively and fall back to the narrative or a generic label.
      const chiefComplaint =
        typeof (n.blocks as { chiefComplaint?: unknown })?.chiefComplaint === "string"
          ? ((n.blocks as { chiefComplaint: string }).chiefComplaint).trim()
          : "";
      const raw = chiefComplaint || n.narrative?.trim() || "Untitled note";
      return {
        id: n.id,
        title: raw.length > 60 ? raw.slice(0, 60) + "…" : raw,
        meta: `${n.status} · ${formatRelative(n.createdAt)}`,
        href: `/clinic/patients/${params.id}/notes/${n.id}`,
      };
    }),
    rx: activeRegimens.slice(0, 5).map((r: any) => ({
      id: r.id,
      title: r.product?.name ?? "Cannabis regimen",
      meta: [r.dosage, r.product?.format].filter(Boolean).join(" · ") || "Active",
      href: `/clinic/patients/${params.id}?tab=rx`,
    })),
    records: recordDocs.slice(0, 5).map((d: any) => ({
      id: d.id,
      title: d.originalName || "Untitled document",
      meta: `${d.kind} · ${formatRelative(d.createdAt)}`,
      href: `/clinic/patients/${params.id}?tab=records`,
    })),
    images: imageDocs.slice(0, 5).map((d: any) => ({
      id: d.id,
      title: d.originalName || "Untitled image",
      meta: formatRelative(d.createdAt),
      href: `/clinic/patients/${params.id}?tab=images`,
    })),
    correspondence: threads.slice(0, 5).map((t: any) => ({
      id: t.id,
      title: t.subject || "No subject",
      meta: `${t.messages.length} message${t.messages.length === 1 ? "" : "s"} · ${formatRelative(t.lastMessageAt)}`,
      href: `/clinic/patients/${params.id}?tab=correspondence`,
    })),
    memory: patientMemories.slice(0, 5).map((m: any) => ({
      id: m.id,
      title:
        m.content.length > 60 ? m.content.slice(0, 60) + "…" : m.content,
      meta: `${m.kind} · ${formatRelative(m.createdAt)}`,
      href: `/clinic/patients/${params.id}?tab=memory`,
    })),
    billing: patientClaims.slice(0, 5).map((c: any) => ({
      id: c.id,
      // Money is stored in cents; peek rows render the dollar amount
      // rounded to the nearest dollar — we're not trying to be a ledger.
      title: `${c.payerName ?? "Claim"} · $${Math.round(c.billedAmountCents / 100)}`,
      meta: `${c.status} · ${formatRelative(c.serviceDate)}`,
      href: `/clinic/patients/${params.id}/billing`,
    })),
    // EMR-817 — demographics tab hover peek: primary contact summary.
    demographics: [
      {
        id: "dob",
        title: patient.dateOfBirth
          ? `DOB ${new Date(patient.dateOfBirth).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}`
          : "DOB not on file",
        meta: "Date of birth",
        href: `/clinic/patients/${params.id}?tab=demographics`,
      },
      {
        id: "email",
        title: patient.email || "No email on file",
        meta: "Email",
        href: `/clinic/patients/${params.id}?tab=demographics`,
      },
      {
        id: "phone",
        title: patient.phone || "No phone on file",
        meta: "Phone",
        href: `/clinic/patients/${params.id}?tab=demographics`,
      },
    ],
  };

  /* ── AI peek summaries (slice 3) ────────────────────────────
   * One-to-two sentence narrative per tab, rendered atop the hover
   * popover. Wrapped in try/catch so an LLM outage degrades gracefully
   * to the existing entry-list peek (same pattern as Command Center
   * tile loaders). */
  let peekSummaries: Partial<Record<TabKey, string>> | undefined;
  try {
    peekSummaries = await loadPeekSummaries(patient.firstName, tabPeeks);
  } catch (err) {
    logger.error({ event: "clinic.patient_chart.peek_summary_failed", err });
    peekSummaries = undefined;
  }

  /* ── Clinical Decision Support alerts (EMR-166) ──────────── */
  const cannabinoids: string[] = [];
  for (const regimen of dosingRegimens) {
    const prod = (regimen as any).product;
    if (prod?.thcConcentration > 0) cannabinoids.push("THC");
    if (prod?.cbdConcentration > 0) cannabinoids.push("CBD");
    if (prod?.cbnConcentration > 0) cannabinoids.push("CBN");
    if (prod?.cbgConcentration > 0) cannabinoids.push("CBG");
  }
  const uniqueCannabinoids = [...new Set(cannabinoids)];

  const cdsAlerts = generateCDSAlerts({
    patientId: params.id,
    medications: patientMedications.map((m: any) => ({
      name: m.name,
      genericName: m.genericName,
      active: m.active,
    })),
    cannabinoids: uniqueCannabinoids.length > 0 ? uniqueCannabinoids : ["THC", "CBD"],
    dateOfBirth: patient.dateOfBirth,
    presentingConcerns: patient.presentingConcerns,
    dosingRegimens: dosingRegimens.map((r: any) => ({
      route: r.route ?? "oral",
      doseAmount: r.doseAmount ?? 0,
      doseUnit: r.doseUnit ?? "mg",
      frequencyPerDay: r.frequencyPerDay ?? 1,
      thcMgPerDose: r.thcMgPerDose,
      cbdMgPerDose: r.cbdMgPerDose,
    })),
  });

  /* ── Birthday check (EMR-780) ────────────────────────────── */
  const isBirthday = (() => {
    if (!patient.dateOfBirth) return false;
    const today = new Date();
    const dob = new Date(patient.dateOfBirth);
    return dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate();
  })();

  /* ── Bound start visit action ─────────────────────────────── */
  const startVisitWithPatient = startVisit.bind(null, params.id);

  const completenessScore = patient.chartSummary?.completenessScore ?? 0;

  const intake = (patient.intakeAnswers ?? {}) as Record<string, any>;
  const sex = intake.sex ?? intake.gender ?? "U";
  const dob = patient.dateOfBirth ? new Date(patient.dateOfBirth) : null;
  const age = dob
    ? Math.floor(
        (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;

  const chartSummaryText = patient.chartSummary?.summaryMd
    ? cleanMarkdownSummary(patient.chartSummary.summaryMd)
    : patient.presentingConcerns ?? "No summary available.";

  /* ── Serialize threads for client component ───────────────── */
  const serializedThreads: SerializedThread[] = threads.map((t: any) => ({
    id: t.id,
    subject: t.subject,
    lastMessageAt: t.lastMessageAt.toISOString(),
    triageUrgency: t.triageUrgency ?? null,
    triageCategory: t.triageCategory ?? null,
    triageSafetyFlags: Array.isArray(t.triageSafetyFlags)
      ? (t.triageSafetyFlags as string[])
      : null,
    triageSummary: t.triageSummary ?? null,
    triagedAt: t.triagedAt ? t.triagedAt.toISOString() : null,
    messages: t.messages.map((m: any) => ({
      id: m.id,
      body: m.body,
      status: m.status,
      aiDrafted: m.aiDrafted,
      senderUserId: m.senderUserId,
      senderAgent: m.senderAgent,
      sender: m.sender
        ? { firstName: m.sender.firstName, lastName: m.sender.lastName }
        : null,
      createdAt: m.createdAt.toISOString(),
    })),
  }));

  const headerDob = patient.dateOfBirth ? new Date(patient.dateOfBirth) : null;
  const headerAge = headerDob
    ? Math.floor(
        (Date.now() - headerDob.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;
  const headerIntake = (patient.intakeAnswers ?? {}) as Record<string, any>;
  const headerSex = headerIntake.sex ?? headerIntake.gender ?? "F";

  /* ── Rx tab data (EMR-873..882) ─────────────────────────────
   * Module gating, serialized regimens/dose-logs, interaction
   * checks and daily cannabinoid totals — all derived from data
   * already fetched above. */
  const moduleFlags = resolveModuleFlags({
    hasCannabisFormulary: cannabisProducts.length > 0,
    hasCannabisRegimen: dosingRegimens.length > 0,
  });
  const rxRegimens = dosingRegimens.map(serializeRegimen);
  const rxDoseLogs = recentDoseLogs.map(serializeDoseLog);
  const rxInteractions = (() => {
    const medNames = patientMedications.map((m: any) => m.name);
    const cset = new Set<string>();
    for (const r of activeRegimens) {
      const p = (r as any).product;
      if (p?.thcConcentration > 0) cset.add("THC");
      if (p?.cbdConcentration > 0) cset.add("CBD");
      if (p?.cbnConcentration > 0) cset.add("CBN");
      if (p?.cbgConcentration > 0) cset.add("CBG");
    }
    return checkInteractions(medNames, Array.from(cset)).map((i) => ({
      drug: i.drug,
      cannabinoid: i.cannabinoid,
      severity: i.severity,
      mechanism: i.mechanism,
      recommendation: i.recommendation,
    }));
  })();
  const rxTotalThc = activeRegimens.reduce(
    (s: number, r: any) => s + (r.calculatedThcMgPerDay ?? 0),
    0,
  );
  const rxTotalCbd = activeRegimens.reduce(
    (s: number, r: any) => s + (r.calculatedCbdMgPerDay ?? 0),
    0,
  );

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <BirthdayBanner isBirthday={isBirthday} firstName={patient.firstName} />
      {/* Tracks this view in the localStorage "recently viewed" strip */}
      <TrackPatientView
        patientId={patient.id}
        patientName={`${patient.firstName} ${patient.lastName}`}
      />
      {/* Per-user versioned tracker for the top-bar recent-patients strip */}
      <TrackChartView
        userId={user.id}
        patientId={patient.id}
        patientName={`${patient.firstName} ${patient.lastName}`}
        avatarUrl={intake.photoUrl ?? null}
      />

      {/* EMR-780: celebratory popup fires once-per-session when opening
          the chart on the patient's birthday. */}
      <BirthdayCelebration
        dateOfBirth={patient.dateOfBirth}
        patientFirstName={patient.firstName}
        patientId={patient.id}
        audience="clinician"
      />

      {/* ── Dossier header ────────────────────────────────── */}
      <Card tone="ambient" className="mb-8 !overflow-visible">
        <CardContent className="pt-8 pb-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-start gap-6 flex-1 min-w-[320px]">
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <PatientAvatar
                  patientId={patient.id}
                  firstName={patient.firstName}
                  lastName={patient.lastName}
                  initialPhotoUrl={intake.photoUrl ?? null}
                />
                {/* EMR-851: chart alerts & reminders under the monogram */}
                <AlertsButton patientId={patient.id} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <Eyebrow>Patient chart</Eyebrow>
                  <ChartingTimer
                    startedAtIso={activeEncounter?.startedAt?.toISOString() ?? null}
                    benchmarkSeconds={benchmarkSeconds}
                  />
                </div>
                <h1 className="font-display text-3xl text-text tracking-tight leading-tight flex items-center gap-2 flex-wrap">
                  <span>
                    {patient.firstName} {patient.lastName}
                    {age !== null ? (
                      <span className="text-text-muted font-normal text-2xl">
                        {" "}({age}, {sex === "Female" ? "F" : sex === "Male" ? "M" : sex})
                      </span>
                    ) : null}
                  </span>
                  {/* EMR-780: birthday indicator — renders 🎂 only when
                      today matches the patient's DOB. Auto-clears at 00:01
                      local the following day. */}
                  <BirthdayBadge dateOfBirth={patient.dateOfBirth} />
                </h1>
                <p
                  className="text-[15px] text-text-muted mt-1.5 leading-relaxed max-w-xl"
                  style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {chartSummaryText}
                </p>
                <div className="flex flex-col gap-1 mt-3">
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{patient.status}</Badge>
                    {patient.qualificationStatus !== "unknown" && (
                      <Badge
                        tone={
                          patient.qualificationStatus === "qualified"
                            ? "success"
                            : patient.qualificationStatus === "pending"
                              ? "warning"
                              : patient.qualificationStatus === "ineligible"
                                ? "danger"
                                : "info"
                        }
                      >
                        {patient.qualificationStatus}
                      </Badge>
                    )}
                  </div>
                  <HeaderContact
                    patientId={patient.id}
                    patientName={`${patient.firstName} ${patient.lastName}`}
                    dateOfBirth={patient.dateOfBirth}
                    email={patient.email}
                    phone={patient.phone}
                  />
                </div>

                {/* Chart readiness bar */}
                <div className="mt-4 max-w-xs">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-text-subtle">Chart readiness</span>
                    <Badge tone="accent">{completenessScore}%</Badge>
                  </div>
                  <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-accent-strong rounded-full transition-all duration-500"
                      style={{ width: `${completenessScore}%` }}
                    />
                  </div>
                </div>

                {/* Patient tags & Allergy trigger */}
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <TagManager patientId={params.id} />
                  <AllergyManager patientId={params.id} initialAllergies={patient.allergies} />
                  {/* EMR-894: private notes moved off its tab onto the chart card */}
                  {userCanSeePrivateNotes && (
                    <PrivateNotesButton
                      patientId={params.id}
                      notes={privateNotes}
                      canAuthor={canEditSection(user, "notes")}
                      patientFirstName={patient.firstName}
                    />
                  )}
                </div>

                {/* Allergies list prefixed with "Allergies:" */}
                <div className="mt-4 space-y-2 border-t border-border/40 pt-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-text-subtle uppercase tracking-wider">
                      Allergies:
                    </span>
                    {patient.allergies?.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {patient.allergies.map((a: string) => (
                          <AllergyBadge key={a} patientId={patient.id} allergyStr={a} />
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted italic">None documented</span>
                    )}
                  </div>

                  {patient.contraindications?.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <span className="text-xs font-semibold text-text-subtle uppercase tracking-wider">
                        Contraindications:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {patient.contraindications.map((c: string) => (
                          <Badge key={c} tone="warning" className="text-[10px]">
                            ⊘ {c}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>


            {/* Quick actions */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <MessagePatientDock
                patientId={patient.id}
                patientName={`${patient.firstName} ${patient.lastName}`}
              />
              <Link href={`/clinic/patients/${params.id}/download`}>
                <Button variant="ghost" size="sm">
                  Download chart
                </Button>
              </Link>
              {/* ux/print-stylesheets-clinical — opens a server-rendered
                  chart summary in a new tab and auto-fires the print dialog
                  via AutoPrintTrigger. Target="_blank" keeps the working
                  chart untouched while the printout renders. */}
              <Link
                href={`/clinic/patients/${params.id}/print`}
                target="_blank"
                rel="noopener"
              >
                <Button variant="ghost" size="sm">
                  Print chart
                </Button>
              </Link>
              <Link href={`/clinic/patients/${params.id}/voice-chart`}>
                <Button variant="ghost" size="sm">
                  Voice chart
                </Button>
              </Link>
              <Link href={`/clinic/patients/${params.id}/prepare`}>
                <Button variant="highlight" size="sm">
                  Prepare for visit
                </Button>
              </Link>
              <form action={startVisitWithPatient}>
                <Button type="submit" size="sm">
                  Start visit
                </Button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Unresolved follow-up items (EMR-675) ───────────── */}
      {/* Derived from finalized notes (Plan/Follow-up blocks) +
          triaged message threads. One-click converts each loose end
          into a Task via convertFollowUpToTask; converted items drop
          off this panel automatically because the Task description
          embeds the sourceRef. Sits above ChartTaskList so the
          clinician's eye lands here first when reviewing a chart. */}
      {(() => {
        const followUps = buildUnresolvedFollowUps({
          patientId: params.id,
          notes: allNotes.slice(0, 20) as any,
          threads: threads as any,
          existingTasks: openTasks as any,
        });
        return followUps.length > 0 ? (
          <div className="mb-6">
            <UnresolvedFollowUpsPanel
              patientId={params.id}
              items={followUps}
              onConvert={convertFollowUpToTask}
            />
          </div>
        ) : null;
      })()}

      {/* ── Chart task list / to-do on open (EMR-180) ─────── */}
      {/* Built from data we already fetched: open tasks + unsigned notes.
          Uses the ChartTaskList component so the panel can be dismissed
          per-patient and grows in one place when we add screenings,
          missing consents, etc. */}
      {(() => {
        const unsignedNotes = allNotes.filter(
          (n: any) => n.status !== "finalized" && n.status !== "amended",
        );
        const items = [
          ...openTasks.map((task: any) => ({
            id: task.id,
            category: "task" as const,
            title: task.title,
            detail: task.description ?? undefined,
            href: `/clinic/patients/${params.id}/orders`,
            dueAt: task.dueAt,
            severity:
              task.dueAt && new Date(task.dueAt).getTime() < Date.now()
                ? ("danger" as const)
                : ("info" as const),
          })),
          ...unsignedNotes.slice(0, 5).map((n: any) => ({
            id: n.id,
            category: "note" as const,
            title:
              typeof (n.blocks as { chiefComplaint?: unknown })?.chiefComplaint === "string"
                ? `Sign: ${(n.blocks as { chiefComplaint: string }).chiefComplaint}`
                : "Sign visit note",
            detail: n.status === "draft" ? "Draft awaiting sign-off" : "Pending review",
            href: `/clinic/patients/${params.id}/notes/${n.id}`,
            dueAt: null,
            severity: "warning" as const,
          })),
        ];
        return items.length > 0 ? (
          <div className="mb-6">
            <ChartTaskList patientId={params.id} items={items} />
          </div>
        ) : null;
      })()}

      {/* ── CDS Panel (EMR-166) ──────────────────────────── */}
      {cdsAlerts.length > 0 && (
        <div className="mb-6">
          <CDSPanel
            alerts={cdsAlerts}
            patientName={`${patient.firstName} ${patient.lastName}`}
          />
        </div>
      )}

      {/* ── Tab bar + content ─────────────────────────────── */}
      {/* ChartFrame lets the clinician toggle tab bar position (top /
          bottom) and density (labels / dots). Both preferences are
          persisted in localStorage and scoped to the whole chart. */}
      <ChartFrame
        nav={
          <ChartTabs
            patientId={params.id}
            counts={counts}
            peeks={tabPeeks}
            peekSummaries={peekSummaries}
          />
        }
      >
      {tab === "demographics" && (
        <DemographicsTab
          patient={patient}
          medications={patientMedications}
          openTasks={openTasks}
          upcomingEncounters={patient.encounters.filter(
            (e: any) =>
              e.status === "scheduled" &&
              e.scheduledFor &&
              new Date(e.scheduledFor) >= new Date(),
          )}
          pastConditions={pastConditions}
          pastSurgeries={pastSurgeries}
          canEditDemographics={canEditSection(user, "notes")}
          moduleFlags={moduleFlags}
        />
      )}
      {tab === "records" && (
        <RecordsTab documents={recordDocs.map(toChartDoc)} patientId={params.id} />
      )}
      {tab === "images" && (
        <ImagesTab documents={imageDocs.map(toChartDoc)} patientId={params.id} />
      )}
      {tab === "labs" && (
        <LsvTab
          patientId={params.id}
          labDocs={labDocs.map(toChartDoc)}
          assessments={assessmentResponses.map((r: any) => ({
            slug: r.assessment.slug,
            title: r.assessment.title,
            score: r.score,
            interpretation: r.interpretation,
            submittedAt: new Date(r.submittedAt).toISOString(),
          }))}
        />
      )}
      {tab === "notes" && (
        <NotesTab
          patientId={params.id}
          startVisitAction={startVisitWithPatient}
          scribeProcessing={searchParams.scribe === "processing"}
          notes={allNotes.map((n: any) => {
            const cc =
              typeof (n.blocks as { chiefComplaint?: unknown })?.chiefComplaint === "string"
                ? (n.blocks as { chiefComplaint: string }).chiefComplaint
                : "";
            const firstBlock = Array.isArray(n.blocks) && n.blocks.length > 0
              ? (n.blocks[0] as any)
              : null;
            return {
              id: n.id,
              status: n.status,
              aiDrafted: Boolean(n.aiDrafted),
              title: cc || `${n.encounter?.modality ?? "Visit"} note`,
              reason: n.encounter?.reason ?? "General visit",
              createdAt: new Date(n.createdAt).toISOString(),
              preview: firstBlock
                ? `${firstBlock.heading ?? ""}: ${(firstBlock.body ?? "").slice(0, 280)}`
                : (n.narrative ?? "").slice(0, 280),
              pendingAttestation: n.status === "needs_review",
            };
          })}
        />
      )}
      {tab === "private_notes" && userCanSeePrivateNotes && (
        // EMR-588 — Confidential clinician-only notes. Section-gated on
        // canViewSection(notes) so back-office without notes.read
        // (already redirected by the CLINICAL_TABS guard) and patients
        // (already on a different surface entirely) can never reach
        // this render path. Authoring requires notes.edit, surfaced
        // here as canAuthor for the client component.
        <PrivateNotesTab
          patientId={params.id}
          notes={privateNotes}
          canAuthor={canEditSection(user, "notes")}
          patientFirstName={patient.firstName}
        />
      )}
      {tab === "memory" && (
        <MemoryTab
          memories={patientMemories}
          observations={clinicalObservations}
          patientFirstName={patient.firstName}
          patientId={params.id}
          moduleFlags={moduleFlags}
        />
      )}
      {tab === "timeline" && (
        <PatientActivityTimeline
          events={activityEvents}
          loadedAt={new Date().toISOString()}
        />
      )}
      {tab === "correspondence" && (
        <CorrespondenceTab
          threads={serializedThreads}
          currentUserId={user.id}
          patientFirstName={patient.firstName}
          patientLastName={patient.lastName}
          patientId={params.id}
        />
      )}
      {tab === "rx" && (
        <RxTab
          patientId={params.id}
          moduleFlags={moduleFlags}
          regimens={rxRegimens}
          doseLogs={rxDoseLogs}
          interactions={rxInteractions}
          totalThcPerDay={rxTotalThc}
          totalCbdPerDay={rxTotalCbd}
        />
      )}
      {/* tab === "billing" is intercepted by the redirect at the top of
          the page (EMR-178). The standalone Financial Cockpit owns
          billing rendering. */}
      </ChartFrame>

      {/* EMR-877: floating "+" quick-action menu, fixed bottom-right on
          every chart tab (Rx / quick note / contact patient). */}
      <FloatingActionMenu
        patientId={params.id}
        patientName={`${patient.firstName} ${patient.lastName}`}
        patientPhone={patient.phone}
      />
    </PageShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Demographics tab (EMR-019)
   ═══════════════════════════════════════════════════════════════════ */

function DemographicsTab({
  patient,
  medications,
  openTasks,
  upcomingEncounters,
  pastConditions,
  pastSurgeries,
  canEditDemographics,
  moduleFlags,
}: {
  patient: any;
  medications: any[];
  openTasks: any[];
  upcomingEncounters: any[];
  pastConditions: any[];
  pastSurgeries: any[];
  canEditDemographics: boolean;
  moduleFlags: ModuleFlags;
}) {
  const dob = patient.dateOfBirth ? new Date(patient.dateOfBirth) : null;
  const age = dob
    ? Math.floor(
        (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;
  const ageBand = getAgeBand(dob);
  const showPediatricOverlay = isPediatric(dob);

  const intake = (patient.intakeAnswers ?? {}) as Record<string, any>;
  const pmh = pastConditions;
  const psh = pastSurgeries;
  const sex = formatDemographicValue(intake.sex ?? intake.gender);
  const race = formatDemographicValue(intake.race ?? intake.ethnicity);
  const maritalStatus = formatDemographicValue(intake.maritalStatus);
  const allergies = intake.allergies ?? patient.chartSummary?.allergies ?? "None documented";
  const uniqueThing =
    formatDemographicValue(intake.uniqueThing ?? intake.aboutYou, "") || null;
  const insurancePlan = formatInsurancePlan(intake);
  const insuranceId = formatInsuranceMemberId(intake);
  const emergencyContact = formatEmergencyContact(intake.emergencyContact);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <h2 className="font-display text-xl text-text tracking-tight">
          Demographics
        </h2>
        {/* EMR-849: bigger bubbles; "Adult" coloured by sex (pink ♀ / blue ♂) */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-3.5 py-1.5 text-[13px] font-semibold rounded-full border ${SEX_BUBBLE_CLASSES[sexColorKey(typeof sex === "string" ? sex : null)]}`}
          >
            {ageBand}
            {age != null ? ` ${age}y` : ""}
          </span>
          <span className="inline-flex items-center px-3.5 py-1.5 text-[13px] font-semibold rounded-full border bg-accent-soft text-accent border-accent/20">
            Medical Life Profile
          </span>
        </div>
      </div>

      {/* EMR-083 / EMR-109: pediatric overlay surfaces above demographics
          for any patient under 18. Higher-band overlays (geriatric, etc.)
          can be added here following the same pattern. */}
      {showPediatricOverlay && (
        <PediatricModule
          patientId={patient.id}
          patientFirstName={patient.firstName}
          band={ageBand}
          age={age}
        />
      )}

      {/* EMR-159: Care plan inline. Replaces the standalone "Care plan"
          tab — the physician sees treatment goals, upcoming visits, and
          open tasks alongside identity instead of behind another click. */}
      <CarePlanSection
        patientId={patient.id}
        treatmentGoals={patient.treatmentGoals}
        presentingConcerns={patient.presentingConcerns}
        upcomingVisits={upcomingEncounters.map((e) => ({
          id: e.id,
          scheduledFor: e.scheduledFor,
          status: e.status,
          modality: e.modality,
          reason: e.reason,
        }))}
        openTasks={openTasks.map((t: any) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          dueAt: t.dueAt,
        }))}
        cannabisHistory={
          patient.cannabisHistory && typeof patient.cannabisHistory === "object"
            ? (patient.cannabisHistory as {
                priorUse?: boolean;
                formats?: string[];
                reportedBenefits?: string[];
                reportedSideEffects?: string[];
              })
            : null
        }
      />


      {/* Identity, contact, insurance — inline-editable (UX click-to-edit).
          Each field swaps to an input on click; saves on Enter/blur, reverts
          on Esc; errors surface via the project toast system. */}
      <Card tone="raised">
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Identity &amp; contact</CardTitle>
            {/* EMR-848: each subsection opens its own editable detail page */}
            <div className="flex items-center gap-1.5">
              <Link
                href={`/clinic/patients/${patient.id}/demographics/identity`}
                className="text-[11px] px-2 py-0.5 rounded-md border border-border text-accent hover:bg-accent-soft transition-colors"
              >
                Identity ↗
              </Link>
              <Link
                href={`/clinic/patients/${patient.id}/demographics/contact`}
                className="text-[11px] px-2 py-0.5 rounded-md border border-border text-accent hover:bg-accent-soft transition-colors"
              >
                Contact ↗
              </Link>
            </div>
          </div>
          <CardDescription>
            {canEditDemographics
              ? "Click any field to edit. Press Enter to save, Esc to cancel."
              : "Personal identification and contact"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <InlineDemographicsCard
              patientId={patient.id}
              canEdit={canEditDemographics}
              initial={{
                firstName: patient.firstName ?? "",
                lastName: patient.lastName ?? "",
                dateOfBirth: dob ? dob.toISOString().slice(0, 10) : "",
                email: patient.email ?? "",
                phone: patient.phone ?? "",
                addressLine1: patient.addressLine1 ?? "",
                addressLine2: patient.addressLine2 ?? "",
                city: patient.city ?? "",
                state: patient.state ?? "",
                postalCode: patient.postalCode ?? "",
              }}
              insurance={{
                providerName:
                  ((intake.insurance as any)?.providerName as string) ??
                  (typeof intake.insurance === "string" ? (intake.insurance as string) : "") ??
                  "",
                memberId:
                  ((intake.insurance as any)?.memberId as string) ??
                  (intake.memberId as string) ??
                  "",
                groupNumber:
                  ((intake.insurance as any)?.groupNumber as string) ?? "",
              }}
            />
            <div className="grid grid-cols-1 gap-y-3 text-sm">
              <DemoField label="Sex" value={sex} />
              <DemoField label="Race / Ethnicity" value={race} />
              <DemoField label="Marital status" value={maritalStatus} />
              {/* EMR-850: SSN on identity + "Patient ID" -> "Patient Life #" */}
              <DemoField
                label="SSN"
                value={formatDemographicValue(intake.ssn, "Not recorded")}
                mono
              />
              <DemoField label="Patient Life #" value={patient.id.slice(0, 12).toUpperCase()} mono />
              {emergencyContact && (
                <DemoField label="Emergency contact" value={emergencyContact} />
              )}
              {age != null && (
                <DemoField label="Age" value={`${age} (${ageBand})`} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert box */}
      <Card tone="raised" className="border-l-4 border-l-[color:var(--warning)]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-[color:var(--warning)]">&#9888;</span>
            Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text leading-relaxed">
            {typeof allergies === "string"
              ? allergies
              : Array.isArray(allergies)
                ? allergies.join(", ")
                : "None documented"}
          </p>
        </CardContent>
      </Card>

      {/* Insurance & cannabis qualification */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card tone="raised">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Insurance</CardTitle>
              <Link
                href={`/clinic/patients/${patient.id}/demographics/insurance`}
                className="text-[11px] px-2 py-0.5 rounded-md border border-border text-accent hover:bg-accent-soft transition-colors"
              >
                Open ↗
              </Link>
            </div>
            <CardDescription>Coverage information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-y-4">
              <DemoField label="Plan" value={insurancePlan} />
              {insuranceId && <DemoField label="Member ID" value={insuranceId} mono />}
              <DemoField
                label="Cannabis qualification"
                value={patient.qualificationStatus === "qualified"
                  ? `Qualified${patient.qualificationExpiresAt ? ` (expires ${formatDate(patient.qualificationExpiresAt)})` : ""}`
                  : patient.qualificationStatus === "pending"
                    ? "Pending review"
                    : patient.qualificationStatus === "ineligible"
                      ? "Not eligible"
                      : "Not assessed"}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <MedicalHistoryManager
        patientId={patient.id}
        initialPMH={pmh}
        initialPSH={psh}
      />

      {/* EMR-852: Current Medications merged into the chart with class
          bubbles, click/right-click actions, scroll, and a pop-out that
          embeds the full medication manager. */}
      <CurrentMedicationsCard
        patientId={patient.id}
        patientName={`${patient.firstName} ${patient.lastName}`}
        patientDOB={
          patient.dateOfBirth ? new Date(patient.dateOfBirth).toISOString() : null
        }
        medications={medications}
        moduleFlags={moduleFlags}
      />


      {/* EMR-854: Presenting Concerns + Treatment Goals merged into a
          Clinical Decision Support card; Treatment Goals is AI-driven
          ("Cindy suggests"). */}
      <Card tone="raised" className="border-l-4 border-l-accent">
        <CardHeader>
          <CardTitle className="text-base">Clinical Decision Support</CardTitle>
          <CardDescription>Care-plan concerns &amp; goals</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1">
              Presenting Concerns
            </p>
            <p className="text-sm text-text-muted leading-relaxed">
              {patient.presentingConcerns ||
                "Repeat / acute issues, recent medication changes, and pending specialist appointments surface here."}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1.5">
              Treatment Goals
            </p>
            <CindySays
              analysis={{
                voice: "suggests",
                prefix: CINDY_PREFIX.suggests,
                bullets: patient.treatmentGoals
                  ? [patient.treatmentGoals]
                  : [
                      "Confirm the maintenance regimen is meeting the patient's primary symptom goal before escalating dose.",
                      "Track the patient-reported outcome weekly to verify the plan trends the right way.",
                    ],
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* EMR-855: colour-coded preventative screenings (green up-to-date /
          red due) with USPSTF search, drill-in result popups, and RPM/CCM
          device categories. Sits below Insurance + Current Medications. */}
      <ScreeningsPanel
        patientId={patient.id}
        screenings={dueScreenings(age, typeof sex === "string" ? sex : null).map((s) => ({
          id: s.id,
          label: s.label,
          emoji: s.emoji,
          grade: s.grade,
          frequency: s.frequency,
        }))}
      />

      {/* Something special about this patient */}
      {uniqueThing && (
        <Card tone="ambient">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-start gap-3">
              <LeafSprig size={20} className="text-accent mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-accent mb-1">
                  Something special about {patient.firstName}
                </p>
                <p className="text-sm text-text leading-relaxed">{uniqueThing}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DemoField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-subtle mb-0.5">
        {label}
      </p>
      <p className={`text-sm text-text ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   USPSTF Screening Reminders (EMR-070)
   ═══════════════════════════════════════════════════════════════════ */

function ScreeningReminders({
  age,
  sex,
}: {
  age: number | null;
  sex: string | null;
}) {
  const due = dueScreenings(age, sex);
  if (due.length === 0) return null;

  return (
    <Card tone="raised" className="border-l-4 border-l-[color:var(--highlight)]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span>🩺</span>
            Preventive Screenings Due
          </CardTitle>
          <Badge tone="highlight">{due.length} pending</Badge>
        </div>
        <CardDescription>
          USPSTF grade A & B recommendations based on age and sex.
          Consider discussing with the patient today.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {due.map((screening) => (
            <div
              key={screening.id}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-highlight-soft/50 border border-highlight/20 text-xs"
              title={screening.description}
            >
              <span className="text-lg">{screening.emoji}</span>
              <div>
                <p className="font-medium text-text leading-tight">
                  {screening.label}
                </p>
                <p className="text-[10px] text-text-subtle">
                  Grade {screening.grade} · {screening.frequency}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}




/* ═══════════════════════════════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════════════════════════════ */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * EMR-132: Median seconds from Encounter.startedAt → chartingCompletedAt
 * across the trailing 60 finalized encounters in the org. Returns null
 * when there isn't enough history to anchor a meaningful benchmark
 * (the timer falls back to the industry-average 15-min comparison).
 */
function computeMedianChartingSeconds(
  rows: { startedAt: Date | null; chartingCompletedAt: Date | null }[],
): number | null {
  const durations: number[] = [];
  for (const row of rows) {
    if (!row.startedAt || !row.chartingCompletedAt) continue;
    const sec = Math.round(
      (row.chartingCompletedAt.getTime() - row.startedAt.getTime()) / 1000,
    );
    if (sec > 30 && sec < 4 * 60 * 60) durations.push(sec);
  }
  if (durations.length < 5) return null;
  durations.sort((a, b) => a - b);
  return durations[Math.floor(durations.length / 2)];
}
