import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LabSnapshot } from "./lab-snapshot";

export const metadata = { title: "Analytics Lab" };

const FEATURES: {
  href: string;
  title: string;
  description: string;
  emoji: string;
  tag: string;
}[] = [
  {
    href: "/ops/analytics-lab/heatmap",
    title: "Patient Trend Heatmap",
    description: "90-day calendar grid of outcome improvements across the cohort.",
    emoji: "🌡️",
    tag: "Outcomes",
  },
  {
    href: "/ops/analytics-lab/providers",
    title: "Provider Leaderboard",
    description: "Compare providers across throughput, timeliness, and satisfaction.",
    emoji: "🏆",
    tag: "Providers",
  },
  {
    href: "/ops/analytics-lab/atlas",
    title: "Condition Outcome Atlas",
    description: "Drill into each condition's cohort size, improvement, and top products.",
    emoji: "🗺️",
    tag: "Conditions",
  },
  {
    href: "/ops/analytics-lab/terpenes",
    title: "Terpene Efficacy Tracker",
    description: "Which terpenes correlate with which outcomes in your patients.",
    emoji: "🌿",
    tag: "Pharmacology",
  },
  {
    href: "/ops/analytics-lab/seasonal",
    title: "Seasonal Pattern Detector",
    description: "Monthly outcome curves to surface seasonal peaks and troughs.",
    emoji: "🗓️",
    tag: "Temporal",
  },
  {
    href: "/ops/analytics-lab/dose-response",
    title: "Dose-Response Curves",
    description: "Scatter + curve of daily dose vs outcome improvement, per cannabinoid.",
    emoji: "📈",
    tag: "Pharmacology",
  },
  {
    href: "/ops/analytics-lab/adverse-events",
    title: "Adverse Event Dashboard",
    description: "Track, filter, and report adverse events with causality.",
    emoji: "⚠️",
    tag: "Safety",
  },
  {
    href: "/ops/analytics-lab/cost-effectiveness",
    title: "Cost-Effectiveness Analysis",
    description: "Per-product improvement-per-dollar and QALY proxy rankings.",
    emoji: "💵",
    tag: "Economics",
  },
  {
    href: "/ops/analytics-lab/cohort-builder",
    title: "Research Cohort Builder",
    description: "Wizard to compose a research cohort with live count previews.",
    emoji: "🧪",
    tag: "Research",
  },
  {
    href: "/ops/analytics-lab/data-marketplace",
    title: "De-identified Data Marketplace",
    description: "Publish & purchase HIPAA Safe Harbor de-identified datasets.",
    emoji: "🛍️",
    tag: "Research",
  },
];

export default async function AnalyticsLabIndexPage() {
  await requireUser();
  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Operations · Labs"
        title="Analytics Lab"
        description="Experimental dashboards for cohort analytics, pharmacology, and research operations. Built on top of platform-wide outcome logs and product usage data."
      />
      <LabSnapshot />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {FEATURES.map((f) => (
          <Link key={f.href} href={f.href} className="group">
            <Card
              tone="raised"
              className="h-full transition-all duration-200 hover:shadow-lg hover:border-accent/40 hover:-translate-y-0.5"
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-3xl leading-none">{f.emoji}</span>
                  <Badge tone="accent">{f.tag}</Badge>
                </div>
                <CardTitle className="mt-4 group-hover:text-accent transition-colors">
                  {f.title}
                </CardTitle>
                <CardDescription>{f.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-xs font-medium text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                  Open lab →
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
