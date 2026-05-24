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
          select: { id: true },
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
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed mb-8">
            We couldn't find an active patient record linked to your email. If you are a patient, please use the invitation link sent by your clinic. If you are a staff member or administrator, please navigate to your console.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/admin">
              <Button size="lg">Go to Admin Console</Button>
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="max-w-[1040px]">
      <OnboardingTour />
      <QuickSymptomFab />

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
