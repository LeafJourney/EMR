import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { lex } from "@/lib/lexicon";
import { DEMO_OPPORTUNITIES } from "@/lib/domain/volunteer-demo";
import { CharityTable, type CharityRow } from "./charity-table";

export const metadata = { title: "Volunteer Program · Operator" };

interface ProgramKpi {
  label: string;
  value: string;
  hint?: string;
}

const KPIS: ProgramKpi[] = [
  { label: "Engaged members", value: "742", hint: "Logged ≥1 hour in current quarter" },
  { label: "Hours logged (Q)", value: "3,184" },
  { label: "Hours verified (Q)", value: "2,108", hint: "66% verification rate" },
  { label: "Active charities", value: "28" },
  { label: "Charities pending audit", value: "3", hint: "AI compliance queue" },
  { label: "Patient discount triggered (Q)", value: "$28,420", hint: "From hours over quarterly minimum" },
  { label: "Provider platform discount (Q)", value: "$11,860" },
  { label: "Donations diverted (Q)", value: "$4,210", hint: "Patients who chose to donate the discount" },
];

export default async function VolunteerProgramPage() {
  await requireUser();

  const rows: CharityRow[] = DEMO_OPPORTUNITIES.map((o) => ({
    id: o.id,
    charityName: o.charityName,
    categoryDisplay: o.category.replace("_", " "),
    opportunity: o.title,
    vetted: o.vetted,
    vettedDisplay: o.vetted
      ? `Audited ${o.vettedAt ? new Date(o.vettedAt).toLocaleDateString() : ""}`
      : "Pending",
  }));

  return (
    <PageShell maxWidth="max-w-[1200px]">
      <PageHeader
        eyebrow="Article VII"
        title={`${lex("program.volunteer")} program`}
        description="Charity registry health, hour velocity, and discount/donation flow for the volunteer module."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {KPIS.map((k) => (
          <Card key={k.label}>
            <CardContent className="py-4">
              <p className="text-[11px] uppercase tracking-wider text-text-subtle">{k.label}</p>
              <p className="font-display text-2xl text-text mt-1 tabular-nums">{k.value}</p>
              {k.hint && <p className="text-[11px] text-text-subtle mt-1">{k.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charity registry — sortable columns + CSV/print export (MASTER prompt G5/G6) */}
      <p className="text-xs uppercase tracking-wider text-text-subtle mt-6 mb-4">Charity registry</p>
      <CharityTable rows={rows} />
    </PageShell>
  );
}
