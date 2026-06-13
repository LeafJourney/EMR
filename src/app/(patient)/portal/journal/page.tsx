import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { JournalView } from "./journal-view";
import { SampleBadge } from "@/components/patient/sample-badge";
import type { JournalEntry } from "@/lib/domain/journal-community";

export const metadata = { title: "Wellness Journal" };

function buildDemoEntries(patientId: string): JournalEntry[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return [
    {
      id: "j-1",
      patientId,
      mood: "🌱",
      body:
        "Tried the 1:1 tincture about 30 minutes before bed. Felt a soft, settled calm — fell asleep without scrolling my phone for once. Hopeful this becomes a routine.",
      tags: ["sleep", "tincture", "evening"],
      isPrivate: false,
      createdAt: new Date(now - 1 * day).toISOString(),
    },
    {
      id: "j-2",
      patientId,
      mood: "💪",
      body:
        "Lower back pain was a 6/10 this morning. Used the Papa & Barkley balm before yoga and the pain dropped to a 3 by lunchtime. Big win.",
      tags: ["pain", "topical", "movement"],
      isPrivate: true,
      createdAt: new Date(now - 3 * day).toISOString(),
    },
    {
      id: "j-3",
      patientId,
      mood: "😐",
      body:
        "Anxious before a work presentation. Microdosed a 2.5mg gummy and felt slightly more centered, but still some racing thoughts. Want to talk to my care team about whether to bump the dose.",
      tags: ["anxiety", "edible", "work"],
      isPrivate: true,
      createdAt: new Date(now - 5 * day).toISOString(),
    },
    {
      id: "j-4",
      patientId,
      mood: "🙏",
      body:
        "First week on the new dosing plan. Sleep is more consistent and pain flare-ups are shorter. Grateful to have something that actually feels designed for me.",
      tags: ["reflection", "milestone"],
      isPrivate: false,
      createdAt: new Date(now - 8 * day).toISOString(),
    },
  ];
}

export default async function JournalPage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!patient) redirect("/portal/intake");

  const entries = buildDemoEntries(patient.id);

  return (
    <PageShell maxWidth="max-w-[860px]">
      <PageHeader
        eyebrow="My Journey"
        title="Your wellness journal"
        description="A quiet, private space to reflect on how cannabis is fitting into your life."
      />
      <PatientSectionNav section="journey" />
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <SampleBadge />
        <p className="text-xs text-text-muted">
          These example entries show how journaling works — they aren&apos;t saved yet.
        </p>
      </div>
      <JournalView initialEntries={entries} patientId={patient.id} />
    </PageShell>
  );
}
