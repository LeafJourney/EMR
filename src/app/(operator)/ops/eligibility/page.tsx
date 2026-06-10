"use client";

import { useState } from "react";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, LeafSprig, EditorialRule } from "@/components/ui/ornament";
import { Icd10PickerButton } from "./icd10-picker-button";
import {
  StateLegalityPopupButton,
  QualifyingConditionsPopupButton,
} from "./finding-popups";
import { findStateLegality } from "./us-cannabis-legality";

// EMR-959 — the recommendation string that becomes a clickable ICD-10 picker.
const ICD10_RECOMMENDATION = "Document qualifying condition with ICD-10 coding";
// EMR-949 — recommendation strings the UI turns into actionable links.
const CARD_APPLICATION_RECOMMENDATION = "Initiate medical cannabis card application";
const CERTIFICATION_RECOMMENDATION =
  "Schedule certification appointment with cannabis-certified provider";

// ---------------------------------------------------------------------------
// Eligibility rules engine (deterministic — no API needed)
// ---------------------------------------------------------------------------

// EMR-942 — a finding may carry a "kind" so the UI can attach the right leaf
// popup (state-legality grid / qualifying-conditions list) next to it.
type FindingKind = "state-legality" | "qualifying-condition" | "generic";
interface Finding {
  text: string;
  kind: FindingKind;
}

// EMR-933 — insurance eligibility status drives the PRIMARY result bubble.
//   active = green (coverage applies) · check = yellow (manual verify / errors)
//   not_active = red (no applicable coverage)
type InsuranceStatus = "active" | "check" | "not_active";

interface EligibilityResult {
  eligible: boolean;
  category: "qualified" | "may_qualify" | "not_eligible";
  reasons: Finding[];
  recommendations: string[];
  insuranceCoverage: string;
  stateProgramEligible: boolean;
  medicareEligible: boolean;
  // EMR-933 — derived insurance eligibility (drives the primary bubble).
  insuranceStatus: InsuranceStatus;
  insuranceStatusLabel: string;
  // EMR-949 — the resolved state (full name) so links target the right state.
  state: string;
}

function checkEligibility(data: {
  state: string;
  diagnosis: string;
  insurance: string;
  age: string;
}): EligibilityResult {
  const age = parseInt(data.age) || 0;
  const state = data.state.toLowerCase();

  // States with legal medical cannabis
  const legalMedStates = [
    "california", "colorado", "florida", "illinois", "michigan",
    "new york", "ohio", "pennsylvania", "arizona", "maryland",
    "massachusetts", "new jersey", "virginia", "connecticut",
    "nevada", "oregon", "washington", "missouri", "oklahoma",
    "arkansas", "minnesota", "montana", "new mexico", "rhode island",
    "vermont", "delaware", "hawaii", "louisiana", "maine",
    "new hampshire", "north dakota", "utah", "west virginia",
  ];

  // Qualifying conditions (common across states)
  const qualifyingDx = [
    "chronic pain", "cancer", "ptsd", "epilepsy", "seizures",
    "anxiety", "insomnia", "nausea", "hiv", "aids",
    "crohn's", "ibd", "multiple sclerosis", "ms", "glaucoma",
    "parkinson's", "als", "huntington's", "neuropathy",
  ];

  const isLegalState = legalMedStates.includes(state);
  const dxLower = data.diagnosis.toLowerCase();
  const hasQualifyingDx = qualifyingDx.some((dx) => dxLower.includes(dx));
  const insLower = data.insurance.trim().toLowerCase();
  const isMedicare = insLower.includes("medicare") || age >= 65;
  // EMR-949 — prefer the canonical state name from the legality dataset so any
  // links target the right state regardless of how the operator typed it.
  const resolvedState =
    findStateLegality(data.state)?.name ?? data.state;

  const reasons: Finding[] = [];
  const recommendations: string[] = [];

  if (isLegalState) {
    reasons.push({
      text: `${resolvedState} has a legal medical cannabis program`,
      kind: "state-legality",
    });
  } else {
    reasons.push({
      text: `${resolvedState} may not have a medical cannabis program or has limited access`,
      kind: "state-legality",
    });
  }

  if (hasQualifyingDx) {
    reasons.push({
      text: `"${data.diagnosis}" is a qualifying condition in most medical cannabis states`,
      kind: "qualifying-condition",
    });
  }

  if (isMedicare && age >= 65) {
    reasons.push({
      text: "Patient may qualify for Medicare CBD reimbursement under the upcoming CMS program (up to $500 annually)",
      kind: "generic",
    });
    recommendations.push("Explore Medicare CBD reimbursement framework — document all CBD prescriptions with clinical justification");
  }

  // EMR-933 — derive INSURANCE eligibility deterministically from the inputs.
  // This is distinct from the cannabis-card qualification: it reflects whether
  // an applicable insurance pathway exists for this patient.
  let insuranceCoverage = "Not typically covered";
  let insuranceStatus: InsuranceStatus = "not_active";
  let insuranceStatusLabel = "No active coverage";
  const isVa = insLower.includes("va") || insLower.includes("veteran");

  if (!insLower) {
    // No insurance entered → needs manual verification (yellow).
    insuranceCoverage = "No insurance entered — verify coverage manually";
    insuranceStatus = "check";
    insuranceStatusLabel = "Verify coverage";
  } else if (isVa) {
    insuranceCoverage = "VA acknowledges medical cannabis — coverage varies by state";
    insuranceStatus = "active";
    insuranceStatusLabel = "VA pathway active";
    recommendations.push("Connect with VA cannabis program coordinator");
  } else if (isMedicare) {
    insuranceCoverage = "Medicare: CBD products may be reimbursable under new CMS program (Schedule 3)";
    insuranceStatus = "active";
    insuranceStatusLabel = "Medicare CBD pathway active";
  } else {
    // Commercial / other plan named but no cannabis pathway recognized →
    // surface as "verify" rather than a hard "not active".
    insuranceCoverage = "Not typically covered — verify any cannabis/CBD benefit with the plan";
    insuranceStatus = "check";
    insuranceStatusLabel = "Verify coverage";
  }

  if (isLegalState && hasQualifyingDx) {
    recommendations.push(CARD_APPLICATION_RECOMMENDATION);
    recommendations.push(ICD10_RECOMMENDATION);
    recommendations.push(CERTIFICATION_RECOMMENDATION);
  }

  let category: EligibilityResult["category"];
  if (isLegalState && hasQualifyingDx) {
    category = "qualified";
  } else if (isLegalState || hasQualifyingDx) {
    category = "may_qualify";
  } else {
    category = "not_eligible";
  }

  return {
    eligible: category === "qualified",
    category,
    reasons,
    recommendations,
    insuranceCoverage,
    stateProgramEligible: isLegalState && hasQualifyingDx,
    medicareEligible: isMedicare,
    insuranceStatus,
    insuranceStatusLabel,
    state: resolvedState,
  };
}

// ---------------------------------------------------------------------------
// EMR-949 — render a "Recommended Next Steps" item, turning known steps into
// actionable links:
//   • ICD-10 coding         → opens the ICD-10 picker (existing behavior)
//   • card application      → links to the selected STATE's official MMJ
//                             application page (from us-cannabis-legality)
//   • certification appt    → HELD/disabled link to the Schedule tab, with a
//                             "coming soon — pending clinician directory" note
// ---------------------------------------------------------------------------

function RecommendationItem({
  text,
  state,
  diagnosis,
}: {
  text: string;
  state: string;
  diagnosis: string;
}) {
  if (text === ICD10_RECOMMENDATION) {
    return <Icd10PickerButton seedQuery={diagnosis} />;
  }

  if (text === CARD_APPLICATION_RECOMMENDATION) {
    const legality = findStateLegality(state);
    const url = legality?.applicationUrl ?? null;
    if (url) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-left underline decoration-accent/40 underline-offset-2 hover:decoration-accent text-text-muted hover:text-accent transition-colors"
        >
          {text}
          {legality ? ` (${legality.name})` : ""}
          <span aria-hidden="true" className="text-text-subtle/70">
            ↗
          </span>
        </a>
      );
    }
    // No application URL for the resolved state — show the step as plain text
    // with a short note rather than a dead link.
    return (
      <span>
        {text}
        <span className="ml-1 text-[11px] text-text-subtle italic">
          (no online application found for {state || "this state"})
        </span>
      </span>
    );
  }

  if (text === CERTIFICATION_RECOMMENDATION) {
    // HELD — disabled link to the Schedule tab until the clinician directory
    // (cannabis-certified providers) ships.
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          role="link"
          aria-disabled="true"
          title="Coming soon — pending clinician directory"
          className="text-text-subtle/70 line-through decoration-text-subtle/40 cursor-not-allowed"
        >
          {text}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-text-subtle bg-surface-muted border border-border rounded px-1.5 py-0.5">
          Coming soon — pending clinician directory
        </span>
      </span>
    );
  }

  return <span>{text}</span>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EligibilityPage() {
  const [formData, setFormData] = useState({
    patientName: "",
    state: "",
    diagnosis: "",
    insurance: "",
    age: "",
  });
  const [result, setResult] = useState<EligibilityResult | null>(null);

  function handleCheck() {
    if (!formData.state || !formData.diagnosis) return;
    const r = checkEligibility(formData);
    setResult(r);
  }

  return (
    <PageShell maxWidth="max-w-[960px]">
      <PageHeader
        eyebrow="Insurance & Eligibility"
        title="Cannabis Eligibility Checker"
        description="Determine if a patient qualifies for medical cannabis, state card programs, and insurance-reimbursed CBD products."
      />

      {/* Input form */}
      <Card tone="raised" className="mb-8">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LeafSprig size={14} className="text-accent" />
            Patient Eligibility Check
          </CardTitle>
          <CardDescription>
            Enter patient details to check qualification status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-text-subtle block mb-1">
                Patient name
              </label>
              <input
                type="text"
                value={formData.patientName}
                onChange={(e) =>
                  setFormData({ ...formData, patientName: e.target.value })
                }
                placeholder="Maya Reyes"
                className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-text-subtle block mb-1">
                State
              </label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) =>
                  setFormData({ ...formData, state: e.target.value })
                }
                placeholder="Colorado"
                className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-text-subtle block mb-1">
                Primary diagnosis
              </label>
              <input
                type="text"
                value={formData.diagnosis}
                onChange={(e) =>
                  setFormData({ ...formData, diagnosis: e.target.value })
                }
                placeholder="Chronic pain, Anxiety"
                className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-text-subtle block mb-1">
                Insurance
              </label>
              <input
                type="text"
                value={formData.insurance}
                onChange={(e) =>
                  setFormData({ ...formData, insurance: e.target.value })
                }
                placeholder="Blue Cross, Medicare, VA"
                className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-text-subtle block mb-1">
                Patient age
              </label>
              <input
                type="number"
                value={formData.age}
                onChange={(e) =>
                  setFormData({ ...formData, age: e.target.value })
                }
                placeholder="45"
                className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>
          <Button onClick={handleCheck} size="lg">
            Check eligibility
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          <EditorialRule className="mb-8" />

          {/* EMR-933 — the primary bubble now reflects INSURANCE eligibility
              (green=active / yellow=verify-or-error / red=not active). The
              cannabis-card qualification is shown as a secondary chip below. */}
          <Card
            tone="raised"
            className={`mb-6 border-l-4 ${
              result.insuranceStatus === "active"
                ? "border-l-[color:var(--success)]"
                : result.insuranceStatus === "check"
                  ? "border-l-[color:var(--highlight)]"
                  : "border-l-[color:var(--danger)]"
            }`}
          >
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <CardTitle className="text-xl">Eligibility Result</CardTitle>
                  <p className="text-xs text-text-subtle mt-0.5">
                    Insurance eligibility status
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Primary: insurance eligibility */}
                  <Badge
                    tone={
                      result.insuranceStatus === "active"
                        ? "success"
                        : result.insuranceStatus === "check"
                          ? "warning"
                          : "danger"
                    }
                  >
                    {result.insuranceStatusLabel}
                  </Badge>
                  {/* Secondary: cannabis-card qualification */}
                  <Badge
                    tone={
                      result.category === "qualified"
                        ? "success"
                        : result.category === "may_qualify"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    Card:{" "}
                    {result.category === "qualified"
                      ? "Likely Qualified"
                      : result.category === "may_qualify"
                        ? "May Qualify"
                        : "Not Eligible"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Reasons */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-text-subtle mb-2">
                  Findings
                </p>
                <ul className="space-y-2">
                  {result.reasons.map((r, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-text-muted"
                    >
                      <LeafSprig
                        size={12}
                        className="text-accent/60 mt-1 shrink-0"
                      />
                      <span className="flex-1">{r.text}</span>
                      {/* EMR-942 — leaf popups beside the relevant finding */}
                      {r.kind === "state-legality" && (
                        <StateLegalityPopupButton />
                      )}
                      {r.kind === "qualifying-condition" && (
                        <QualifyingConditionsPopupButton />
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Insurance */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-text-subtle mb-1">
                  Insurance Coverage
                </p>
                <p className="text-sm text-text">{result.insuranceCoverage}</p>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {result.stateProgramEligible && (
                  <Badge tone="success">State program eligible</Badge>
                )}
                {result.medicareEligible && (
                  <Badge tone="accent">Medicare CBD program</Badge>
                )}
              </div>

              {/* Recommendations */}
              {result.recommendations.length > 0 && (
                <div className="p-4 rounded-lg bg-accent/5 border border-accent/10">
                  <p className="text-xs font-medium text-accent mb-2">
                    Recommended Next Steps
                  </p>
                  <ul className="space-y-1.5">
                    {result.recommendations.map((r, i) => (
                      <li
                        key={i}
                        className="text-sm text-text-muted flex items-start gap-2"
                      >
                        <span className="text-accent shrink-0">{i + 1}.</span>
                        <RecommendationItem
                          text={r}
                          state={result.state}
                          diagnosis={formData.diagnosis}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Medicare CBD info card */}
      <Card tone="ambient" className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LeafSprig size={16} className="text-highlight" />
            Medicare CBD Reimbursement Framework
          </CardTitle>
          <CardDescription>EMR-047: Upcoming CMS program for Schedule 3 cannabis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-text-muted leading-relaxed">
              With cannabis reclassified to Schedule 3, CMS is developing a program
              allowing Medicare recipients to purchase up to <strong>$500 of CBD products
              annually</strong> with proper reimbursement. Leafjourney is built to
              track eligibility, purchases, and reimbursement status.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-surface border border-border">
                <p className="font-display text-2xl text-accent">$500</p>
                <p className="text-xs text-text-muted mt-1">Annual CBD benefit</p>
              </div>
              <div className="p-4 rounded-lg bg-surface border border-border">
                <p className="font-display text-2xl text-text">65+</p>
                <p className="text-xs text-text-muted mt-1">Medicare-eligible age</p>
              </div>
              <div className="p-4 rounded-lg bg-surface border border-border">
                <p className="font-display text-2xl text-text">Rx</p>
                <p className="text-xs text-text-muted mt-1">Requires physician certification</p>
              </div>
            </div>
            <p className="text-xs text-text-subtle italic">
              This framework is based on proposed CMS guidelines and may change as
              the program is finalized. Documentation and coding should be maintained
              regardless of current coverage status.
            </p>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
