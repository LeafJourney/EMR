import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EditorialRule } from "@/components/ui/ornament";
import { IntakeForm } from "./intake-form";

export const metadata = { title: "Intake" };

/* ---------- Step indicator ---------- */

const STEPS = [
  { label: "About you", description: "Presenting concerns" },
  { label: "Cannabis history", description: "Prior use & formats" },
  { label: "Goals", description: "Treatment goals" },
] as const;

function StepIndicator() {
  return (
    <div className="flex items-center justify-center mb-10">
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center">
            {/* Step node */}
            <div className="flex flex-col items-center text-center">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-accent text-accent-ink text-xs font-semibold shadow-sm">
                {i + 1}
              </div>
              <p className="text-xs font-medium text-text mt-2 whitespace-nowrap">
                {step.label}
              </p>
              <p className="text-[10px] text-text-subtle mt-0.5 whitespace-nowrap">
                {step.description}
              </p>
            </div>

            {/* Connector line (not after last step) */}
            {i < STEPS.length - 1 && (
              <div className="w-16 md:w-24 h-px bg-gradient-to-r from-accent/40 via-border-strong/60 to-accent/40 mx-3 mt-[-22px]" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default async function IntakePage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    include: { chartSummary: true },
  });
  if (!patient) redirect("/portal");

  // EMR-1114 (PJ-2): surface what registration already captured so the
  // patient never re-types contact/insurance details here, and so we can
  // point her back to registration if it's unfinished.
  const intakeAnswers =
    (patient.intakeAnswers as Record<string, unknown> | null) ?? null;
  const registrationComplete = Boolean(intakeAnswers?.registrationCompletedAt);
  const coverage =
    intakeAnswers?.selfPay === true
      ? "Self-pay"
      : typeof intakeAnswers?.insurancePayer === "string" &&
          intakeAnswers.insurancePayer
        ? `${intakeAnswers.insurancePayer}${
            typeof intakeAnswers?.insuranceMemberId === "string" &&
            intakeAnswers.insuranceMemberId
              ? ` · member ${intakeAnswers.insuranceMemberId}`
              : ""
          }`
        : null;
  const knownDetails: Array<{ label: string; value: string | null }> = [
    {
      label: "Name",
      value:
        [patient.firstName, patient.lastName].filter(Boolean).join(" ") || null,
    },
    {
      label: "Date of birth",
      value: patient.dateOfBirth
        ? patient.dateOfBirth.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })
        : null,
    },
    { label: "Email", value: patient.email },
    { label: "Phone", value: patient.phone },
    {
      label: "Address",
      value:
        [patient.addressLine1, patient.city, patient.state, patient.postalCode]
          .filter(Boolean)
          .join(", ") || null,
    },
    { label: "Coverage", value: coverage },
  ];

  return (
    <PageShell maxWidth="max-w-[880px]">
      <PatientSectionNav section="account" />
      <PageHeader
        eyebrow="Intake"
        title="A few things about your care"
        description="This helps your care team arrive prepared and focus the visit on what matters to you."
        actions={
          patient.chartSummary && (
            <Badge
              tone={
                patient.chartSummary.completenessScore >= 80
                  ? "success"
                  : "warning"
              }
            >
              {patient.chartSummary.completenessScore}% complete
            </Badge>
          )
        }
      />

      {/* Step indicator */}
      <StepIndicator />

      {/* ---------- Auto-populated context from registration ---------- */}
      <Card tone="ambient" className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Your details, already on file</CardTitle>
              <CardDescription>
                {registrationComplete
                  ? "Pre-filled from your registration — no need to re-type anything here."
                  : "We pre-fill what we can. Finish registration to complete contact, insurance and consents."}
              </CardDescription>
            </div>
            <Link
              href="/portal/registration"
              className="text-sm text-accent hover:underline whitespace-nowrap"
            >
              {registrationComplete ? "Update details" : "Finish registration"}
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {knownDetails.map((d) => (
              <div key={d.label} className="flex items-baseline gap-2 min-w-0">
                <dt className="text-xs uppercase tracking-wide text-text-subtle w-24 shrink-0">
                  {d.label}
                </dt>
                <dd
                  className={
                    d.value
                      ? "text-sm text-text truncate"
                      : "text-sm text-text-subtle italic"
                  }
                >
                  {d.value ?? "Not on file yet"}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* ---------- Section 1: About you ---------- */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-accent/10 text-accent text-[11px] font-semibold border border-accent/20">
              1
            </span>
            <div>
              <CardTitle>About you</CardTitle>
              <CardDescription>
                What brings you in and what you&apos;d like to get from care.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <IntakeForm
            initial={{
              presentingConcerns: patient.presentingConcerns ?? "",
              treatmentGoals: patient.treatmentGoals ?? "",
              priorUse:
                ((patient.cannabisHistory as any)?.priorUse as
                  | boolean
                  | undefined) ?? false,
              formats:
                (
                  (patient.cannabisHistory as any)?.formats as
                    | string[]
                    | undefined
                )?.join(", ") ?? "",
              reportedBenefits:
                (
                  (patient.cannabisHistory as any)?.reportedBenefits as
                    | string[]
                    | undefined
                )?.join(", ") ?? "",
            }}
            registrationComplete={registrationComplete}
          />
        </CardContent>
      </Card>

      {/* ---------- Divider: Cannabis history ---------- */}
      <EditorialRule className="my-8" />

      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-3 mb-1">
          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-accent/10 text-accent text-[11px] font-semibold border border-accent/20">
            2
          </span>
          <p className="text-sm font-medium text-text">Cannabis history</p>
        </div>
        <p className="text-xs text-text-muted">
          Captured in the form above &mdash; share as much or as little as
          you&apos;re comfortable with.
        </p>
      </div>

      {/* ---------- Divider: Goals ---------- */}
      <EditorialRule className="my-8" />

      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-3 mb-1">
          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-accent/10 text-accent text-[11px] font-semibold border border-accent/20">
            3
          </span>
          <p className="text-sm font-medium text-text">Treatment goals</p>
        </div>
        <p className="text-xs text-text-muted">
          Your goals are captured above. They help your care team measure
          what&apos;s working.
        </p>
      </div>

      {/* ---------- Chart summary (generated) ---------- */}
      {patient.chartSummary && (
        <>
          <EditorialRule className="my-8" />

          <Card>
            <CardHeader>
              <CardTitle>What your care team will see</CardTitle>
              <CardDescription>
                Generated from your intake. Reviewed by your clinician before
                every visit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose-clinical whitespace-pre-wrap">
                {patient.chartSummary.summaryMd}
              </div>
              {patient.chartSummary.missingFields.length > 0 && (
                <div className="mt-6 p-4 rounded-md bg-accent-soft border border-accent/20">
                  <p className="text-xs font-medium uppercase tracking-wide text-accent mb-2">
                    Still needed
                  </p>
                  <ul className="text-sm text-text-muted list-disc pl-5 space-y-1">
                    {patient.chartSummary.missingFields.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
