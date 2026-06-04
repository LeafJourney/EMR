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

// EMR-959 — the recommendation string that becomes a clickable ICD-10 picker.
const ICD10_RECOMMENDATION = "Document qualifying condition with ICD-10 coding";

// ---------------------------------------------------------------------------
// Eligibility rules engine (deterministic — no API needed)
// ---------------------------------------------------------------------------

interface EligibilityResult {
  eligible: boolean;
  category: "qualified" | "may_qualify" | "not_eligible";
  reasons: string[];
  recommendations: string[];
  insuranceCoverage: string;
  stateProgramEligible: boolean;
  medicareEligible: boolean;
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
  const isMedicare = data.insurance.toLowerCase().includes("medicare") || age >= 65;

  const reasons: string[] = [];
  const recommendations: string[] = [];

  if (isLegalState) {
    reasons.push(`${data.state} has a legal medical cannabis program`);
  } else {
    reasons.push(`${data.state} may not have a medical cannabis program or has limited access`);
  }

  if (hasQualifyingDx) {
    reasons.push(`"${data.diagnosis}" is a qualifying condition in most medical cannabis states`);
  }

  if (isMedicare && age >= 65) {
    reasons.push("Patient may qualify for Medicare CBD reimbursement under the upcoming CMS program (up to $500 annually)");
    recommendations.push("Explore Medicare CBD reimbursement framework — document all CBD prescriptions with clinical justification");
  }

  // Insurance coverage
  let insuranceCoverage = "Not typically covered";
  if (data.insurance.toLowerCase().includes("va") || data.insurance.toLowerCase().includes("veteran")) {
    insuranceCoverage = "VA acknowledges medical cannabis — coverage varies by state";
    recommendations.push("Connect with VA cannabis program coordinator");
  } else if (isMedicare) {
    insuranceCoverage = "Medicare: CBD products may be reimbursable under new CMS program (Schedule 3)";
  }

  if (isLegalState && hasQualifyingDx) {
    recommendations.push("Initiate medical cannabis card application");
    recommendations.push("Document qualifying condition with ICD-10 coding");
    recommendations.push("Schedule certification appointment with cannabis-certified provider");
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
  };
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

          <Card
            tone="raised"
            className={`mb-6 border-l-4 ${
              result.category === "qualified"
                ? "border-l-[color:var(--success)]"
                : result.category === "may_qualify"
                  ? "border-l-[color:var(--highlight)]"
                  : "border-l-[color:var(--danger)]"
            }`}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Eligibility Result</CardTitle>
                <Badge
                  tone={
                    result.category === "qualified"
                      ? "success"
                      : result.category === "may_qualify"
                        ? "warning"
                        : "danger"
                  }
                >
                  {result.category === "qualified"
                    ? "Likely Qualified"
                    : result.category === "may_qualify"
                      ? "May Qualify"
                      : "Not Eligible"}
                </Badge>
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
                      {r}
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
                        {r === ICD10_RECOMMENDATION ? (
                          <Icd10PickerButton seedQuery={formData.diagnosis} />
                        ) : (
                          r
                        )}
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
