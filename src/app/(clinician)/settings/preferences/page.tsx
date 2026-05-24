/**
 * /settings/preferences — unified clinician personalization page.
 *
 * Server-rendered shell with a single client island (`PreferencesClient`)
 * that owns all interactive state. Auth gating mirrors the parent
 * `(clinician)` layout: any clinic-floor role can configure their own
 * preferences.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { PreferencesClient } from "./preferences-client";

export const metadata = { title: "Preferences" };

const CLINIC_FLOOR_ROLES = [
  "clinician",
  "midlevel",
  "back_office",
  "front_office",
  "practice_owner",
] as const;

export default async function PreferencesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (
    !user.roles.some((r) =>
      (CLINIC_FLOOR_ROLES as readonly string[]).includes(r),
    )
  ) {
    redirect("/");
  }

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Account"
        title="Preferences"
        description="Personalize your clinic workspace. Changes save instantly to this browser."
      />
      <PreferencesClient />
    </PageShell>
  );
}
