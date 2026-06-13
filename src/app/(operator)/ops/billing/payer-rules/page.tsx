import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/ornament";
import { isStaleRule, PAYER_RULE_STALE_MS } from "@/lib/billing/payer-rules-db";
import { loadPayerRulesForOrg } from "./actions";
import { PayerRulesTable, type PayerRuleRow } from "./payer-rules-table";

export const metadata = { title: "Payer rules — admin" };

// EMR-218 admin editor — shows the merged set of global + org-override
// payer rules with a staleness banner on any rule reviewed > 6 months ago.


export default async function PayerRulesPage() {
  const user = await requireUser();
  if (!user.organizationId) {
    return <PageShell><p>No organization selected.</p></PageShell>;
  }
  const rules = await loadPayerRulesForOrg(user.organizationId);
  const staleCount = rules.filter((r) => isStaleRule(r.lastReviewedAt)).length;

  const rows: PayerRuleRow[] = rules.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    class: r.class,
    timelyFilingDisplay: `${r.timelyFilingDays}d / ${r.correctedTimelyFilingDays}d`,
    timelyFilingDays: r.timelyFilingDays,
    correctedTimelyFilingDays: r.correctedTimelyFilingDays,
    ackSlaDays: r.ackSlaDays,
    cannabisLabel: r.excludesCannabis
      ? "Excluded"
      : r.requiresPriorAuthForCannabis
      ? "Prior auth"
      : "Covered",
    lastReviewedDisplay: r.lastReviewedAt.toISOString().slice(0, 10),
    lastReviewedMs: r.lastReviewedAt.getTime(),
    isStale: isStaleRule(r.lastReviewedAt),
    isOrgOverride: r.isOrgOverride,
  }));

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Billing → admin"
        title="Payer rules"
        description="Override timely-filing windows, appeal deadlines, cannabis policy, and acknowledgment SLAs without a deploy."
      />

      <div className="mb-4 flex justify-end">
        <Link
          href="/ops/billing/payer-rules/editor"
          className="inline-flex items-center justify-center rounded-md bg-accent text-accent-ink px-4 h-9 text-sm font-medium hover:bg-accent-strong"
        >
          + New payer rule
        </Link>
      </div>

      {staleCount > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <CardContent className="py-4">
            <p className="text-sm text-amber-900">
              <strong>{staleCount} rule{staleCount === 1 ? "" : "s"}</strong> haven&apos;t been reviewed in &gt; {Math.round(PAYER_RULE_STALE_MS / (1000 * 60 * 60 * 24))} days.
              Review the staleness column below and re-save with a reason note to clear the warning.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="mb-2">
        <Eyebrow>Active rules</Eyebrow>
        <p className="text-sm text-text-muted mt-1">
          {rules.length} payer{rules.length === 1 ? "" : "s"} — org-specific overrides win over the in-code defaults.
        </p>
      </div>
      <PayerRulesTable rows={rows} />
    </PageShell>
  );
}
