import React, { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/ornament";
import { isLocalDemoUserId } from "@/lib/auth/local-demo";
import { OnboardingTour } from "@/components/ui/onboarding-tour";
import { WellnessTipWidget } from "@/components/ui/wellness-tip-widget";
import { QuickSymptomFab } from "@/components/ui/quick-symptom-fab";
import { VitalsCard } from "@/components/patient/vitals-card";
import { HealthRoadmap } from "@/components/patient/health-roadmap";
import { PositiveInputPrompt } from "@/components/patient/positive-input-prompt";
import { DicomViewer } from "@/components/dicom/dicom-viewer";
import { ContinuePanel } from "@/components/portal/continue-panel";
import { withTimeout } from "@/lib/utils/with-timeout";
import {
  HeroGreetingWidget,
  HeroGreetingSkeleton,
  SparklinesWidget,
  SparklinesSkeleton,
  RhythmsWidget,
  RhythmsSkeleton,
  CannabisNextVisitMoodWidget,
  CannabisNextVisitMoodSkeleton,
  PlantTasksWidget,
  PlantTasksSkeleton,
  BadgeShowcaseWidget,
  BadgeShowcaseSkeleton,
} from "./widgets";

export const metadata = { title: "Home" };

export default async function PatientHome() {
  const user = await requireRole("patient");
  const isLocalDemo = isLocalDemoUserId(user.id);

  const patientExists = isLocalDemo
    ? true
    : await withTimeout<any>(
        prisma.patient.findUnique({
          where: { userId: user.id },
          select: {
            id: true,
            presentingConcerns: true,
            intakeAnswers: true,
            _count: { select: { signedConsents: true } },
          },
        }),
        5000,
        "TIMEOUT" as const
      );


  if (patientExists === "TIMEOUT") {
    return (
      <PageShell maxWidth="max-w-[1040px]">
        <div className="py-16 text-center">
          <Eyebrow className="mb-4 justify-center">Taking a moment</Eyebrow>
          <h1 className="font-display text-2xl md:text-3xl text-text tracking-tight mb-3">
            Your dashboard is loading slowly.
          </h1>
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed mb-8">
            We couldn&apos;t fetch your chart in time. This is almost always a
            temporary network hiccup — please retry.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/portal">
              <Button size="lg">Retry</Button>
            </Link>
            <Link href="/portal/garden">
              <Button size="lg" variant="secondary">Go to My Garden</Button>
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!patientExists) {
    return (
      <PageShell maxWidth="max-w-[1040px]">
        <div className="py-24 text-center">
          <Eyebrow className="mb-4 justify-center">Welcome</Eyebrow>
          <h1 className="font-display text-2xl md:text-3xl text-text tracking-tight mb-3">
            Your account is created.
          </h1>
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed mb-4">
            We couldn&apos;t find an active patient record linked to your email
            yet. That usually means your clinic hasn&apos;t connected your
            chart to this account.
          </p>
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">
            Please ask your clinic for an invitation, or check your email for
            an invitation link from them and sign in with the same address it
            was sent to. Once your chart is linked, everything will appear
            here automatically.
          </p>
        </div>
      </PageShell>
    );
  }

  // ── EMR-1114 (PJ-M5): guided onboarding ──
  // The registration packet stamps intakeAnswers.registrationCompletedAt
  // (portal/registration/actions.ts); intake fills presentingConcerns;
  // consents persist as SignedConsent rows (registration or portal).
  const patientRecord =
    !isLocalDemo && patientExists && patientExists !== "TIMEOUT"
      ? patientExists
      : null;
  const intakeAnswers =
    (patientRecord?.intakeAnswers as Record<string, unknown> | null) ?? null;
  const setupSteps = [
    {
      label: "Registration",
      detail: "Contact, insurance & core consents",
      href: "/portal/registration",
      done: Boolean(intakeAnswers?.registrationCompletedAt),
    },
    {
      label: "Intake",
      detail: "What brings you in & your goals",
      href: "/portal/intake",
      done: Boolean(patientRecord?.presentingConcerns),
    },
    {
      label: "Consent forms",
      detail: "Review & sign for your care",
      href: "/portal/consent",
      done: (patientRecord?._count?.signedConsents ?? 0) > 0,
    },
  ];
  const needsSetup =
    patientRecord != null && setupSteps.some((s) => !s.done);

  return (
    <PageShell maxWidth="max-w-[1040px]">
      <OnboardingTour />
      <QuickSymptomFab />

      {/* ── Finish setting up your care (not dismissible by design) ── */}
      {needsSetup && (
        <Card
          tone="raised"
          className="mb-6 md:mb-8 border-l-4 border-l-accent"
        >
          <CardContent className="py-5">
            <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
              <div className="flex-1 min-w-0">
                <Eyebrow className="mb-1.5">Almost there</Eyebrow>
                <h2 className="font-display text-lg md:text-xl text-text tracking-tight mb-1">
                  Finish setting up your care
                </h2>
                <p className="text-sm text-text-muted leading-relaxed">
                  A few quick steps help your care team arrive prepared for
                  your first visit.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {setupSteps.map((step) => (
                    <li key={step.label}>
                      <Link
                        href={step.href}
                        className="group inline-flex items-center gap-2 min-h-[28px]"
                      >
                        <span
                          aria-hidden
                          className={
                            step.done
                              ? "flex items-center justify-center h-5 w-5 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-semibold"
                              : "flex items-center justify-center h-5 w-5 rounded-full border border-border-strong text-text-subtle text-[11px]"
                          }
                        >
                          {step.done ? "✓" : "○"}
                        </span>
                        <span
                          className={
                            step.done
                              ? "text-sm text-text-muted line-through decoration-text-subtle/50"
                              : "text-sm font-medium text-text group-hover:text-accent"
                          }
                        >
                          {step.label}
                        </span>
                        <span className="hidden sm:inline text-xs text-text-subtle">
                          {step.detail}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="shrink-0">
                <Link
                  href={setupSteps.find((s) => !s.done)?.href ?? "/portal/registration"}
                >
                  <Button size="lg">Continue setup</Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Hero greeting ── */}
      <Suspense fallback={<HeroGreetingSkeleton />}>
        <HeroGreetingWidget userId={user.id} />
      </Suspense>

      <ContinuePanel />

      {/* ── Symptom sparklines (kept above the fold per EMR-193) ── */}
      <Suspense fallback={<SparklinesSkeleton />}>
        <SparklinesWidget userId={user.id} />
      </Suspense>

      {/* ── Daily Vitals ── */}
      <div className="mb-6 md:mb-8">
        <VitalsCard vitals={{ heartRate: 72, bloodPressureSys: 120, bloodPressureDia: 80, respiratoryRate: 16, oxygenSaturation: 98, temperature: 98.6, lastUpdated: "Today at 9:00 AM" }} />
      </div>

      {/* ── Top row: Health grade + Lifestyle bars + AI tips ── */}
      <Suspense fallback={<RhythmsSkeleton />}>
        <RhythmsWidget userId={user.id} />
      </Suspense>

      {/* ── Second row: Cannabis module + Next visit + Mood ── */}
      <Suspense fallback={<CannabisNextVisitMoodSkeleton />}>
        <CannabisNextVisitMoodWidget userId={user.id} />
      </Suspense>

      {/* ── Wellness tip of the day ── */}
      <div className="mb-6 md:mb-8">
        <WellnessTipWidget />
      </div>

      {/* ── Fourth row: Plant + Tasks + Message ── */}
      <Suspense fallback={<PlantTasksSkeleton />}>
        <PlantTasksWidget userId={user.id} />
      </Suspense>

      {/* ── High-Level Health Roadmap ── */}
      <div className="mb-6 md:mb-8">
        <HealthRoadmap />
      </div>

      {/* ── Recent Imaging (DICOM Viewer) ── */}
      <div className="mb-6 md:mb-8">
        <Eyebrow className="mb-3">Recent Scan</Eyebrow>
        <DicomViewer 
          image={{
            id: "scan-123",
            name: "LUMBAR SPINE MRI",
            date: "Oct 24, 2023",
            modality: "MRI",
            imageUrl: "" // empty URL shows the radar mock
          }} 
        />
      </div>

      {/* ── Progress (goals, streaks, efficacy, recap) ── */}
      <div className="mb-3 mt-2">
        <Eyebrow>Your progress</Eyebrow>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 md:mb-8">
        <Link href="/portal/goals" className="block min-h-[44px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label="View Goals">
          <Card tone="ambient" className="card-hover text-center py-5">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">🎯</span>
              <p className="text-sm font-medium text-text">Goals</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/streaks" className="block min-h-[44px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label="View Streaks">
          <Card tone="ambient" className="card-hover text-center py-5 h-full">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">🔥</span>
              <p className="text-sm font-medium text-text">Streak</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/efficacy" className="block min-h-[44px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label="View Product Efficacy">
          <Card tone="ambient" className="card-hover text-center py-5 h-full">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">💚</span>
              <p className="text-sm font-medium text-text">Product efficacy</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/weekly-recap" className="block min-h-[44px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label="View Weekly Recap">
          <Card tone="ambient" className="card-hover text-center py-5 h-full">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">📰</span>
              <p className="text-sm font-medium text-text">Weekly recap</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Quick links ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href="/portal/storybook" className="block min-h-[44px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label="View My Storybook">
          <Card tone="ambient" className="card-hover text-center py-5 h-full">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">{"\uD83D\uDCD6"}</span>
              <p className="text-sm font-medium text-text">My Storybook</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/education" className="block min-h-[44px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label="View Care Guide">
          <Card tone="ambient" className="card-hover text-center py-5 h-full">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">{"\uD83D\uDCDA"}</span>
              <p className="text-sm font-medium text-text">Care Guide</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/roadmap" className="block min-h-[44px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label="View Roadmap">
          <Card tone="ambient" className="card-hover text-center py-5 h-full">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">{"\uD83D\uDDFA\uFE0F"}</span>
              <p className="text-sm font-medium text-text">Roadmap</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/medications/explainer" className="block min-h-[44px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label="View Medication Explainer">
          <Card tone="ambient" className="card-hover text-center py-5 h-full">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">{"\uD83D\uDC8A"}</span>
              <p className="text-sm font-medium text-text">Med Explainer</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Check-in Prompt ── */}
      <div className="mt-8 mb-4">
        <PositiveInputPrompt />
      </div>

      {/* ── Badges ── */}
      <Suspense fallback={<BadgeShowcaseSkeleton />}>
        <BadgeShowcaseWidget userId={user.id} />
      </Suspense>
    </PageShell>
  );
}
