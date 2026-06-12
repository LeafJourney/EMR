"use client";
/* LEAFNERD — generic surface placeholder (same shell, aperture pattern) */
import { Icon, Badge } from "./primitives";

export function Placeholder({ id }: { id: string }) {
  const titles: Record<string, string> = {
    patients: "Patients", encounters: "Encounters", observations: "Observations", conditions: "Conditions",
    medications: "Medications", labs: "Labs", claims: "Claims", quality: "Quality measures",
    risk: "Risk stratification", analytics: "Analytics Workbench", admin: "Administration",
  };
  const blurbs: Record<string, string> = {
    analytics: "Build cohorts, pick measures, and watch trends resolve into exportable insight — select population → measure → trend → anomaly → save.",
    risk: "Stratify the panel by HCC and utilization models, with explainable drivers behind every score.",
    quality: "Track HEDIS & CMS measures with gap lists, provenance, and one-click outreach cohorts.",
  };
  // Fall back to a humanized id so an unmapped surface never renders blank headings.
  const label = titles[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
  return (
    <div className="page">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">{label}</div>
          <h1 className="page-title">{label}</h1>
        </div>
      </div>
      <div className="empty">
        <div>
          <div className="e-ic"><Icon name="layers" size={28} /></div>
          <h3>{label} lives here</h3>
          <p>{blurbs[id] || `The ${label} surface inherits the same aperture pattern — summary insight up top, consumable analytics in the middle, inspectable detail and provenance one click away.`}</p>
          <div className="wrap-gap" style={{ justifyContent: "center" }}>
            <Badge tone="green" dot={false}>Same shell</Badge>
            <Badge tone="indigo" dot={false}>Provenance drawer</Badge>
            <Badge tone="amber" dot={false}>In this prototype: Overview & FHIR Explorer</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
