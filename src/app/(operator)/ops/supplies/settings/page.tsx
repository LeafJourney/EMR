// ---------------------------------------------------------------------------
// Practice Manager — supply trust threshold settings (read-only stub, EMR-793)
//
// Server-rendered page that surfaces the currently-effective trust
// thresholds and approver routing for the supply-reorder agent. v1 is
// READ-ONLY: editing is a follow-up. The page exists so the owner can see
// what the agent will auto-submit vs route to approval without diving
// into config files.
//
// `Organization.settings.practiceManager` isn't a Prisma column today —
// `loadTrustConfig` handles the absent / malformed cases by returning
// safe defaults. Once a `settings Json` field lands, the same JSON path
// will Just Work without any code change here.
// ---------------------------------------------------------------------------

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/domain/billing";
import { loadTrustConfig } from "@/lib/practice-manager/trust-config";

export const metadata = { title: "Supply order trust settings" };

export default async function SupplyTrustSettingsPage() {
  const user = await requireUser();
  if (!user.organizationId) {
    return (
      <PageShell>
        <p>No org selected.</p>
      </PageShell>
    );
  }

  // Best-effort load. The Organization model doesn't expose a `settings`
  // column yet, so we treat any present extra JSON defensively. Cast via
  // unknown so this compiles whether or not the column exists.
  const org = (await prisma.organization.findUnique({
    where: { id: user.organizationId },
  })) as unknown as { settings?: unknown } | null;

  const config = loadTrustConfig(org?.settings);
  const usingDefaults =
    config.perOrderCeilingCents === 50_000 &&
    config.perDayCeilingCents === 200_000 &&
    config.approvers.length === 1 &&
    config.approvers[0]?.role === "practice_owner";

  return (
    <PageShell maxWidth="max-w-[960px]">
      <PageHeader
        eyebrow="Practice Manager Agent"
        title="Supply order trust thresholds"
        description="Limits the Practice Manager Agent uses when deciding whether to auto-submit a reorder or route it for human approval."
        actions={
          usingDefaults ? <Badge tone="neutral">Using defaults</Badge> : <Badge tone="accent">Customised</Badge>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Auto-submit ceilings</CardTitle>
          <CardDescription>
            Orders within both ceilings are auto-submitted by the agent. Anything above either ceiling routes to the approval queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-text-muted mb-1">Per-order ceiling</div>
            <div className="font-display text-3xl">{formatMoney(config.perOrderCeilingCents)}</div>
            <p className="text-sm text-text-muted mt-2">
              A single drafted order over this amount always requires human approval.
            </p>
          </div>
          <div>
            <div className="text-sm text-text-muted mb-1">Per-day ceiling</div>
            <div className="font-display text-3xl">{formatMoney(config.perDayCeilingCents)}</div>
            <p className="text-sm text-text-muted mt-2">
              Daily cap across all auto-submitted orders. Belt-and-suspenders for runaway low-stock alerts.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approvers</CardTitle>
          <CardDescription>
            Roles consulted by the approval queue when an order lands above a ceiling. Editing this list lands in a follow-up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-divider">
            {config.approvers.map((approver, idx) => (
              <li key={`${approver.role}-${idx}`} className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{prettyRole(approver.role)}</div>
                  {approver.userIds && approver.userIds.length > 0 && (
                    <div className="text-xs text-text-muted mt-1">
                      Restricted to {approver.userIds.length} user{approver.userIds.length === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
                <Badge tone="neutral">{approver.role}</Badge>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-muted mt-6">
            Read-only in v1. Override per-org by writing to{" "}
            <code className="px-1 py-0.5 bg-surface-2 rounded text-[11px]">Organization.settings.practiceManager</code>.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function prettyRole(role: string): string {
  switch (role) {
    case "practice_owner":
      return "Practice owner";
    case "operator":
      return "Operator";
    case "practice_admin":
      return "Practice admin";
    default:
      return role;
  }
}
