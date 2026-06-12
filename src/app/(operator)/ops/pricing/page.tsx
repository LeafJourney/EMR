import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import {
  COMPETITORS,
  TIERS,
  formatUsd,
  type SubscriptionTier,
  type CompetitorTier,
} from "@/lib/billing/subscription";
import { RoiCalculator } from "./RoiCalculator";
import {
  FeatureMatrixTable,
  type FeatureMatrixRow,
} from "./feature-matrix-table";

export const metadata = { title: "Pricing · Leafjourney" };

export default async function OpsPricingPage() {
  await requireUser();

  const featureMatrixRows: FeatureMatrixRow[] = [
    { feature: "Charting + scheduling + e-Rx", starter: true, growth: true, scale: true, enterprise: true },
    { feature: "Patient portal", starter: true, growth: true, scale: true, enterprise: true },
    { feature: "Basic claims billing", starter: true, growth: true, scale: true, enterprise: true },
    { feature: "Dispensary POS + inventory", starter: false, growth: true, scale: true, enterprise: true },
    { feature: "RCM agents (eligibility, scrubbing, denial)", starter: false, growth: true, scale: true, enterprise: true },
    { feature: "ChatCB + cannabis contraindication checks", starter: false, growth: true, scale: true, enterprise: true },
    { feature: "Multi-location consolidation", starter: false, growth: false, scale: true, enterprise: true },
    { feature: "Research export (de-identified cohorts)", starter: false, growth: false, scale: true, enterprise: true },
    { feature: "On-prem / VPC deployment", starter: false, growth: false, scale: false, enterprise: true },
    { feature: "Custom HL7/FHIR/EDI integrations", starter: false, growth: false, scale: false, enterprise: true },
    { feature: "Dedicated success manager", starter: false, growth: false, scale: true, enterprise: true },
  ];

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Operator · Pricing"
        title="Subscription pricing & ROI"
        description="Compare Leafjourney tiers against EPIC, Cerner, athenahealth, and DrChrono. Run the ROI calculator on the right to see year-1 savings, payback, and a 3-year delta."
      />

      <Eyebrow className="mb-4">Tier comparison</Eyebrow>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {TIERS.map((tier) => (
          <TierCard key={tier.id} tier={tier} />
        ))}
      </div>

      <EditorialRule className="my-10" />

      <Eyebrow className="mb-4">Feature matrix</Eyebrow>
      <FeatureMatrixTable rows={featureMatrixRows} />

      <EditorialRule className="my-10" />

      <Eyebrow className="mb-4">Competitor anchor pricing</Eyebrow>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        {COMPETITORS.map((c) => (
          <CompetitorCard key={c.id} competitor={c} />
        ))}
      </div>

      <EditorialRule className="my-10" />

      <Eyebrow className="mb-4">ROI calculator</Eyebrow>
      <RoiCalculator />
    </PageShell>
  );
}

function TierCard({ tier }: { tier: SubscriptionTier }) {
  const isEnterprise = tier.id === "enterprise";
  return (
    <Card tone="raised" className="flex flex-col h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {tier.name}
          {tier.id === "growth" && <Badge tone="accent">Most popular</Badge>}
        </CardTitle>
        <CardDescription>{tier.tagline}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col flex-1">
        <div className="mb-4">
          {isEnterprise ? (
            <p className="font-display text-3xl text-text">Custom</p>
          ) : (
            <>
              <p className="font-display text-3xl text-text tabular-nums">
                {formatUsd(tier.monthlyUsdPerProvider)}
                <span className="text-sm text-text-muted font-normal">
                  {" "}
                  / provider / mo
                </span>
              </p>
              <p className="text-xs text-text-subtle mt-1 tabular-nums">
                {formatUsd(tier.annualUsdPerProvider)} annually (save 2 months)
              </p>
            </>
          )}
        </div>
        <ul className="space-y-1.5 text-sm text-text-muted leading-relaxed flex-1">
          {tier.features.map((f) => (
            <li key={f} className="flex gap-2">
              <span className="text-accent shrink-0">•</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-text-subtle mt-4">
          {tier.maxProviders === null
            ? "Unlimited providers"
            : `Up to ${tier.maxProviders} provider${tier.maxProviders === 1 ? "" : "s"}`}
        </p>
      </CardContent>
    </Card>
  );
}

function CompetitorCard({ competitor }: { competitor: CompetitorTier }) {
  return (
    <Card tone="default">
      <CardContent className="pt-5 pb-5">
        <p className="font-display text-base text-text">{competitor.name}</p>
        <p className="font-display text-2xl text-text tabular-nums mt-1">
          {formatUsd(competitor.monthlyUsdPerProvider)}
          <span className="text-xs text-text-subtle font-normal">
            {" "}
            / provider / mo
          </span>
        </p>
        <p className="text-xs text-text-subtle mt-1.5 tabular-nums">
          {formatUsd(competitor.implementationUsd)} implementation
        </p>
        <p className="text-[11px] text-text-muted mt-3 leading-relaxed">
          {competitor.notes}
        </p>
      </CardContent>
    </Card>
  );
}

