import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils/format";
import {
  evaluateIntakeGate,
  type IntakeGateInput,
  type IntakeGateResult,
} from "@/lib/scheduling";

export const metadata = { title: "Intake-to-Visit Gate" };

// ---------------------------------------------------------------------------
// EMR-212 — New-Patient Intake-to-Visit Gate Pipeline.
//
// Operator view of every *requested* appointment and whether it has cleared the
// intake artifacts needed to confirm (demographics, ID/age, allergy screen,
// cannabis history, reason, consent, insurance). The gate logic itself lives in
// src/lib/scheduling/intake-gate.ts — this page is a thin rendering layer that
// builds the engine input from real patient data and shows the checklist.
// ---------------------------------------------------------------------------

function isVirtualModality(modality: string): boolean {
  return !["in_person", "in-office", "office", "in_office"].includes(modality);
}

export default async function IntakeGatePage() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const appts = await prisma.appointment.findMany({
    where: { status: "requested", patient: { organizationId: orgId, deletedAt: null } },
    orderBy: { startAt: "asc" },
    take: 100,
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          dateOfBirth: true,
          ageVerifiedAt: true,
          addressLine1: true,
          state: true,
          allergiesScreenedAt: true,
          cannabisHistory: true,
          presentingConcerns: true,
          intakeAnswers: true,
          signedConsents: {
            orderBy: { signedAt: "desc" },
            select: { templateName: true, signedAt: true },
          },
        },
      },
    },
  });

  // Primary-coverage eligibility per patient (insurance gate input).
  const patientIds = [...new Set(appts.map((a) => a.patient.id))];
  const coverages = await prisma.patientCoverage.findMany({
    where: { patientId: { in: patientIds }, type: "primary", active: true },
    select: { patientId: true, eligibilityStatus: true },
  });
  const coverageByPatient = new Map(coverages.map((c) => [c.patientId, c.eligibilityStatus]));

  const rows = appts.map((a) => {
    const p = a.patient;
    // No visitType column on Appointment — a prospect is a new patient, anyone
    // else is a follow-up. (treatmentPhase left null; the titration outcome-log
    // requirement only fires for titration/tapering follow-ups.)
    const visitType: IntakeGateInput["visitType"] =
      p.status === "prospect" ? "new_patient" : "follow_up";
    const consents = p.signedConsents;
    const input: IntakeGateInput = {
      visitType,
      treatmentPhase: null,
      patient: {
        dateOfBirth: p.dateOfBirth,
        addressLine1: p.addressLine1,
        state: p.state,
        allergiesScreenedAt: p.allergiesScreenedAt,
        cannabisHistory: p.cannabisHistory,
        presentingConcerns: p.presentingConcerns,
        intakeAnswers: p.intakeAnswers,
        ageVerifiedAt: p.ageVerifiedAt,
      },
      consent: {
        visitConsentSignedAt: consents[0]?.signedAt ?? null,
        telehealthConsentSignedAt:
          consents.find((c) => /telehealth/i.test(c.templateName))?.signedAt ?? null,
      },
      insurance: {
        coverageVerified: coverageByPatient.get(p.id) === "active",
        selfPayAttested: false,
      },
      outcomeLogsSinceLastVisit: 0,
      isVirtual: isVirtualModality(a.modality),
    };
    return {
      apptId: a.id,
      startAt: a.startAt,
      modality: a.modality,
      patient: { id: p.id, firstName: p.firstName, lastName: p.lastName },
      visitType,
      gate: evaluateIntakeGate(input),
    };
  });

  const cleared = rows.filter((r) => r.gate.allowConfirm).length;
  const blocked = rows.length - cleared;

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        title="Intake-to-Visit Gate"
        description="Requested visits and whether they've cleared the intake steps needed to confirm. Gate logic is shared with booking, waitlist fill, and the slot recommender."
      />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <SummaryTile label="Requested" value={rows.length} tone="neutral" />
        <SummaryTile label="Ready to confirm" value={cleared} tone="success" />
        <SummaryTile label="Blocked" value={blocked} tone={blocked > 0 ? "warning" : "neutral"} />
      </div>

      {rows.length === 0 ? (
        <Card tone="raised">
          <CardContent className="py-12 text-center text-text-muted text-sm">
            No requested visits awaiting intake. New booking requests will appear here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <GateCard key={r.apptId} row={r} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

interface GateRow {
  apptId: string;
  startAt: Date;
  modality: string;
  patient: { id: string; firstName: string; lastName: string };
  visitType: IntakeGateInput["visitType"];
  gate: IntakeGateResult;
}

function GateCard({ row }: { row: GateRow }) {
  const { gate } = row;
  const pct = Math.round(gate.completionPct * 100);
  return (
    <Card
      tone="raised"
      className={`border-l-4 ${gate.allowConfirm ? "border-l-success" : "border-l-[color:var(--warning)]"}`}
    >
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <Link
              href={`/clinic/patients/${row.patient.id}`}
              className="text-sm font-semibold text-text hover:text-accent transition-colors"
            >
              {row.patient.firstName} {row.patient.lastName}
            </Link>
            <p className="text-[11px] text-text-subtle mt-0.5">
              {formatDate(row.startAt)} ·{" "}
              {new Date(row.startAt).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              · {row.visitType.replace(/_/g, " ")} · {row.modality}
            </p>
          </div>
          <Badge tone={gate.allowConfirm ? "success" : "warning"} className="shrink-0 text-[10px]">
            {gate.allowConfirm ? "Ready to confirm" : "Blocked"}
          </Badge>
        </div>

        {/* Completion bar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="h-1.5 flex-1 bg-surface-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${gate.allowConfirm ? "bg-success" : "bg-accent"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-text-subtle shrink-0">{pct}%</span>
        </div>

        {gate.blockReason && (
          <p className="text-[11px] text-[color:var(--warning)] mb-3">{gate.blockReason}</p>
        )}

        {/* Requirements checklist */}
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {gate.requirements.map((req) => (
            <li key={req.id} className="flex items-center gap-2 text-xs">
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  req.satisfied
                    ? "bg-success/15 text-success"
                    : req.blocking
                      ? "bg-[color:var(--warning)]/15 text-[color:var(--warning)]"
                      : "bg-surface-muted text-text-subtle"
                }`}
                aria-hidden
              >
                {req.satisfied ? (
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M3.5 7L6 9.5L10.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className={req.satisfied ? "text-text-muted" : "text-text"}>{req.label}</span>
              {!req.satisfied && !req.blocking && (
                <span className="text-[9px] uppercase tracking-wider text-text-subtle">advisory</span>
              )}
              {!req.satisfied && req.resolveHref && (
                <Link
                  href={req.resolveHref}
                  className="text-[10px] font-medium text-accent hover:underline ml-auto shrink-0"
                >
                  Resolve
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning";
}) {
  const color =
    tone === "success" ? "text-success" : tone === "warning" ? "text-[color:var(--warning)]" : "text-text";
  return (
    <Card tone="raised">
      <CardContent className="pt-4 pb-4">
        <p className={`font-display text-2xl tabular-nums ${color}`}>{value}</p>
        <p className="text-[11px] text-text-subtle uppercase tracking-wider mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
