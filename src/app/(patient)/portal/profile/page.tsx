import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { EditorialRule, Eyebrow } from "@/components/ui/ornament";
import { ProfileForm, type ProfileValues } from "./profile-form";
import { CommunicationPreferences } from "./communication-preferences";
import { PortalAvatarUpload } from "./portal-avatar-upload";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
  });

  if (!patient) {
    redirect("/portal/intake");
  }

  const intake = (patient.intakeAnswers as Record<string, unknown>) ?? {};

  const initial: ProfileValues = {
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth
      ? patient.dateOfBirth.toISOString().slice(0, 10)
      : "",
    email: patient.email ?? "",
    phone: patient.phone ?? "",
    addressLine1: patient.addressLine1 ?? "",
    addressLine2: patient.addressLine2 ?? "",
    city: patient.city ?? "",
    state: patient.state ?? "",
    postalCode: patient.postalCode ?? "",
    sex: (intake.sex as string) ?? "",
    race: (intake.race as string) ?? "",
    maritalStatus: (intake.maritalStatus as string) ?? "",
    uniqueThing: (intake.uniqueThing as string) ?? "",
  };

  // Calculate age for display
  let age: string | null = null;
  if (patient.dateOfBirth) {
    const dob = patient.dateOfBirth;
    const today = new Date();
    let years = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      years--;
    }
    age = `${years} years old`;
  }

  return (
    <PageShell maxWidth="max-w-[880px]">
      <PageHeader
        eyebrow="Profile"
        title="Your demographics"
        description="View and update your personal information. This stays with your chart and helps your care team know you better."
      />

      <PatientSectionNav section="account" />
      {/* ---- Avatar upload ---- */}
      <div className="flex justify-center mb-8">
        <PortalAvatarUpload
          initials={`${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`.toUpperCase()}
          initialSrc={(intake.photoUrl as string) ?? null}
        />
      </div>


      <EditorialRule className="mb-8" />

      {/* ---- Medical Life Number ---- */}
      <Card tone="ambient" className="mb-8">
        <CardContent className="py-6 px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Eyebrow className="mb-2">Your Medical Life Number</Eyebrow>
            <p className="text-sm text-text-muted leading-relaxed max-w-md">
              A lifelong identifier that travels with you. Share it with any provider
              in the network for instant chart access.
            </p>
          </div>
          <div className="shrink-0 bg-surface-raised border border-border rounded-lg px-5 py-3 shadow-sm">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1">
              MLN
            </p>
            <p className="font-mono text-lg text-accent font-semibold tracking-wider">
              {patient.id}
            </p>
          </div>
        </CardContent>
      </Card>

      <EditorialRule className="mb-8" />

      {/* ---- Profile form ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
          <CardDescription>
            Update any field below and save. Changes are reflected immediately in your chart.
            {age && (
              <span className="ml-2 text-accent font-medium">
                ({age})
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm initial={initial} />
        </CardContent>
      </Card>

      <CommunicationPreferences />
    </PageShell>
  );
}
