// EMR-096 — Double-blind study module.
//
// Operator-side view that demos the randomization engine. Lets you
// configure an N-arm study, drop in a small synthetic cohort, and see
// the resulting allocations + per-stratum balance. Real studies will
// pull subjects from the patient db; this page is the shape.

import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { AllocationRosterTable, type AllocationRosterRow } from "./allocation-roster-table";
import {
  allocate,
  balanceChiSquare,
  type RandomizableSubject,
  type StudySpec,
} from "@/lib/research/double-blind";

export const metadata = { title: "Double-blind studies" };

const DEMO_SUBJECTS: RandomizableSubject[] = [
  { patientId: "p1", ageBand: "60-74", sex: "female", primaryCondition: "chronic_pain" },
  { patientId: "p2", ageBand: "45-59", sex: "male", primaryCondition: "chronic_pain" },
  { patientId: "p3", ageBand: "30-44", sex: "female", primaryCondition: "anxiety" },
  { patientId: "p4", ageBand: "30-44", sex: "male", primaryCondition: "anxiety" },
  { patientId: "p5", ageBand: "75+", sex: "female", primaryCondition: "chronic_pain" },
  { patientId: "p6", ageBand: "45-59", sex: "female", primaryCondition: "insomnia" },
  { patientId: "p7", ageBand: "60-74", sex: "male", primaryCondition: "insomnia" },
  { patientId: "p8", ageBand: "30-44", sex: "female", primaryCondition: "chronic_pain" },
  { patientId: "p9", ageBand: "18-29", sex: "male", primaryCondition: "anxiety" },
  { patientId: "p10", ageBand: "60-74", sex: "female", primaryCondition: "insomnia" },
  { patientId: "p11", ageBand: "45-59", sex: "male", primaryCondition: "chronic_pain" },
  { patientId: "p12", ageBand: "60-74", sex: "male", primaryCondition: "chronic_pain" },
  { patientId: "p13", ageBand: "30-44", sex: "female", primaryCondition: "insomnia" },
  { patientId: "p14", ageBand: "45-59", sex: "female", primaryCondition: "anxiety" },
  { patientId: "p15", ageBand: "60-74", sex: "female", primaryCondition: "chronic_pain" },
  { patientId: "p16", ageBand: "60-74", sex: "male", primaryCondition: "anxiety" },
];

const DEFAULT_ARMS = "treatment_a:1,treatment_b:1,placebo:1";

function parseArms(raw: string): StudySpec["arms"] {
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const [name, weight] = token.split(":").map((s) => s.trim());
      const w = parseFloat(weight ?? "1");
      return { name, weight: Number.isFinite(w) && w > 0 ? w : 1 };
    });
}

export default function StudiesPage({
  searchParams,
}: {
  searchParams: { studyId?: string; arms?: string; seed?: string; stratify?: string };
}) {
  const studyId = searchParams.studyId || "demo_study_2026q2";
  const arms = parseArms(searchParams.arms || DEFAULT_ARMS);
  const seed = searchParams.seed || "irb_approved_seed_2026__rotate_at_unblinding";
  const stratifyBy = (
    (searchParams.stratify || "ageBand,sex").split(",") as Array<
      keyof RandomizableSubject
    >
  ).filter((d) => ["ageBand", "sex", "primaryCondition"].includes(String(d)));

  const spec: StudySpec = { studyId, arms, seed, stratifyBy };
  const plan = allocate(DEMO_SUBJECTS, spec);
  const chi2 = balanceChiSquare(plan);

  const rosterRows: AllocationRosterRow[] = plan.allocations.map((a) => ({
    patientId: a.patientId,
    stratum: a.blockId.split("#")[0],
    block: a.blockId.split("#")[1],
    blindingCode: a.blindingCode,
    arm: a.arm,
  }));

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Research portal"
        title="Double-blind studies"
        description="Permuted-block randomization with stratification and HMAC-keyed blinding codes. Re-running with the same seed reproduces the allocation; unblinding requires the seed."
      />

      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle>1 · Configure study</CardTitle>
          <CardDescription>
            Arms accept `name:weight` pairs comma-separated. Stratification keys come from the
            randomizable subject schema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/ops/research-exports/studies" method="get" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">Study id</span>
              <input
                name="studyId"
                defaultValue={studyId}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">Arms (name:weight, comma-separated)</span>
              <input
                name="arms"
                defaultValue={searchParams.arms || DEFAULT_ARMS}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">Seed (hidden in production)</span>
              <input
                name="seed"
                defaultValue={seed}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">Stratify by</span>
              <input
                name="stratify"
                defaultValue={stratifyBy.join(",")}
                placeholder="ageBand,sex,primaryCondition"
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-text px-4 py-2 text-sm text-surface hover:opacity-90"
              >
                Re-randomize
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Subjects" value={String(plan.allocations.length)} size="md" />
        <StatCard label="Arms" value={String(arms.length)} tone="accent" size="md" />
        <StatCard
          label="χ² balance"
          value={chi2.toFixed(2)}
          tone={chi2 < 1 ? "success" : chi2 < 4 ? "neutral" : "warning"}
          size="md"
          hint={chi2 < 1 ? "well-balanced" : chi2 < 4 ? "acceptable" : "lopsided — pick a smaller block"}
        />
        <StatCard
          label="Strata"
          value={String(Object.keys(plan.stratumBalance).length)}
          size="md"
        />
      </div>

      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle>Per-arm balance</CardTitle>
          <CardDescription>
            Counts after running the schedule. Weighted arms sum to the total cohort.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {arms.map((a) => (
              <Badge key={a.name} tone="accent">
                {a.name}: {plan.balance[a.name] ?? 0}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle>Stratum-level balance</CardTitle>
          <CardDescription>
            Balance is enforced inside each stratum block — the table should be near-flat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 text-text-subtle">Stratum</th>
                  {arms.map((a) => (
                    <th key={a.name} className="py-2 pr-3 text-text-subtle text-right">
                      {a.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {Object.entries(plan.stratumBalance).map(([stratum, counts]) => (
                  <tr key={stratum}>
                    <td className="py-2 pr-3 font-mono text-[11px]">{stratum}</td>
                    {arms.map((a) => (
                      <td
                        key={a.name}
                        className="py-2 pr-3 text-right tabular-nums text-text-muted"
                      >
                        {counts[a.name] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card tone="raised">
        <CardHeader>
          <CardTitle>Allocation roster</CardTitle>
          <CardDescription>
            Blinding codes are HMAC(seed, studyId|patientId). Reveal at the end of the trial only.
          </CardDescription>
        </CardHeader>
        <AllocationRosterTable rows={rosterRows} />
      </Card>
    </PageShell>
  );
}
