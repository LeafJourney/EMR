// Specialty-template coverage — what kind of operational machine this practice
// is configured to be. Surfaces the selected specialty + how much of its
// tooling (workflows, charting, roles, clinician/patient shells) has actually
// been applied, with honest "partially configured / not configured" states.
// All derived from PracticeConfiguration template fields — no hardcoded
// per-specialty assumptions.

import { Badge } from "@/components/ui/badge";
import type { PracticeCardData } from "../types";
import { humanizeCareModel, humanizeSpecialty } from "../types";

const PIECES: {
  key: keyof NonNullable<PracticeCardData["specialtyCoverage"]>;
  label: string;
}[] = [
  { key: "workflows", label: "Workflows" },
  { key: "charting", label: "Charting templates" },
  { key: "roles", label: "Role & permission templates" },
  { key: "physicianShell", label: "Clinician workspace layout" },
  { key: "patientShell", label: "Patient portal layout" },
];

export function PracticeSpecialtyCoverage({
  practice,
}: {
  practice: PracticeCardData;
}) {
  const coverage = practice.specialtyCoverage;
  const hasSpecialty = !!practice.specialty;
  const applied = coverage ? PIECES.filter((p) => coverage[p.key]).length : 0;
  const total = PIECES.length;

  let stateLabel: string;
  let stateTone: "neutral" | "warning" | "success" | "info";
  if (!hasSpecialty) {
    stateLabel = "No specialty selected";
    stateTone = "neutral";
  } else if (!coverage || applied === 0) {
    stateLabel = "Template not configured";
    stateTone = "warning";
  } else if (applied < total) {
    stateLabel = "Template partially configured";
    stateTone = "info";
  } else {
    stateLabel = "Template applied";
    stateTone = "success";
  }

  return (
    <section className="rounded-2xl border border-border bg-surface-raised p-5 md:p-6 grid gap-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
            Specialty configuration
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-lg text-text tracking-tight">
              {humanizeSpecialty(practice.specialty)}
            </span>
            {practice.specialtyVersion && (
              <span className="text-[12px] text-text-muted">
                v{practice.specialtyVersion}
              </span>
            )}
            <Badge tone={stateTone}>{stateLabel}</Badge>
          </div>
          {practice.careModel && (
            <div className="text-[12px] text-text-muted mt-1">
              Care model: {humanizeCareModel(practice.careModel)}
            </div>
          )}
        </div>
        {hasSpecialty && (
          <div className="text-right">
            <div className="font-display text-2xl text-text tabular-nums">
              {applied}/{total}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted">
              tooling applied
            </div>
          </div>
        )}
      </div>

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {PIECES.map((p) => {
          const done = !!coverage?.[p.key];
          return (
            <li key={p.key} className="flex items-center gap-2 text-[13px]">
              <span
                className={done ? "text-emerald-600" : "text-text-subtle"}
                aria-hidden="true"
              >
                {done ? "✓" : "○"}
              </span>
              <span className={done ? "text-text" : "text-text-muted"}>
                {p.label}
                {!done && " — not configured"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
