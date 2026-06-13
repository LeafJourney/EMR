// EMR-018 — Patient strain finder.
//
// Server component renders the catalog and ranks against optional
// symptom + classification filters from the URL query string. Keeping
// the filter state in the URL means the page is shareable and the
// patient's clinician can preview the same set on a chart.

import { redirect } from "next/navigation";
import Link from "next/link";

import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/ornament";
import { getCurrentUser } from "@/lib/auth/session";
import { homeForRoles } from "@/lib/rbac/roles";
import {
  listActiveStrains,
  rankStrains,
  type StrainClassification,
} from "@/lib/strains";

export const metadata = { title: "Strain Finder" };

const CLASSIFICATIONS: { value: StrainClassification; label: string }[] = [
  { value: "indica", label: "Indica" },
  { value: "sativa", label: "Sativa" },
  { value: "hybrid", label: "Hybrid" },
  { value: "cbd", label: "CBD-dominant" },
];

const COMMON_SYMPTOMS = [
  "sleep",
  "anxiety",
  "pain",
  "stress",
  "nausea",
  "appetite",
  "depression",
  "fatigue",
  "focus",
];

export default async function StrainFinderPage({
  searchParams,
}: {
  searchParams?: { symptoms?: string; class?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.roles.includes("patient")) {
    redirect(homeForRoles(user.roles));
  }

  const symptomsParam = searchParams?.symptoms ?? "";
  const classParam = (searchParams?.class ?? "") as StrainClassification | "";
  const symptoms = symptomsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const preferredClassification = CLASSIFICATIONS.some((c) => c.value === classParam)
    ? (classParam as StrainClassification)
    : undefined;

  const strains = await listActiveStrains();
  const ranked = rankStrains(strains, {
    symptoms,
    preferredClassification,
  });

  const hasFilter = symptoms.length > 0 || preferredClassification !== undefined;
  const display = hasFilter
    ? ranked
    : strains.slice(0, 24).map((s) => ({
        strain: s,
        score: 0,
        matchedSymptoms: [] as string[],
        reasons: [] as string[],
      }));

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Cannabis pharmacology"
        title="Strain Finder"
        description="Match your symptoms to flower strains drawn from our Leafly-aligned reference catalog. Always discuss strain choices with your care team."
      />

      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Tell us what you're working on</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="space-y-4">
            <div>
              <Eyebrow className="mb-2">Symptoms</Eyebrow>
              <div className="flex flex-wrap gap-2">
                {COMMON_SYMPTOMS.map((s) => {
                  const active = symptoms.includes(s);
                  const next = active
                    ? symptoms.filter((x) => x !== s)
                    : [...symptoms, s];
                  const href = `?symptoms=${encodeURIComponent(next.join(","))}${preferredClassification ? `&class=${preferredClassification}` : ""}`;
                  return (
                    <Link
                      key={s}
                      href={href}
                      prefetch={false}
                      className={
                        active
                          ? "px-3 py-1.5 rounded-full text-xs font-medium bg-accent text-accent-ink shadow-sm"
                          : "px-3 py-1.5 rounded-full text-xs font-medium bg-surface-muted text-text-muted hover:bg-surface-raised"
                      }
                    >
                      {s}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div>
              <Eyebrow className="mb-2">Classification</Eyebrow>
              <div className="flex flex-wrap gap-2">
                {CLASSIFICATIONS.map((c) => {
                  const active = preferredClassification === c.value;
                  const params = new URLSearchParams();
                  if (symptoms.length > 0) params.set("symptoms", symptoms.join(","));
                  if (!active) params.set("class", c.value);
                  return (
                    <Link
                      key={c.value}
                      href={`?${params.toString()}`}
                      prefetch={false}
                      className={
                        active
                          ? "px-3 py-1.5 rounded-full text-xs font-medium bg-accent text-accent-ink shadow-sm"
                          : "px-3 py-1.5 rounded-full text-xs font-medium bg-surface-muted text-text-muted hover:bg-surface-raised"
                      }
                    >
                      {c.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-text-muted mb-4">
        {hasFilter
          ? `${display.length} strain${display.length === 1 ? "" : "s"} match your filter.`
          : `Showing ${display.length} popular strains. Add a symptom to refine.`}
      </p>

      {display.length === 0 && (
        <p className="text-sm text-text-muted text-center py-10">
          No strains match your filter. Try removing a symptom or classification.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {display.map(({ strain, score, matchedSymptoms }) => (
          <Card key={strain.id} tone="raised">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">{strain.name}</CardTitle>
                <Badge tone="accent">{strain.classification}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 text-[11px] text-text-muted mb-2">
                {strain.thcPercent !== null && <span>THC {strain.thcPercent}%</span>}
                {strain.cbdPercent !== null && strain.cbdPercent > 0.5 && (
                  <span>CBD {strain.cbdPercent}%</span>
                )}
                {strain.dominantTerpene && <span>· Dominant: {strain.dominantTerpene}</span>}
              </div>
              {strain.description && (
                <p className="text-xs text-text-muted leading-relaxed mb-2">
                  {strain.description}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {strain.effects.slice(0, 4).map((e) => (
                  <span
                    key={e}
                    className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-surface-muted text-text-muted"
                  >
                    {e}
                  </span>
                ))}
              </div>
              {matchedSymptoms.length > 0 && (
                <p className="text-[11px] text-accent mt-3">
                  ✓ Matches: {matchedSymptoms.join(", ")}
                </p>
              )}
              {hasFilter && score > 0 && (
                <p className="text-[10px] text-text-subtle mt-1">
                  Match score: {(score * 100).toFixed(0)}%
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-[11px] text-text-subtle mt-8 max-w-md leading-relaxed">
        Strain data is referenced from the Leafly-aligned cannabinoid and
        terpene database curated by your care team. Real-world effects vary
        by individual; share your outcomes in your weekly check-in to refine
        future recommendations.
      </p>
    </PageShell>
  );
}
