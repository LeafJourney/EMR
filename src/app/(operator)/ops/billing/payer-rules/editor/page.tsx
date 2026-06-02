// EMR-218 — Payer rule editor (single-rule form + audit trail).
//
// The list page (../page.tsx) renders read-only rows; this editor lets ops
// edit a single rule in place. Submit goes through the existing
// `savePayerRuleAction` server action (audit-logged in payer-rules-db.ts),
// then redirects back to the list. The editor also surfaces the last 10
// PayerRuleAuditLog rows for the rule so ops can see who changed what.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/ornament";
import { fromPrismaPayerRule, isStaleRule } from "@/lib/billing/payer-rules-db";
import { DEFAULT_PAYER_RULE, PAYER_RULES, type PayerRule } from "@/lib/billing/payer-rules";
import { savePayerRuleAction } from "../actions";

export const metadata = { title: "Edit payer rule — admin" };

interface EditorPageProps {
  searchParams: { id?: string };
}

export default async function PayerRuleEditorPage({ searchParams }: EditorPageProps) {
  const user = await requireUser();
  if (!user.organizationId) {
    return (
      <PageShell>
        <p>No organization selected.</p>
      </PageShell>
    );
  }

  const id = (searchParams.id ?? "").trim();
  if (!id) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Billing → admin"
          title="New payer rule"
          description="Override the default policy for a payer not yet on file."
        />
        <RuleForm rule={{ ...DEFAULT_PAYER_RULE, id: "", displayName: "" }} isNew />
      </PageShell>
    );
  }

  // Try DB (org override → global), then fall back to in-code starter.
  const dbRule = await prisma.payerRule.findFirst({
    where: { id, OR: [{ organizationId: user.organizationId }, { organizationId: null }] },
    orderBy: { organizationId: "desc" },
  });
  let rule: PayerRule | null = null;
  let lastReviewedAt: Date | null = null;
  let isOrgOverride = false;
  if (dbRule) {
    rule = fromPrismaPayerRule(dbRule);
    lastReviewedAt = dbRule.lastReviewedAt;
    isOrgOverride = !!dbRule.organizationId;
  } else {
    rule = PAYER_RULES.find((r) => r.id === id) ?? null;
  }
  if (!rule) notFound();

  const auditRows = await prisma.payerRuleAuditLog.findMany({
    where: { payerRuleId: id },
    orderBy: { editedAt: "desc" },
    take: 10,
  });
  const editorIds = Array.from(
    new Set(auditRows.map((r) => r.editedById).filter((v): v is string => !!v)),
  );
  const editors = editorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: editorIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const editorById = new Map(editors.map((e) => [e.id, e]));
  const audit = auditRows.map((r) => ({
    ...r,
    editor: r.editedById ? editorById.get(r.editedById) ?? null : null,
  }));

  return (
    <PageShell maxWidth="max-w-[1200px]">
      <PageHeader
        eyebrow="Billing → admin"
        title={`Edit ${rule.displayName}`}
        description="Changes write a new PayerRuleAuditLog row tied to your account."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div>
          {lastReviewedAt && isStaleRule(lastReviewedAt) && (
            <Card className="mb-4 border-amber-300 bg-amber-50">
              <CardContent className="py-3">
                <p className="text-sm text-amber-900">
                  This rule was last reviewed on {lastReviewedAt.toISOString().slice(0, 10)} —
                  consider refreshing the timely-filing window after confirming with the payer.
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <Eyebrow>Editor</Eyebrow>
              <CardTitle>{rule.displayName}</CardTitle>
              <CardDescription>
                {isOrgOverride ? (
                  <Badge tone="accent">Org override</Badge>
                ) : (
                  <Badge tone="neutral">Global default</Badge>
                )}
                <span className="ml-2 text-xs text-text-subtle">id: {rule.id}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RuleForm rule={rule} />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <Eyebrow>Audit log</Eyebrow>
              <CardTitle>Last {audit.length} change{audit.length === 1 ? "" : "s"}</CardTitle>
              <CardDescription>Most recent first.</CardDescription>
            </CardHeader>
            <CardContent>
              {audit.length === 0 ? (
                <p className="text-sm text-text-muted">No edits recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {audit.map((entry) => (
                    <li key={entry.id} className="border-l-2 border-border-strong pl-3">
                      <p className="text-xs text-text-subtle">
                        {entry.editedAt.toISOString().slice(0, 16).replace("T", " ")}
                      </p>
                      <p className="text-sm font-medium">
                        {entry.editor
                          ? `${entry.editor.firstName} ${entry.editor.lastName}`
                          : "system"}
                      </p>
                      <p className="text-xs text-text-muted">
                        Changed: {entry.changedFields.join(", ") || "(no diff)"}
                      </p>
                      {entry.reason && (
                        <p className="text-xs text-text mt-1 italic">&ldquo;{entry.reason}&rdquo;</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <Link href="/ops/billing/payer-rules" className="text-sm text-accent hover:underline">
          ← back to payer rules
        </Link>
      </div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function RuleForm({ rule, isNew = false }: { rule: PayerRule; isNew?: boolean }) {
  return (
    <form action={savePayerRuleAction} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Rule id" required>
          <Input name="id" defaultValue={rule.id} required readOnly={!isNew} maxLength={64} />
        </Field>
        <Field label="Display name" required>
          <Input name="displayName" defaultValue={rule.displayName} required maxLength={120} />
        </Field>
      </div>

      <Field label="Aliases" hint="Comma-separated lowercase substrings used to match payer names.">
        <Input name="aliases" defaultValue={rule.aliases.join(", ")} maxLength={2000} />
      </Field>

      <Field label="Class" required>
        <select
          name="class"
          defaultValue={rule.class}
          className="h-10 px-3 rounded-md border border-border-strong bg-surface text-sm w-full"
          required
        >
          <option value="commercial">commercial</option>
          <option value="government">government</option>
          <option value="medicare_advantage">medicare_advantage</option>
          <option value="medicaid_managed">medicaid_managed</option>
          <option value="workers_comp">workers_comp</option>
          <option value="self_pay">self_pay</option>
          <option value="other">other</option>
        </select>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Timely filing days" required>
          <Input name="timelyFilingDays" type="number" defaultValue={rule.timelyFilingDays} min={1} max={3650} required />
        </Field>
        <Field label="Corrected timely filing days" required>
          <Input name="correctedTimelyFilingDays" type="number" defaultValue={rule.correctedTimelyFilingDays} min={1} max={3650} required />
        </Field>
        <Field label="Appeal level 1 days" required>
          <Input name="appealLevel1Days" type="number" defaultValue={rule.appealDeadlines.level1Days} min={1} max={3650} required />
        </Field>
        <Field label="Appeal level 2 days" required>
          <Input name="appealLevel2Days" type="number" defaultValue={rule.appealDeadlines.level2Days} min={1} max={3650} required />
        </Field>
        <Field label="External review days" hint="Leave blank if not applicable.">
          <Input name="appealExternalReviewDays" type="number" defaultValue={rule.appealDeadlines.externalReviewDays ?? ""} min={1} max={3650} />
        </Field>
        <Field label="Ack SLA days" required>
          <Input name="ackSlaDays" type="number" defaultValue={rule.ackSlaDays} min={0} max={60} required />
        </Field>
        <Field label="Adjudication SLA days" required>
          <Input name="adjudicationSlaDays" type="number" defaultValue={rule.adjudicationSlaDays} min={1} max={365} required />
        </Field>
        <Field label="Eligibility TTL hours" required>
          <Input name="eligibilityTtlHours" type="number" defaultValue={rule.eligibilityTtlHours} min={1} max={168} required />
        </Field>
      </div>

      <Field label="Corrected claim frequency" required>
        <select
          name="correctedClaimFrequency"
          defaultValue={rule.correctedClaimFrequency}
          className="h-10 px-3 rounded-md border border-border-strong bg-surface text-sm w-full"
          required
        >
          <option value="7">7 — replacement</option>
          <option value="6">6 — corrected</option>
          <option value="8_then_1">void (8) then resubmit (1)</option>
        </select>
      </Field>

      <fieldset className="border border-border-strong rounded-md p-4 space-y-3">
        <legend className="px-2 text-xs uppercase tracking-wide text-text-subtle">Cannabis policy</legend>
        <Toggle name="honorsMod25OnZ71" label="Honors modifier 25 on Z71 cannabis E&M" defaultChecked={rule.honorsMod25OnZ71} />
        <Toggle name="requiresPriorAuthForCannabis" label="Requires prior auth for cannabis" defaultChecked={rule.requiresPriorAuthForCannabis} />
        <Toggle name="excludesCannabis" label="Excludes cannabis entirely" defaultChecked={rule.excludesCannabis} />
        <Field label="Cannabis policy citation" hint="URL or doc reference for the policy text.">
          <Input name="cannabisPolicyCitation" defaultValue={rule.cannabisPolicyCitation ?? ""} maxLength={500} />
        </Field>
      </fieldset>

      <fieldset className="border border-border-strong rounded-md p-4 space-y-3">
        <legend className="px-2 text-xs uppercase tracking-wide text-text-subtle">Submission</legend>
        <Toggle name="supportsElectronicSubmission" label="Supports electronic submission (837P)" defaultChecked={rule.supportsElectronicSubmission} />
        <Field
          label="Attachment channels"
          hint="Comma- or space-separated subset of: pwk_electronic, fax, mail, portal."
        >
          <Input name="attachmentChannels" defaultValue={rule.attachmentChannels.join(", ")} maxLength={200} />
        </Field>
      </fieldset>

      <Field label="Reason for change" required hint="Required for audit. Why are you editing this rule today?">
        <Textarea name="reason" rows={2} maxLength={500} minLength={1} required />
      </Field>

      <div className="flex gap-3">
        <Button type="submit" variant="primary">{isNew ? "Create rule" : "Save changes"}</Button>
        <Link
          href="/ops/billing/payer-rules"
          className="inline-flex items-center justify-center rounded-md border border-border-strong px-4 h-10 text-sm hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="block text-xs uppercase tracking-wide text-text-subtle mb-1">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-text-subtle mt-1">{hint}</p>}
    </div>
  );
}

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4" />
      <span>{label}</span>
    </label>
  );
}
