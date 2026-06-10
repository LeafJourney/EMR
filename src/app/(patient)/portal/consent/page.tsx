import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { ConsentView } from "./consent-view";
import { canonicalTemplateId } from "./consent-aliases";
import type { SignedConsentSummary } from "./actions";

export const metadata = { title: "Consent Forms" };

export default async function ConsentPage() {
  const user = await requireRole("patient");

  // EMR-1114 (PJ-B2): hydrate from persisted signatures — including consents
  // signed during the registration packet (reg-* template ids), which map onto
  // the portal templates so they render as Signed instead of inviting a
  // duplicate signature.
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: {
      signedConsents: {
        orderBy: { signedAt: "asc" },
        select: { id: true, templateId: true, templateName: true, signedAt: true },
      },
    },
  });

  const signedConsents: SignedConsentSummary[] = (patient?.signedConsents ?? []).map(
    (c) => ({
      id: c.id,
      templateId: canonicalTemplateId(c.templateId),
      templateName: c.templateName,
      signedAt: c.signedAt.toISOString(),
    })
  );

  return (
    <PageShell maxWidth="max-w-[960px]">
      <PageHeader
        eyebrow="Consent"
        title="Consent forms"
        description="Review and sign required consent forms for your care. Your signatures are stored securely."
      />
      <PatientSectionNav section="account" />
      <ConsentView initialSignedConsents={signedConsents} />
    </PageShell>
  );
}
