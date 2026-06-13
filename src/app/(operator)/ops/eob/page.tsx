import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import {
  buildEobFromEra835,
  topPatientRespReasons,
  buildSummaryPrompt,
  type ParsedEob,
  type Era835ClaimSegment,
  type Era835Header,
} from "@/lib/billing/eob";

import { money } from "@/lib/ui/format";

export const metadata = { title: "EOB Inbox" };

function formatMoney(cents: number): string {
  return money(cents);
}

// Sample 835 fixtures — once the clearinghouse webhook lands these come
// from prisma.adjudicationResult / prisma.clearinghouseSubmission. The
// parser is the same; only the source changes.
const SAMPLE_HEADER: Era835Header = {
  payerName: "Aetna",
  paidDate: "2026-04-21",
  checkOrEftNumber: "EFT-998877",
};

const SAMPLE_CLAIMS: Array<{ patient: string; mrn: string; segment: Era835ClaimSegment; matchedClaimId: string }> = [
  {
    patient: "Maya Castillo",
    mrn: "MRN-A0042",
    matchedClaimId: "clm_01H8XVQ",
    segment: {
      payerClaimNumber: "AET-2026-04-22001",
      patientControlNumber: "PCN-A0042-04",
      cptLines: [
        {
          cptCode: "99214",
          description: "Office visit, established, moderate complexity",
          billedCents: 21500,
          allowedCents: 13800,
          paidCents: 11040,
          adjustments: [
            { groupCode: "CO", carc: "45", amountCents: 7700 },
            { groupCode: "PR", carc: "1", amountCents: 1500, rarc: "N782" },
            { groupCode: "PR", carc: "2", amountCents: 1260 },
          ],
        },
      ],
    },
  },
  {
    patient: "Jonas Reiter",
    mrn: "MRN-B0119",
    matchedClaimId: "clm_01H8XW3",
    segment: {
      payerClaimNumber: "AET-2026-04-22014",
      patientControlNumber: "PCN-B0119-04",
      cptLines: [
        {
          cptCode: "99213",
          description: "Office visit, established, low complexity",
          billedCents: 16500,
          allowedCents: 9800,
          paidCents: 0,
          adjustments: [
            { groupCode: "CO", carc: "45", amountCents: 6700 },
            { groupCode: "PR", carc: "204", amountCents: 9800 },
          ],
        },
      ],
    },
  },
];

export default function EobInboxPage() {
  const parsed: Array<{ patient: string; mrn: string; eob: ParsedEob }> = SAMPLE_CLAIMS.map(
    (s) => ({
      patient: s.patient,
      mrn: s.mrn,
      eob: buildEobFromEra835(SAMPLE_HEADER, s.segment, s.matchedClaimId),
    }),
  );

  const totalPaid = parsed.reduce((sum, p) => sum + p.eob.totals.paidCents, 0);
  const totalPR = parsed.reduce((sum, p) => sum + p.eob.totals.patientRespCents, 0);
  const totalCO = parsed.reduce((sum, p) => sum + p.eob.totals.contractualAdjustmentCents, 0);

  return (
    <PageShell maxWidth="max-w-[1200px]">
      <PageHeader
        eyebrow="Remittance"
        title="EOB inbox"
        description="Parsed payer remittance — surfaced to the patient portal billing tab AND the doctor's chart drawer with the same source of truth."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="EOBs parsed" value={String(parsed.length)} size="md" />
        <StatCard label="Insurance paid" value={formatMoney(totalPaid)} tone="success" size="md" />
        <StatCard
          label="Patient responsibility"
          value={formatMoney(totalPR)}
          tone="warning"
          size="md"
        />
        <StatCard label="Contractual adj." value={formatMoney(totalCO)} tone="neutral" size="md" />
      </div>

      <div className="space-y-4">
        {parsed.map((p) => {
          const topReasons = topPatientRespReasons(p.eob, 3);
          const promptPreview = buildSummaryPrompt({
            payerName: p.eob.payerName,
            serviceDate: p.eob.paidDate,
            totals: p.eob.totals,
            topReasons,
          });
          return (
            <Card key={p.mrn} tone="raised">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {p.patient} <span className="text-text-subtle text-sm">· {p.mrn}</span>
                    </CardTitle>
                    <CardDescription>
                      {p.eob.payerName} · paid {p.eob.paidDate} · #{p.eob.payerClaimNumber}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {p.eob.fromFreeText && <Badge tone="warning">free-text</Badge>}
                    {p.eob.unmatchedLines.length > 0 && (
                      <Badge tone="danger">{p.eob.unmatchedLines.length} unmatched</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                  <Stat label="Billed" value={formatMoney(p.eob.totals.billedCents)} />
                  <Stat label="Allowed" value={formatMoney(p.eob.totals.allowedCents)} />
                  <Stat label="Paid" value={formatMoney(p.eob.totals.paidCents)} tone="success" />
                  <Stat
                    label="Patient resp."
                    value={formatMoney(p.eob.totals.patientRespCents)}
                    tone="warning"
                  />
                  <Stat
                    label="Contractual"
                    value={formatMoney(p.eob.totals.contractualAdjustmentCents)}
                  />
                </div>
                {topReasons.length > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-wider text-text-subtle mb-2">
                      Top patient-resp reasons
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {topReasons.map((r) => (
                        <Badge key={r.carc} tone="warning">
                          CARC {r.carc} · {r.bucket} · {formatMoney(r.amountCents)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <details className="text-xs text-text-muted">
                  <summary className="cursor-pointer text-text">
                    AI summary prompt (deterministic facts only)
                  </summary>
                  <pre className="mt-2 p-3 bg-surface-muted rounded-md overflow-x-auto whitespace-pre-wrap">
                    {promptPreview}
                  </pre>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-subtle">{label}</div>
      <div
        className={
          tone === "success"
            ? "text-success font-medium tabular-nums"
            : tone === "warning"
              ? "text-[color:var(--warning)] font-medium tabular-nums"
              : "text-text font-medium tabular-nums"
        }
      >
        {value}
      </div>
    </div>
  );
}
