"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import {
  generateRecommendation,
  type RecommendResult,
  type Recommendation,
} from "./actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeafSprig } from "@/components/ui/ornament";

/* ── Submit button ──────────────────────────────────────────── */

function GenerateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Generating..." : "Generate recommendation"}
    </Button>
  );
}

/* ── Confidence badge ───────────────────────────────────────── */

function ConfidenceBadge({ level }: { level: Recommendation["confidence"] }) {
  const tone = level === "high" ? "success" : level === "moderate" ? "highlight" : "neutral";
  return (
    <Badge tone={tone}>
      {level === "high" ? "High confidence" : level === "moderate" ? "Moderate confidence" : "Low confidence"}
    </Badge>
  );
}

/* ── Recommendation display ─────────────────────────────────── */

function RecommendationCard({
  rec,
  patientId,
}: {
  rec: Recommendation;
  patientId: string;
}) {
  return (
    <Card tone="ambient" className="mt-8">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="font-display text-xl flex items-center gap-2">
            <LeafSprig size={20} className="text-accent" />
            AI Treatment Recommendation
          </CardTitle>
          <ConfidenceBadge level={rec.confidence} />
        </div>
        <CardDescription className="mt-2">{rec.rationale}</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="rounded-xl bg-surface/80 border border-border p-5 space-y-4">
          {/* Recommendation grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <DetailRow label="Product type" value={rec.productType} />
            <DetailRow label="Cannabinoid ratio" value={rec.cannabinoidRatio} />
            <DetailRow label="Starting dose" value={rec.startingDoseMg} />
            <DetailRow label="Delivery method" value={rec.deliveryMethod} />
            <DetailRow label="Frequency" value={rec.frequency} />
          </div>

          {/* Evidence citations */}
          {rec.citations.length > 0 && (
            <div className="pt-4 border-t border-border/60">
              <p className="text-xs font-medium text-text-muted mb-3 uppercase tracking-wider">
                Supporting evidence
              </p>
              <ul className="space-y-3">
                {rec.citations.map((cite) => (
                  <li key={cite.pmid} className="text-sm">
                    <a
                      href={cite.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-accent hover:text-accent-hover transition-colors"
                    >
                      {cite.title}
                    </a>
                    <a
                      href={`https://pubmed.ncbi.nlm.nih.gov/${cite.pmid}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open PubMed article ${cite.pmid}`}
                      className="text-text-subtle hover:text-accent font-mono text-xs ml-2 underline-offset-2 hover:underline"
                    >
                      PMID:{cite.pmid}
                    </a>
                    <p className="text-text-muted text-xs mt-0.5 leading-relaxed">
                      {cite.summary}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter>
        <p className="text-[10px] text-text-subtle italic leading-tight max-w-md">
          This is a decision-support tool, not a clinical order. The provider must
          review, adjust, and approve before prescribing.
        </p>
        <Link href={`/clinic/patients/${patientId}/prescribe`}>
          <Button variant="primary" size="md">
            Apply to prescription
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}

/* ── Detail row ─────────────────────────────────────────────── */

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="text-sm text-text mt-0.5">{value}</p>
    </div>
  );
}

/* ── Main form ──────────────────────────────────────────────── */

export function RecommendForm({
  patientId,
  patientName,
  concerns,
  goals,
}: {
  patientId: string;
  patientName: string;
  concerns: string | null;
  goals: string | null;
}) {
  const [state, formAction] = useFormState<RecommendResult | null, FormData>(
    generateRecommendation,
    null
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state?.ok === false) {
      toast({
        title: "Couldn't generate recommendation",
        description: state.error,
        variant: "error",
      });
    }
  }, [state, toast]);

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="patientId" value={patientId} />

        <Card tone="raised">
          <CardHeader>
            <CardTitle>Patient summary</CardTitle>
            <CardDescription>
              The recommendation engine will use this data along with outcome
              trends, assessment scores, and the research database.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailRow label="Patient" value={patientName} />
              <DetailRow
                label="Presenting concerns"
                value={concerns || "Not specified"}
              />
              <DetailRow
                label="Treatment goals"
                value={goals || "Not specified"}
              />
            </div>
          </CardContent>
          <CardFooter>
            <div className="ml-auto">
              <GenerateButton />
            </div>
          </CardFooter>
        </Card>
      </form>

      {state?.ok && (
        <RecommendationCard
          rec={state.recommendation}
          patientId={patientId}
        />
      )}
    </div>
  );
}
