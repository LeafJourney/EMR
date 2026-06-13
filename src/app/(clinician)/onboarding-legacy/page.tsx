// Guided onboarding wizard for new clinics. Captures clinic info, NPI numbers,
// and preferred state cannabis registries in a three-step form.

import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { OnboardingWizard } from "./OnboardingWizard";

export const metadata = {
  title: "Clinic onboarding",
  description:
    "Set up your clinic on Leafjourney — basic info, NPI numbers, and state cannabis registries.",
};

export default function OnboardingPage() {
  return (
    <PageShell maxWidth="max-w-[960px]">
      <PageHeader
        eyebrow="Welcome"
        title="Set up your clinic"
        description="Three quick steps. We use this to credential your providers, route patients legally, and file claims under the right billing entity."
      />
      <OnboardingWizard />
    </PageShell>
  );
}
