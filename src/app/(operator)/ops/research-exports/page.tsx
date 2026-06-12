import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import {
  CohortPseudonymizer,
  buildCohortManifest,
  categorizePayer,
  deIdentifyPatient,
  deIdentifyClaim,
  suppressSmallCells,
  type RawPatientFacts,
  type RawClaimFacts,
} from "@/lib/billing/research-export";
import { PatientCohortTable, type PatientCohortRow } from "./patient-cohort-table";
import { ClaimCohortTable, type ClaimCohortRow } from "./claim-cohort-table";

export const metadata = { title: "Researcher Exports" };

// Stable salt for the demo cohort. In production each cohort manifest
// generates its own random salt and stores it next to the export.
const DEMO_SALT = "cohort_2026Q2_demo__salt_at_least_16_chars";

const RAW_PATIENTS: RawPatientFacts[] = [
  { patientId: "p1", dateOfBirth: new Date("1957-08-12"), sex: "female", race: "Black or African American", ethnicity: "Non-Hispanic", smokingStatus: "former", substanceHistory: null, zipCode: "80302", socioeconomicTier: "middle" },
  { patientId: "p2", dateOfBirth: new Date("1971-02-22"), sex: "male", race: "White", ethnicity: "Non-Hispanic", smokingStatus: "never", substanceHistory: "occasional alcohol", zipCode: "80303", socioeconomicTier: "middle" },
  { patientId: "p3", dateOfBirth: new Date("1986-11-30"), sex: "female", race: "Asian", ethnicity: "Non-Hispanic", smokingStatus: "never", substanceHistory: null, zipCode: "80305", socioeconomicTier: "upper" },
  { patientId: "p4", dateOfBirth: new Date("1992-04-04"), sex: "male", race: "White", ethnicity: "Hispanic", smokingStatus: "current", substanceHistory: "cannabis daily", zipCode: "80301", socioeconomicTier: "lower" },
  { patientId: "p5", dateOfBirth: new Date("1934-09-09"), sex: "female", race: "White", ethnicity: "Non-Hispanic", smokingStatus: "former", substanceHistory: null, zipCode: "03601", socioeconomicTier: "lower" }, // restricted ZIP3
];

const RAW_CLAIMS: RawClaimFacts[] = [
  { claimId: "c1", patientId: "p1", encounterId: "e1", serviceDate: new Date("2026-03-14"), payerName: "Medicare", cptCodes: ["99214", "99454"], icd10Codes: ["I10", "G89.4"], billedCents: 38000, paidCents: 26500, patientRespCents: 6000, status: "paid", denialCategory: null },
  { claimId: "c2", patientId: "p2", encounterId: "e2", serviceDate: new Date("2026-03-22"), payerName: "Aetna", cptCodes: ["99213"], icd10Codes: ["F41.1"], billedCents: 18500, paidCents: 11800, patientRespCents: 2900, status: "paid", denialCategory: null },
  { claimId: "c3", patientId: "p3", encounterId: "e3", serviceDate: new Date("2026-04-04"), payerName: "Self pay", cptCodes: ["99204"], icd10Codes: ["F12.10"], billedCents: 30000, paidCents: 30000, patientRespCents: 0, status: "paid", denialCategory: null },
  { claimId: "c4", patientId: "p4", encounterId: "e4", serviceDate: new Date("2026-04-12"), payerName: "Medicaid", cptCodes: ["99214"], icd10Codes: ["F12.10", "M54.5"], billedCents: 22000, paidCents: 0, patientRespCents: 0, status: "denied", denialCategory: "non_covered_service" },
  { claimId: "c5", patientId: "p5", encounterId: "e5", serviceDate: new Date("2026-04-22"), payerName: "Medicare", cptCodes: ["99457", "99458"], icd10Codes: ["I10"], billedCents: 14500, paidCents: 11200, patientRespCents: 0, status: "paid", denialCategory: null },
];

export default function ResearchExportsPage({
  searchParams,
}: {
  searchParams: { minCell?: string };
}) {
  const minCellSize = Math.max(1, parseInt(searchParams.minCell ?? "1", 10) || 1);
  const pseudo = new CohortPseudonymizer(DEMO_SALT);

  const deIdentifiedPatients = RAW_PATIENTS.map((p) => deIdentifyPatient(p, pseudo));
  const deIdentifiedClaims = RAW_CLAIMS.map((c) => deIdentifyClaim(c, pseudo));

  const { kept, suppressedBuckets } = suppressSmallCells(deIdentifiedPatients, minCellSize);
  const keptIds = new Set(kept.map((p) => p.pseudonym));
  const filteredClaims = deIdentifiedClaims.filter((c) => keptIds.has(c.patientPseudonym));

  const manifest = buildCohortManifest({
    cohortId: "demo_2026q2",
    scope: "billing-and-outcomes",
    patientCount: kept.length,
    claimCount: filteredClaims.length,
    minCellSize,
  });

  const payerMix = filteredClaims.reduce<Record<string, number>>((acc, c) => {
    acc[c.payerCategory] = (acc[c.payerCategory] ?? 0) + 1;
    return acc;
  }, {});

  const patientRows: PatientCohortRow[] = kept.map((p) => ({
    pseudonym: p.pseudonym,
    ageDisplay: String(p.ageYears),
    ageNum: p.ageYears === "90+" ? 90 : p.ageYears,
    sex: p.sex ?? "—",
    race: p.race ?? "—",
    ethnicity: p.ethnicity ?? "—",
    smokingStatus: p.smokingStatus ?? "—",
    zipPrefix: p.zipPrefix === "000" ? "000" : (p.zipPrefix ?? "—"),
    zipSuppressed: p.zipPrefix === "000",
    socioeconomicTier: p.socioeconomicTier ?? "—",
  }));

  const claimRows: ClaimCohortRow[] = filteredClaims.map((c) => ({
    claimPseudonym: c.claimPseudonym,
    claimShort: c.claimPseudonym.slice(0, 12) + "…",
    patientPseudonym: c.patientPseudonym,
    patientShort: c.patientPseudonym.slice(0, 12) + "…",
    serviceMonth: c.serviceMonth,
    payerCategory: c.payerCategory,
    cptCodes: c.cptCodes.join(", "),
    icd10Codes: c.icd10Codes.join(", "),
    billedDisplay: `$${(c.billedCents / 100).toFixed(2)}`,
    billedCents: c.billedCents,
    paidDisplay: `$${(c.paidCents / 100).toFixed(2)}`,
    paidCents: c.paidCents,
    status: c.status,
  }));

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Research portal"
        title="Researcher exports"
        description="HIPAA Safe Harbor de-identification of billing + claim data for the researcher portal. Cohort-scoped pseudonyms, generalized geography, small-cell suppression."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Patients (post-suppression)" value={String(kept.length)} size="md" />
        <StatCard label="Claims" value={String(filteredClaims.length)} tone="accent" size="md" />
        <StatCard
          label="Suppressed buckets"
          value={String(suppressedBuckets.length)}
          tone={suppressedBuckets.length > 0 ? "warning" : "success"}
          hint={suppressedBuckets.join(", ") || "none"}
          size="md"
        />
        <StatCard label="Cohort id" value={manifest.cohortId} size="md" />
      </div>

      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle>Cohort manifest</CardTitle>
          <CardDescription>
            Stored alongside the export. Researchers see this — it's their proof of de-identification rigor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-surface-muted rounded-md p-3 overflow-x-auto">
            {JSON.stringify(manifest, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle>Patient cohort (de-identified)</CardTitle>
          <CardDescription>
            Direct identifiers dropped. Age capped at 89; ZIP generalized to first 3 digits with
            Safe Harbor restricted prefixes mapped to "000".
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PatientCohortTable rows={patientRows} />
        </CardContent>
      </Card>

      <Card tone="raised">
        <CardHeader>
          <CardTitle>Claim cohort</CardTitle>
          <CardDescription>
            Service date generalized to month. Payer name → category. Sample of {filteredClaims.length} claims.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(payerMix).map(([cat, count]) => (
              <Badge
                key={cat}
                tone={categorizePayer(cat).startsWith("medic") ? "info" : "accent"}
              >
                {cat}: {count}
              </Badge>
            ))}
          </div>
          <ClaimCohortTable rows={claimRows} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
