import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  ForbiddenError,
  assertChartAccess,
  canViewSection,
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
import { dueScreenings } from "@/lib/domain/uspstf-screenings";
import { CorrespondenceTab, type SerializedThread } from "./correspondence-tab";
import { MemoryTab } from "./memory-tab";
import { ChartingTimer } from "./charting-timer";
import { startVisit } from "./actions";
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
import { logger } from "@/lib/observability/log";
import { BirthdayBanner } from "./birthday-banner";
import { MessagePatientDock } from "@/app/(clinician)/clinic/messages/dock-compose";

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
    (e: any) => e.status === "in_progress" && e.startedAt,
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

  const counts = {
    demographics: 1,
    memory: patientMemories.length + openObservationCount,
    records: recordDocs.length,
    images: imageDocs.length,
    labs: labDocs.length + assessmentResponses.length,
    notes: allNotes.length,
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

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <BirthdayBanner isBirthday={isBirthday} firstName={patient.firstName} />
      {/* Tracks this view in the localStorage "recently viewed" strip */}
      <TrackPatientView
        patientId={patient.id}
        patientName={`${patient.firstName} ${patient.lastName}`}
      />

      {/* ── Dossier header ────────────────────────────────── */}
      <Card tone="ambient" className="mb-8 !overflow-visible">
        <CardContent className="pt-8 pb-8">
          <div className="flex flex-wrap items-start gap-6">
            <PatientAvatar
              patientId={patient.id}
              firstName={patient.firstName}
              lastName={patient.lastName}
              initialPhotoUrl={intake.photoUrl ?? null}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <Eyebrow>Patient chart</Eyebrow>
                <ChartingTimer
                  startedAtIso={activeEncounter?.startedAt?.toISOString() ?? null}
                  benchmarkSeconds={benchmarkSeconds}
                />
              </div>
              <h1 className="font-display text-3xl text-text tracking-tight leading-tight flex items-center gap-2">
                <span>
                  {patient.firstName} {patient.lastName}
                  {age !== null ? (
                    <span className="text-text-muted font-normal text-2xl">
                      {" "}({age}, {sex === "Female" ? "F" : sex === "Male" ? "M" : sex})
                    </span>
                  ) : null}
                </span>
                {isBirthday && (
                  <span aria-hidden="true" className="text-2xl leading-none">🎂</span>
                )}
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


            {/* Quick actions */}
            <div className="flex items-center gap-2 shrink-0 pt-1">
              <MessagePatientDock
                patientId={patient.id}
                patientName={`${patient.firstName} ${patient.lastName}`}
              />
              <Link href={`/clinic/patients/${params.id}/download`}>
                <Button variant="ghost" size="sm">
                  Download chart
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
        />
      )}
      {tab === "records" && <RecordsTab documents={recordDocs} patientId={params.id} />}
      {tab === "images" && <ImagesTab documents={imageDocs} patientId={params.id} />}
      {tab === "labs" && (
        <LabsTab
          labDocuments={labDocs}
          assessmentResponses={assessmentResponses}
        />
      )}
      {tab === "notes" && (
        <NotesTab
          notes={allNotes}
          patientId={params.id}
          startVisitAction={startVisitWithPatient}
          scribeProcessing={searchParams.scribe === "processing"}
        />
      )}
      {tab === "memory" && (
        <MemoryTab
          memories={patientMemories}
          observations={clinicalObservations}
          patientFirstName={patient.firstName}
        />
      )}
      {tab === "correspondence" && (
        <CorrespondenceTab
          threads={serializedThreads}
          currentUserId={user.id}
          patientFirstName={patient.firstName}
          patientLastName={patient.lastName}
        />
      )}
      {tab === "rx" && (
        <CannabisRxTab
          regimens={dosingRegimens}
          doseLogs={recentDoseLogs}
          products={cannabisProducts}
          medications={patientMedications}
          patientId={params.id}
        />
      )}
      {/* tab === "billing" is intercepted by the redirect at the top of
          the page (EMR-178). The standalone Financial Cockpit owns
          billing rendering. */}
      </ChartFrame>
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
}: {
  patient: any;
  medications: any[];
  openTasks: any[];
  upcomingEncounters: any[];
  pastConditions: any[];
  pastSurgeries: any[];
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
  const sex = intake.sex ?? intake.gender ?? "Not recorded";
  const race = intake.race ?? intake.ethnicity ?? "Not recorded";
  const maritalStatus = intake.maritalStatus ?? "Not recorded";
  const allergies = intake.allergies ?? patient.chartSummary?.allergies ?? "None documented";
  const uniqueThing = intake.uniqueThing ?? intake.aboutYou ?? null;
  const insurancePlan = intake.insurancePlan ?? intake.insurance ?? "Not on file";
  const insuranceId = intake.insuranceId ?? intake.memberId ?? null;
  const emergencyContact = intake.emergencyContact ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <h2 className="font-display text-xl text-text tracking-tight">
          Demographics
        </h2>
        <div className="flex items-center gap-2">
          <AgeBandBadge band={ageBand} age={age} />
          <Badge tone="accent">Medical Life Profile</Badge>
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


      {/* Identity & Personal */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Identity</CardTitle>
            <CardDescription>Personal identification</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-y-4 gap-x-6">
              <DemoField label="Full name" value={`${patient.firstName} ${patient.lastName}`} />
              <DemoField label="Date of birth" value={dob ? `${formatDate(dob)} (age ${age})` : "Not recorded"} />
              <DemoField label="Sex" value={sex} />
              <DemoField label="Race / Ethnicity" value={race} />
              <DemoField label="Marital status" value={maritalStatus} />
              <DemoField label="Patient ID" value={patient.id.slice(0, 12).toUpperCase()} mono />
            </div>
          </CardContent>
        </Card>

        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
            <CardDescription>How to reach this patient</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-y-4">
              <DemoField label="Email" value={patient.email ?? "Not on file"} />
              <DemoField label="Phone" value={patient.phone ?? "Not on file"} />
              <DemoField
                label="Address"
                value={
                  [patient.addressLine1, patient.addressLine2, patient.city, patient.state, patient.postalCode]
                    .filter(Boolean)
                    .join(", ") || "Not on file"
                }
              />
              {emergencyContact && (
                <DemoField
                  label="Emergency contact"
                  value={typeof emergencyContact === "string" ? emergencyContact : `${emergencyContact.name} — ${emergencyContact.phone}`}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert box */}
      <Card tone="raised" className="border-l-4 border-l-[color:var(--warning)]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-[color:var(--warning)]">&#9888;</span>
            Alerts & Allergies
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
            <CardTitle className="text-base">Insurance</CardTitle>
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

      <MedicationsManager
        patientId={patient.id}
        patientName={`${patient.firstName} ${patient.lastName}`}
        patientDOB={patient.dateOfBirth}
        medications={medications}
      />


      {/* Clinical notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Presenting Concerns</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-muted leading-relaxed">
              {patient.presentingConcerns || "Not yet documented."}
            </p>
          </CardContent>
        </Card>

        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Treatment Goals</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-muted leading-relaxed">
              {patient.treatmentGoals || "Not yet documented."}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* USPSTF preventive screenings due */}
      <ScreeningReminders age={age} sex={typeof sex === "string" ? sex : null} />

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
   Records tab
   ═══════════════════════════════════════════════════════════════════ */

function RecordsTab({ documents, patientId }: { documents: any[]; patientId: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-xl text-text tracking-tight">
          Records
        </h2>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="No records on file yet"
          description="Upload clinical documents, diagnoses, letters, and other records to build this patient's chart."
        />
      ) : (
        <div className="grid gap-3">
          {documents.map((doc) => (
            <Card key={doc.id} tone="raised" className="card-hover">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <Badge
                        tone={
                          doc.kind === "unclassified"
                            ? "neutral"
                            : doc.kind === "diagnosis"
                              ? "warning"
                              : doc.kind === "letter"
                                ? "info"
                                : "accent"
                        }
                      >
                        {doc.kind}
                      </Badge>
                      {doc.aiClassified ? (
                        <Badge tone="success">AI classified</Badge>
                      ) : doc.needsReview ? (
                        <Badge tone="warning">Needs review</Badge>
                      ) : (
                        <Badge tone="neutral">Pending</Badge>
                      )}
                    </div>
                    <a
                      href={`/clinic/patients/${patientId}/documents/${doc.id}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-text truncate block hover:underline"
                    >
                      {doc.originalName}
                    </a>
                    <p className="text-xs text-text-muted mt-0.5">
                      {doc.mimeType} &middot; {formatFileSize(doc.sizeBytes)}
                    </p>
                    {doc.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {doc.tags.map((tag: string) => (
                          <span
                            key={tag}
                            className="text-[10px] text-text-subtle bg-surface-muted px-2 py-0.5 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`/clinic/patients/${patientId}/documents/${doc.id}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="secondary" size="sm">View</Button>
                    </a>
                    <div className="text-xs text-text-subtle tabular-nums text-right">
                      <span className="font-display">{formatDate(doc.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card tone="outlined" className="mt-4">
        <CardContent className="pt-5 pb-5">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">Upload a document</p>
          <ClinicianUploadForm patientId={patientId} />
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Images tab
   ═══════════════════════════════════════════════════════════════════ */

function ImagesTab({ documents, patientId }: { documents: any[]; patientId: string }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-xl text-text tracking-tight">
          Images
        </h2>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="No images uploaded"
          description="Medical images, X-rays, photos, and scans will appear here once uploaded."
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {documents.map((doc) => (
            <a
              key={doc.id}
              href={`/clinic/patients/${patientId}/documents/${doc.id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
            <Card tone="raised" className="card-hover overflow-hidden">
              <div className="aspect-square bg-surface-muted flex flex-col items-center justify-center p-4 rounded-t-xl">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-text-subtle mb-2"
                >
                  <rect
                    x="3"
                    y="3"
                    width="18"
                    height="18"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                  <circle cx="8.5" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.2" />
                  <path
                    d="M3 16l4.5-4.5a2 2 0 012.8 0L15 16"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M14 15l1.5-1.5a2 2 0 012.8 0L21 16"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className="text-[11px] text-text-subtle text-center truncate max-w-full">
                  {doc.mimeType}
                </p>
              </div>
              <CardContent className="pt-3 pb-3">
                <p className="text-sm font-medium text-text truncate">
                  {doc.originalName}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {formatFileSize(doc.sizeBytes)} &middot;{" "}
                  <span className="font-display">{formatDate(doc.createdAt)}</span>
                </p>
              </CardContent>
            </Card>
            </a>
          ))}
        </div>
      )}

      <Card tone="outlined" className="mt-4">
        <CardContent className="pt-5 pb-5">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">Upload an image</p>
          <ClinicianUploadForm patientId={patientId} />
        </CardContent>
      </Card>

      {/* DICOM viewer scaffold (EMR-014) */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="font-display text-lg text-text tracking-tight">
            DICOM Viewer
          </h3>
          <span className="text-[11px] text-text-subtle">
            Scaffold · synthetic frames
          </span>
        </div>
        <DicomViewer />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Labs tab
   ═══════════════════════════════════════════════════════════════════ */

function LabsTab({
  labDocuments,
  assessmentResponses,
}: {
  labDocuments: any[];
  assessmentResponses: any[];
}) {
  // Group assessment responses by assessment slug for sparklines
  const assessmentsBySlug: Record<
    string,
    { title: string; responses: { score: number | null; date: Date; interpretation: string | null }[] }
  > = {};

  for (const resp of assessmentResponses) {
    const slug = resp.assessment.slug;
    if (!assessmentsBySlug[slug]) {
      assessmentsBySlug[slug] = {
        title: resp.assessment.title,
        responses: [],
      };
    }
    assessmentsBySlug[slug].responses.push({
      score: resp.score,
      date: resp.submittedAt,
      interpretation: resp.interpretation,
    });
  }

  // Reverse to get chronological order for sparklines
  for (const slug of Object.keys(assessmentsBySlug)) {
    assessmentsBySlug[slug].responses.reverse();
  }

  const interpretationTone = (interp: string | null): "success" | "warning" | "danger" | "neutral" => {
    if (!interp) return "neutral";
    const lower = interp.toLowerCase();
    if (lower.includes("severe") || lower.includes("high")) return "danger";
    if (lower.includes("moderate") || lower.includes("mild")) return "warning";
    if (lower.includes("none") || lower.includes("minimal") || lower.includes("normal") || lower.includes("low"))
      return "success";
    return "neutral";
  };

  return (
    <div className="space-y-8">
      {/* ── Assessment scores section ────────────────────── */}
      <section>
        <h2 className="font-display text-xl text-text tracking-tight mb-4">
          Assessment Scores
        </h2>

        {Object.keys(assessmentsBySlug).length === 0 ? (
          <Card tone="outlined">
            <CardContent className="pt-5 pb-5 text-center">
              <p className="text-sm text-text-muted">
                No assessment responses recorded yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {Object.entries(assessmentsBySlug).map(([slug, data]) => {
              const latest = data.responses[data.responses.length - 1];
              const scores = data.responses
                .map((r) => r.score)
                .filter((s): s is number => s !== null);

              return (
                <Card key={slug} tone="raised">
                  <CardContent className="pt-5 pb-5">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-display text-lg font-medium text-text">
                            {data.title}
                          </h3>
                          {latest?.interpretation && (
                            <Badge tone={interpretationTone(latest.interpretation)}>
                              {latest.interpretation}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                          {latest?.score !== null && latest?.score !== undefined && (
                            <span className="font-display text-2xl text-text tabular-nums">
                              {latest.score}
                            </span>
                          )}
                          <span className="text-xs text-text-subtle">
                            Latest &middot; {formatDate(latest?.date)}
                          </span>
                        </div>
                        <p className="text-xs text-text-subtle mt-1">
                          {data.responses.length} response{data.responses.length !== 1 ? "s" : ""} recorded
                        </p>
                      </div>

                      {/* Sparkline trend */}
                      {scores.length >= 2 && (
                        <div className="shrink-0">
                          <Sparkline
                            data={scores}
                            width={180}
                            height={48}
                          />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Lab documents section ────────────────────────── */}
      <section>
        <h2 className="font-display text-xl text-text tracking-tight mb-4">
          Lab Documents
        </h2>

        {labDocuments.length === 0 ? (
          <Card tone="outlined">
            <CardContent className="pt-5 pb-5 text-center">
              <p className="text-sm text-text-muted">
                No lab documents uploaded yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {labDocuments.map((doc) => (
              <Card key={doc.id} tone="raised" className="card-hover">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge tone="accent">lab</Badge>
                        {doc.aiClassified ? (
                          <Badge tone="success">AI classified</Badge>
                        ) : doc.needsReview ? (
                          <Badge tone="warning">Needs review</Badge>
                        ) : (
                          <Badge tone="neutral">Pending</Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium text-text truncate">
                        {doc.originalName}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">
                        {doc.mimeType} &middot; {formatFileSize(doc.sizeBytes)}
                      </p>
                      {doc.tags.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {doc.tags.map((tag: string) => (
                            <span
                              key={tag}
                              className="text-[10px] text-text-subtle bg-surface-muted px-2 py-0.5 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-text-subtle tabular-nums shrink-0 text-right">
                      <span className="font-display">{formatDate(doc.createdAt)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Notes tab
   ═══════════════════════════════════════════════════════════════════ */

function NotesTab({
  notes,
  patientId,
  startVisitAction,
  scribeProcessing = false,
}: {
  notes: any[];
  patientId: string;
  startVisitAction: () => Promise<void>;
  scribeProcessing?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-xl text-text tracking-tight">
          Clinical Notes
        </h2>
        <form action={startVisitAction}>
          <Button type="submit" size="sm">
            Draft a note
          </Button>
        </form>
      </div>

      {scribeProcessing && notes.length === 0 && (
        <Card tone="raised" className="border-l-4 border-l-accent">
          <CardContent className="py-5">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0" />
              <div>
                <p className="text-sm font-medium text-text">
                  The scribe is drafting your note...
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  This takes 10–30 seconds. Refresh this page in a moment — the draft will appear here.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {notes.length === 0 && !scribeProcessing ? (
        <EmptyState
          title="No clinical notes yet"
          description="Start a visit to generate the first draft. The AI scribe will create structured notes from the encounter."
        />
      ) : notes.length === 0 ? null : (
        <div className="space-y-3">
          {notes.map((note) => (
            <Link
              key={note.id}
              href={`/clinic/patients/${patientId}/notes/${note.id}`}
              className="block"
            >
              <Card tone="raised" className="card-hover">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Badge
                          tone={
                            note.status === "finalized"
                              ? "success"
                              : note.status === "needs_review"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {note.status}
                        </Badge>
                        {note.aiDrafted && (
                          <Badge tone="highlight">AI Draft</Badge>
                        )}
                        {note.aiDrafted && note.aiConfidence !== null && (
                          <span className="text-[11px] text-text-subtle tabular-nums">
                            {Math.round(note.aiConfidence * 100)}% confidence
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-text">
                        {note.encounter.modality} visit note
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">
                        {note.encounter.reason ?? "General visit"} &middot;{" "}
                        {formatDate(note.encounter.scheduledFor ?? note.encounter.createdAt)}
                      </p>
                      {/* Preview first block for finalized notes */}
                      {note.status === "finalized" &&
                        Array.isArray(note.blocks) &&
                        note.blocks.length > 0 && (
                          <p className="text-xs text-text-subtle mt-2 line-clamp-2">
                            {(note.blocks[0] as any).heading}:{" "}
                            {(note.blocks[0] as any).body?.slice(0, 120)}
                          </p>
                        )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-display text-xs text-text-subtle tabular-nums">
                        {formatDate(note.createdAt)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Cannabis Rx tab
   ═══════════════════════════════════════════════════════════════════ */

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  oil: "Oil",
  tincture: "Tincture",
  capsule: "Capsule",
  flower: "Flower",
  vape_cartridge: "Vape",
  edible: "Edible",
  topical: "Topical",
  suppository: "Suppository",
  spray: "Spray",
  other: "Other",
};

const ROUTE_LABELS: Record<string, string> = {
  oral: "Oral",
  sublingual: "Sublingual",
  inhalation: "Inhalation",
  topical: "Topical",
  rectal: "Rectal",
  vaginal: "Vaginal",
};

function formatRatio(thc: number | null, cbd: number | null): string | null {
  if (thc == null || cbd == null || (thc === 0 && cbd === 0)) return null;
  if (cbd === 0) return `${thc}:0 THC:CBD`;
  if (thc === 0) return `0:${cbd} THC:CBD`;
  // Normalize to smallest
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(Math.round(thc * 10), Math.round(cbd * 10));
  const r1 = Math.round((thc * 10) / d);
  const r2 = Math.round((cbd * 10) / d);
  return `${r1}:${r2}`;
}

function CannabisRxTab({
  regimens,
  doseLogs,
  products,
  medications,
  patientId,
}: {
  regimens: any[];
  doseLogs: any[];
  products: any[];
  medications: any[];
  patientId: string;
}) {
  const activeRegimens = regimens.filter((r) => r.active);
  const inactiveRegimens = regimens.filter((r) => !r.active);

  // Daily totals across active regimens
  const totalThcPerDay = activeRegimens.reduce(
    (sum: number, r: any) => sum + (r.calculatedThcMgPerDay ?? 0),
    0
  );
  const totalCbdPerDay = activeRegimens.reduce(
    (sum: number, r: any) => sum + (r.calculatedCbdMgPerDay ?? 0),
    0
  );

  // Extract cannabinoids from active regimens
  const cannabinoids = new Set<string>();
  for (const regimen of activeRegimens) {
    const product = regimen.product;
    if (product) {
      if (product.thcConcentration && product.thcConcentration > 0) cannabinoids.add("THC");
      if (product.cbdConcentration && product.cbdConcentration > 0) cannabinoids.add("CBD");
      if (product.cbnConcentration && product.cbnConcentration > 0) cannabinoids.add("CBN");
      if (product.cbgConcentration && product.cbgConcentration > 0) cannabinoids.add("CBG");
    }
  }

  // Check interactions between patient medications and cannabinoids
  const medNames = medications.map((m: any) => m.name);
  const interactions = checkInteractions(medNames, Array.from(cannabinoids));
  const redInteractions = interactions.filter((i) => i.severity === "red");
  const yellowInteractions = interactions.filter((i) => i.severity === "yellow");
  const greenInteractions = interactions.filter((i) => i.severity === "green");

  if (regimens.length === 0 && doseLogs.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-xl text-text tracking-tight">
            Cannabis Rx
          </h2>
          <Link href={`/clinic/patients/${patientId}/prescribe`}>
            <Button variant="primary" size="sm">
              New prescription
            </Button>
          </Link>
        </div>
        <EmptyState
          title="No cannabis prescriptions on file"
          description="Create one to begin structured dosing. You can select from your organization's product formulary and set precise mg-based regimens."
        />

        {/* Still show formulary even with no regimens */}
        {products.length > 0 && (
          <ProductFormulary products={products} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-xl text-text tracking-tight">
          Cannabis Rx
        </h2>
        <Link href={`/clinic/patients/${patientId}/prescribe`}>
          <Button variant="primary" size="sm">
            New prescription
          </Button>
        </Link>
      </div>

      {/* ── Daily dosing summary ──────────────────────────── */}
      {activeRegimens.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricTile
            label="Total THC / day"
            value={`${totalThcPerDay.toFixed(1)} mg`}
            accent="forest"
            hint="Sum across all active regimens"
          />
          <MetricTile
            label="Total CBD / day"
            value={`${totalCbdPerDay.toFixed(1)} mg`}
            accent="amber"
            hint="Sum across all active regimens"
          />
          <MetricTile
            label="Active regimens"
            value={activeRegimens.length}
            accent="none"
            hint={inactiveRegimens.length > 0 ? `${inactiveRegimens.length} discontinued` : undefined}
          />
        </div>
      )}

      {/* ── Drug interaction check ──────────────────────────── */}
      {interactions.length > 0 && (
        <section>
          {/* Red alert banner */}
          {redInteractions.length > 0 && (
            <div className="rounded-xl border-2 border-red-300 bg-red-50 p-5 mb-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--danger)] text-white text-xs font-bold" aria-hidden="true">!</span>
                <h3 className="font-display text-lg font-medium text-danger tracking-tight">
                  Drug Interaction Alert
                </h3>
              </div>
              <div className="space-y-3">
                {redInteractions.map((interaction, i) => (
                  <div key={`red-${i}`} className="rounded-lg bg-white/70 border border-red-200 p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="font-medium text-text text-sm">
                        {interaction.drug.charAt(0).toUpperCase() + interaction.drug.slice(1)} + {interaction.cannabinoid}
                      </p>
                      <InteractionBadge severity="red" />
                    </div>
                    <p className="text-sm text-text-muted leading-relaxed mb-1.5">
                      {interaction.mechanism}
                    </p>
                    <p className="text-xs text-danger font-medium">
                      {interaction.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Yellow and green interactions */}
          {(yellowInteractions.length > 0 || greenInteractions.length > 0) && (
            <Card tone="raised" className="mb-4">
              <CardHeader>
                <CardTitle className="text-base">
                  Interaction check
                </CardTitle>
                <CardDescription>
                  {medications.length} medication{medications.length !== 1 ? "s" : ""} checked against {cannabinoids.size} cannabinoid{cannabinoids.size !== 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y divide-border/50">
                  {yellowInteractions.map((interaction, i) => (
                    <div key={`yellow-${i}`} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <p className="font-medium text-text text-sm">
                          {interaction.drug.charAt(0).toUpperCase() + interaction.drug.slice(1)} + {interaction.cannabinoid}
                        </p>
                        <InteractionBadge severity="yellow" />
                      </div>
                      <p className="text-sm text-text-muted leading-relaxed mb-1">
                        {interaction.mechanism}
                      </p>
                      <p className="text-xs text-[color:var(--highlight-hover)] font-medium">
                        {interaction.recommendation}
                      </p>
                    </div>
                  ))}
                  {greenInteractions.map((interaction, i) => (
                    <div key={`green-${i}`} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <p className="font-medium text-text text-sm">
                          {interaction.drug.charAt(0).toUpperCase() + interaction.drug.slice(1)} + {interaction.cannabinoid}
                        </p>
                        <InteractionBadge severity="green" />
                      </div>
                      <p className="text-sm text-text-muted leading-relaxed">
                        {interaction.mechanism}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {/* ── Active regimen cards ──────────────────────────── */}
      {activeRegimens.length > 0 && (
        <section>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent mb-3">
            Active regimens
          </p>
          <div className="space-y-4">
            {activeRegimens.map((regimen: any) => (
              <RegimenCard key={regimen.id} regimen={regimen} />
            ))}
          </div>
        </section>
      )}

      {/* ── Discontinued regimens (collapsed) ─────────────── */}
      {inactiveRegimens.length > 0 && (
        <section>
          <details className="group">
            <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.16em] text-text-subtle mb-3 select-none hover:text-text transition-colors">
              Discontinued regimens ({inactiveRegimens.length})
              <span className="ml-1 text-[10px] group-open:rotate-90 inline-block transition-transform">&rsaquo;</span>
            </summary>
            <div className="space-y-4">
              {inactiveRegimens.map((regimen: any) => (
                <RegimenCard key={regimen.id} regimen={regimen} />
              ))}
            </div>
          </details>
        </section>
      )}

      {/* ── Recent dose logs ──────────────────────────────── */}
      {doseLogs.length > 0 && (
        <section>
          <h3 className="font-display text-lg text-text tracking-tight mb-4">
            Recent dose logs
          </h3>
          <Card tone="raised">
            <CardContent className="pt-0 pb-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="text-left py-3 pr-4 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                        Date
                      </th>
                      <th className="text-left py-3 pr-4 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                        Product
                      </th>
                      <th className="text-right py-3 pr-4 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                        Volume
                      </th>
                      <th className="text-right py-3 pr-4 text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
                        THC mg
                      </th>
                      <th className="text-right py-3 pr-4 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--highlight)]">
                        CBD mg
                      </th>
                      <th className="text-left py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {doseLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-surface-muted/40 transition-colors">
                        <td className="py-3 pr-4 text-text-muted tabular-nums whitespace-nowrap font-display text-xs">
                          {formatDate(log.loggedAt)}
                        </td>
                        <td className="py-3 pr-4 text-text text-sm">
                          {log.regimen?.product?.name ?? "Unknown"}
                        </td>
                        <td className="py-3 pr-4 text-right text-text tabular-nums">
                          {log.actualVolume} {log.volumeUnit}
                        </td>
                        <td className="py-3 pr-4 text-right text-accent font-medium tabular-nums">
                          {log.estimatedThcMg != null ? log.estimatedThcMg.toFixed(1) : "—"}
                        </td>
                        <td className="py-3 pr-4 text-right text-[color:var(--highlight)] font-medium tabular-nums">
                          {log.estimatedCbdMg != null ? log.estimatedCbdMg.toFixed(1) : "—"}
                        </td>
                        <td className="py-3 text-text-muted text-xs max-w-[200px] truncate">
                          {log.note || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Product formulary (collapsed) ─────────────────── */}
      {products.length > 0 && (
        <ProductFormulary products={products} />
      )}
    </div>
  );
}

function RegimenCard({ regimen }: { regimen: any }) {
  const product = regimen.product;
  const ratio = formatRatio(
    regimen.calculatedThcMgPerDose,
    regimen.calculatedCbdMgPerDose
  );

  return (
    <Card tone="raised" className="card-hover">
      <CardContent className="pt-6 pb-6">
        <div className="flex flex-col gap-4">
          {/* ── Top row: product info + badges ──────────── */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                {product && (
                  <Badge tone="accent">
                    {PRODUCT_TYPE_LABELS[product.productType] ?? product.productType}
                  </Badge>
                )}
                {ratio && (
                  <Badge tone="highlight">
                    {ratio}
                  </Badge>
                )}
                {regimen.active ? (
                  <Badge tone="success">Active</Badge>
                ) : (
                  <Badge tone="neutral">Discontinued</Badge>
                )}
                {product?.route && (
                  <Badge tone="neutral">
                    {ROUTE_LABELS[product.route] ?? product.route}
                  </Badge>
                )}
              </div>
              <h4 className="font-display text-lg font-medium text-text tracking-tight">
                {product?.name ?? "Unknown product"}
              </h4>
              {product?.brand && (
                <p className="text-sm text-text-muted">{product.brand}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="secondary" size="sm">
                Edit
              </Button>
              {regimen.active && (
                <Button variant="ghost" size="sm">
                  Discontinue
                </Button>
              )}
            </div>
          </div>

          {/* ── Dosing details grid ────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1">
                Per dose
              </p>
              <p className="text-sm text-text font-medium tabular-nums">
                {regimen.volumePerDose} {regimen.volumeUnit}
              </p>
              <p className="text-xs text-text-muted tabular-nums mt-0.5">
                <span className="text-accent">{regimen.calculatedThcMgPerDose?.toFixed(1) ?? "—"} mg THC</span>
                {" + "}
                <span className="text-[color:var(--highlight)]">{regimen.calculatedCbdMgPerDose?.toFixed(1) ?? "—"} mg CBD</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1">
                Per day
              </p>
              <p className="text-sm text-text font-medium tabular-nums">
                {regimen.frequencyPerDay}x daily
              </p>
              <p className="text-xs text-text-muted tabular-nums mt-0.5">
                <span className="text-accent">{regimen.calculatedThcMgPerDay?.toFixed(1) ?? "—"} mg THC</span>
                {" + "}
                <span className="text-[color:var(--highlight)]">{regimen.calculatedCbdMgPerDay?.toFixed(1) ?? "—"} mg CBD</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1">
                Timing
              </p>
              <p className="text-sm text-text-muted">
                {regimen.timingInstructions ?? "As directed"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1">
                Start date
              </p>
              <p className="text-sm text-text-muted font-display tabular-nums">
                {formatDate(regimen.startDate)}
              </p>
              {regimen.endDate && (
                <p className="text-xs text-text-subtle mt-0.5">
                  End: {formatDate(regimen.endDate)}
                </p>
              )}
            </div>
          </div>

          {/* ── Patient instructions callout ───────────── */}
          {regimen.patientInstructions && (
            <div className="rounded-lg bg-accent-soft border border-accent/15 px-4 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <LeafSprig size={14} className="text-accent/70" />
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
                  Patient instructions
                </p>
              </div>
              <p className="text-sm text-text leading-relaxed">
                {regimen.patientInstructions}
              </p>
            </div>
          )}

          {/* ── Clinician notes ────────────────────────── */}
          {regimen.clinicianNotes && (
            <div className="rounded-lg bg-surface-muted/60 border border-border/50 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1.5">
                Clinician notes
              </p>
              <p className="text-sm text-text-muted leading-relaxed">
                {regimen.clinicianNotes}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProductFormulary({ products }: { products: any[] }) {
  return (
    <section>
      <details className="group">
        <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.16em] text-text-subtle mb-3 select-none hover:text-text transition-colors">
          Available products ({products.length})
          <span className="ml-1 text-[10px] group-open:rotate-90 inline-block transition-transform">&rsaquo;</span>
        </summary>
        <div className="grid gap-3">
          {products.map((product: any) => {
            const ratio = formatRatio(
              product.thcConcentration,
              product.cbdConcentration
            );
            return (
              <Card key={product.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge tone="accent">
                          {PRODUCT_TYPE_LABELS[product.productType] ?? product.productType}
                        </Badge>
                        {ratio && (
                          <Badge tone="highlight">{ratio}</Badge>
                        )}
                        {product.route && (
                          <Badge tone="neutral">
                            {ROUTE_LABELS[product.route] ?? product.route}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium text-text">
                        {product.name}
                      </p>
                      {product.brand && (
                        <p className="text-xs text-text-muted mt-0.5">
                          {product.brand}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      {product.thcConcentration != null && (
                        <p className="text-xs tabular-nums">
                          <span className="text-accent font-medium">{product.thcConcentration} {product.concentrationUnit ?? "mg/mL"}</span>
                          <span className="text-text-subtle"> THC</span>
                        </p>
                      )}
                      {product.cbdConcentration != null && (
                        <p className="text-xs tabular-nums">
                          <span className="text-[color:var(--highlight)] font-medium">{product.cbdConcentration} {product.concentrationUnit ?? "mg/mL"}</span>
                          <span className="text-text-subtle"> CBD</span>
                        </p>
                      )}
                      {product.unitSize && (
                        <p className="text-[11px] text-text-subtle tabular-nums">
                          {product.unitSize}
                        </p>
                      )}
                    </div>
                  </div>
                  {product.description && (
                    <p className="text-xs text-text-subtle mt-2 leading-relaxed">
                      {product.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </details>
    </section>
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
