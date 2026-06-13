import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FhirResourcesTable, type FhirResourceRow } from "./fhir-resources-table";

export const metadata = { title: "FHIR bridge" };

const RESOURCES = [
  {
    name: "Patient",
    description: "Demographics with US Core race extension and Leafjourney patient identifier.",
    coverage: ["read", "search", "$everything"],
  },
  {
    name: "Encounter",
    description: "Visits — status, period, type, provider participant, reason text.",
    coverage: ["read", "search"],
  },
  {
    name: "Observation",
    description: "Vitals (BP/HR/weight), patient-reported outcomes, cannabis dose log.",
    coverage: ["read", "search"],
  },
  {
    name: "MedicationStatement",
    description: "Cannabis regimen + conventional Rx with RxNorm and SNOMED coding.",
    coverage: ["read", "search"],
  },
  {
    name: "DocumentReference",
    description: "APSO notes, chart summaries, fairytale patient summaries (base64).",
    coverage: ["read"],
  },
];

export default async function FhirBridgePage() {
  await requireUser();

  const rows: FhirResourceRow[] = RESOURCES.map((r) => ({
    id: r.name,
    resource: r.name,
    description: r.description,
    operationsDisplay: r.coverage.join(", "),
    operations: r.coverage,
  }));

  return (
    <PageShell maxWidth="max-w-[960px]">
      <PageHeader
        eyebrow="Platform · EMR-013"
        title="FHIR R4 bridge"
        description="Read/write adapter for Epic, Cerner, athena, and Practice Fusion. SMART app launch + bulk-data export are on the Q3 roadmap."
        actions={
          <Link href="/api/integrations/fhir/Patient" target="_blank">
            <Button variant="secondary">Try the demo Patient endpoint</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card tone="raised">
          <CardHeader>
            <CardTitle>Live adapters</CardTitle>
            <CardDescription>What ships today.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-text-muted">
              <li>• HL7 FHIR R4 R/W mappers (this module)</li>
              <li>• OAuth2 client credentials</li>
              <li>• X-12 270/271 eligibility (via clearinghouse)</li>
              <li>• HL7 v2 ADT inbound (via Mirth Connect bridge)</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Roadmap</CardTitle>
            <CardDescription>What's next this quarter.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-text-muted">
              <li>• SMART on FHIR app launch</li>
              <li>• Bulk Data ($export, async polling)</li>
              <li>• CCDA import via $convert (Microsoft FHIR converter)</li>
              <li>• Direct Trust messaging</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Resource coverage — sortable columns + CSV/print export (MASTER prompt G5/G6) */}
      <div className="mb-8">
        <FhirResourcesTable rows={rows} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integration flow</CardTitle>
          <CardDescription>How a partner EMR exchanges data with us.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm text-text-muted list-decimal pl-5">
            <li>Partner exchanges OAuth2 client credentials with our CSM.</li>
            <li>We register the partner organization and issue an audience-scoped token.</li>
            <li>Partner reads from <span className="font-mono">/api/integrations/fhir/&lt;Resource&gt;</span> with bearer auth.</li>
            <li>Partner writes via <span className="font-mono">PUT /api/integrations/fhir/&lt;Resource&gt;/&lt;id&gt;</span>; we run server-side validation.</li>
            <li>Hourly sync digest emails the partner with the diff (created / updated / failed).</li>
          </ol>
        </CardContent>
      </Card>
    </PageShell>
  );
}
