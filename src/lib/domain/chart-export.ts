// Chart Export — EMR-785
// Assembles a patient's full chart into a portable record set that can be
// downloaded as either a structured `.lfj` JSON package (Leafjourney's own
// canonical format) or a clean, print-friendly HTML document the browser
// can save to PDF.
//
// This is a clinician/patient self-service surface: clinicians export
// records for referrals or records release; patients export their own
// chart for personal copy, second opinion, or transferring care.

import type { Prisma } from "@prisma/client";

export const LFJ_FORMAT_VERSION = "1.0";
export const LFJ_MIME_TYPE = "application/vnd.leafjourney.chart+json";

/* ── Section selection ─────────────────────────────────────────── */

export const CHART_EXPORT_SECTIONS = [
  "demographics",
  "allergies",
  "problems",
  "medications",
  "dosing",
  "outcomes",
  "assessments",
  "notes",
  "labs",
  "documents",
  "encounters",
  "memories",
] as const;

export type ChartExportSection = (typeof CHART_EXPORT_SECTIONS)[number];

export interface SectionDescriptor {
  key: ChartExportSection;
  label: string;
  description: string;
  /** Whether the section is included by default. */
  defaultOn: boolean;
}

export const SECTION_CATALOG: SectionDescriptor[] = [
  {
    key: "demographics",
    label: "Demographics",
    description: "Name, DOB, contact info, address, qualification status.",
    defaultOn: true,
  },
  {
    key: "allergies",
    label: "Allergies & contraindications",
    description: "Allergies, contraindications, safety flags.",
    defaultOn: true,
  },
  {
    key: "problems",
    label: "Problem list",
    description: "Presenting concerns and treatment goals.",
    defaultOn: true,
  },
  {
    key: "medications",
    label: "Medications",
    description: "Active and historical medications across all types.",
    defaultOn: true,
  },
  {
    key: "dosing",
    label: "Cannabis dosing",
    description: "Active dosing regimens and recent dose logs.",
    defaultOn: true,
  },
  {
    key: "outcomes",
    label: "Outcome logs",
    description: "Self-reported pain, sleep, anxiety, mood, etc.",
    defaultOn: true,
  },
  {
    key: "assessments",
    label: "Assessments",
    description: "PHQ-9, GAD-7, pain VAS and other standardized scores.",
    defaultOn: true,
  },
  {
    key: "notes",
    label: "Clinical notes",
    description: "All finalized notes for every encounter.",
    defaultOn: true,
  },
  {
    key: "labs",
    label: "Labs",
    description: "Lab panels with structured results.",
    defaultOn: true,
  },
  {
    key: "documents",
    label: "Documents",
    description: "Uploaded letters, imaging reports, and other files.",
    defaultOn: true,
  },
  {
    key: "encounters",
    label: "Visit history",
    description: "All encounters with date, modality, and reason.",
    defaultOn: true,
  },
  {
    key: "memories",
    label: "Care memory",
    description: "Long-running care notes captured by the agent harness.",
    defaultOn: false,
  },
];

export type SectionFlags = Record<ChartExportSection, boolean>;

export const ALL_SECTIONS_ON: SectionFlags = CHART_EXPORT_SECTIONS.reduce(
  (acc, k) => {
    acc[k] = true;
    return acc;
  },
  {} as SectionFlags,
);

export function parseSectionFlags(
  raw: string | string[] | null | undefined,
): SectionFlags {
  if (!raw) return { ...ALL_SECTIONS_ON };
  const list = Array.isArray(raw) ? raw : raw.split(",");
  const allowed = new Set<string>(CHART_EXPORT_SECTIONS);
  const selected = list.map((s) => s.trim()).filter((s) => allowed.has(s));
  if (selected.length === 0) return { ...ALL_SECTIONS_ON };
  return CHART_EXPORT_SECTIONS.reduce((acc, k) => {
    acc[k] = selected.includes(k);
    return acc;
  }, {} as SectionFlags);
}

/* ── The shape of a built export ───────────────────────────────── */

export interface ChartExportPackage {
  meta: {
    format: "leafjourney.chart";
    version: string;
    exportedAt: string;
    chartId: string;
    practiceName: string;
    preparedBy: string;
    preparedByRole: string;
    sections: ChartExportSection[];
    notice: string;
  };
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    age: number | null;
    email: string | null;
    phone: string | null;
    address: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
    } | null;
    status: string;
    qualificationStatus: string;
    qualificationExpiresAt: string | null;
    chartCompletenessScore: number | null;
  };
  allergies?: {
    allergies: string[];
    contraindications: string[];
  };
  problems?: {
    presentingConcerns: string | null;
    treatmentGoals: string | null;
  };
  medications?: Array<{
    id: string;
    name: string;
    genericName: string | null;
    type: string;
    dosage: string | null;
    prescriber: string | null;
    active: boolean;
    startDate: string | null;
    notes: string | null;
  }>;
  dosing?: {
    regimens: Array<{
      id: string;
      productId: string;
      active: boolean;
      volumePerDose: number;
      volumeUnit: string;
      frequencyPerDay: number;
      timingInstructions: string | null;
      thcMgPerDose: number | null;
      cbdMgPerDose: number | null;
      thcMgPerDay: number | null;
      cbdMgPerDay: number | null;
      patientInstructions: string | null;
      clinicianNotes: string | null;
      startDate: string;
      endDate: string | null;
    }>;
    recentDoseLogs: Array<{
      id: string;
      regimenId: string | null;
      actualVolume: number;
      volumeUnit: string;
      route: string | null;
      thcMg: number | null;
      cbdMg: number | null;
      note: string | null;
      loggedAt: string;
    }>;
  };
  outcomes?: Array<{
    id: string;
    metric: string;
    value: number;
    note: string | null;
    loggedAt: string;
  }>;
  assessments?: Array<{
    id: string;
    assessmentSlug: string;
    assessmentTitle: string;
    score: number | null;
    interpretation: string | null;
    submittedAt: string;
  }>;
  encounters?: Array<{
    id: string;
    status: string;
    modality: string;
    reason: string | null;
    scheduledFor: string | null;
    startedAt: string | null;
    completedAt: string | null;
    chartingCompletedAt: string | null;
  }>;
  notes?: Array<{
    id: string;
    encounterId: string;
    status: string;
    finalizedAt: string | null;
    createdAt: string;
    aiDrafted: boolean;
    blocks: unknown;
    narrative: string | null;
  }>;
  labs?: Array<{
    id: string;
    panelName: string;
    receivedAt: string;
    abnormalFlag: boolean;
    results: unknown;
    signedAt: string | null;
    reviewOutcome: string | null;
  }>;
  documents?: Array<{
    id: string;
    kind: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    tags: string[];
    createdAt: string;
  }>;
  memories?: Array<{
    id: string;
    kind: string;
    content: string;
    confidence: number;
    tags: string[];
    validFrom: string;
    validUntil: string | null;
    source: string;
    sourceKind: string;
    createdAt: string;
  }>;
}

/* ── Data load helpers ─────────────────────────────────────────── */

/**
 * Compute age in whole years from a date of birth.
 */
export function ageFromDob(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

function iso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function isoStrict(d: Date): string {
  return (d instanceof Date ? d : new Date(d)).toISOString();
}

/* ── Build (pure assembly from loaded rows) ────────────────────── */

export interface BuildChartExportArgs {
  sections: SectionFlags;
  practiceName: string;
  preparedBy: string;
  preparedByRole: string;
  patient: PatientForExport;
  medications?: MedicationForExport[];
  regimens?: RegimenForExport[];
  doseLogs?: DoseLogForExport[];
  outcomes?: OutcomeForExport[];
  assessments?: AssessmentForExport[];
  encounters?: EncounterForExport[];
  notes?: NoteForExport[];
  labs?: LabForExport[];
  documents?: DocumentForExport[];
  memories?: MemoryForExport[];
}

// These types describe the *shape we need*, not what Prisma returns exactly.
// Callers pass plain rows from `prisma.*.findMany` and the build function
// reads only the fields it knows about, so adding columns to the schema
// later does not break this module.
export interface PatientForExport {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  status: string;
  qualificationStatus: string;
  qualificationExpiresAt: Date | null;
  allergies: string[];
  contraindications: string[];
  presentingConcerns: string | null;
  treatmentGoals: string | null;
  chartSummary?: { completenessScore: number } | null;
}

export interface MedicationForExport {
  id: string;
  name: string;
  genericName: string | null;
  type: string;
  dosage: string | null;
  prescriber: string | null;
  active: boolean;
  startDate: Date | null;
  notes: string | null;
}

export interface RegimenForExport {
  id: string;
  productId: string;
  active: boolean;
  volumePerDose: number;
  volumeUnit: string;
  frequencyPerDay: number;
  timingInstructions: string | null;
  calculatedThcMgPerDose: number | null;
  calculatedCbdMgPerDose: number | null;
  calculatedThcMgPerDay: number | null;
  calculatedCbdMgPerDay: number | null;
  patientInstructions: string | null;
  clinicianNotes: string | null;
  startDate: Date;
  endDate: Date | null;
}

export interface DoseLogForExport {
  id: string;
  regimenId: string | null;
  actualVolume: number;
  volumeUnit: string;
  route: string | null;
  estimatedThcMg: number | null;
  estimatedCbdMg: number | null;
  note: string | null;
  loggedAt: Date;
}

export interface OutcomeForExport {
  id: string;
  metric: string;
  value: number;
  note: string | null;
  loggedAt: Date;
}

export interface AssessmentForExport {
  id: string;
  score: number | null;
  interpretation: string | null;
  submittedAt: Date;
  assessment: { slug: string; title: string };
}

export interface EncounterForExport {
  id: string;
  status: string;
  modality: string;
  reason: string | null;
  scheduledFor: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  chartingCompletedAt: Date | null;
}

export interface NoteForExport {
  id: string;
  encounterId: string;
  status: string;
  finalizedAt: Date | null;
  createdAt: Date;
  aiDrafted: boolean;
  blocks: Prisma.JsonValue | null;
  narrative: string | null;
}

export interface LabForExport {
  id: string;
  panelName: string;
  receivedAt: Date;
  abnormalFlag: boolean;
  results: Prisma.JsonValue;
  signedAt: Date | null;
  reviewOutcome: string | null;
}

export interface DocumentForExport {
  id: string;
  kind: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  tags: string[];
  createdAt: Date;
}

export interface MemoryForExport {
  id: string;
  kind: string;
  content: string;
  confidence: number;
  tags: string[];
  validFrom: Date;
  validUntil: Date | null;
  source: string;
  sourceKind: string;
  createdAt: Date;
}

export function buildChartExport(args: BuildChartExportArgs): ChartExportPackage {
  const {
    sections,
    practiceName,
    preparedBy,
    preparedByRole,
    patient,
  } = args;

  const selected = CHART_EXPORT_SECTIONS.filter((k) => sections[k]);

  const pkg: ChartExportPackage = {
    meta: {
      format: "leafjourney.chart",
      version: LFJ_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      chartId: patient.id,
      practiceName,
      preparedBy,
      preparedByRole,
      sections: selected,
      notice:
        "This document contains Protected Health Information (PHI). " +
        "Handle in accordance with HIPAA. The .lfj format is a Leafjourney " +
        "canonical chart package and can be re-imported into any compatible EMR.",
    },
    patient: {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth
        ? patient.dateOfBirth.toISOString().slice(0, 10)
        : null,
      age: ageFromDob(patient.dateOfBirth),
      email: sections.demographics ? patient.email : null,
      phone: sections.demographics ? patient.phone : null,
      address: sections.demographics
        ? {
            line1: patient.addressLine1,
            line2: patient.addressLine2,
            city: patient.city,
            state: patient.state,
            postalCode: patient.postalCode,
          }
        : null,
      status: patient.status,
      qualificationStatus: patient.qualificationStatus,
      qualificationExpiresAt: iso(patient.qualificationExpiresAt),
      chartCompletenessScore: patient.chartSummary?.completenessScore ?? null,
    },
  };

  if (sections.allergies) {
    pkg.allergies = {
      allergies: patient.allergies ?? [],
      contraindications: patient.contraindications ?? [],
    };
  }

  if (sections.problems) {
    pkg.problems = {
      presentingConcerns: patient.presentingConcerns,
      treatmentGoals: patient.treatmentGoals,
    };
  }

  if (sections.medications && args.medications) {
    pkg.medications = args.medications.map((m) => ({
      id: m.id,
      name: m.name,
      genericName: m.genericName,
      type: m.type,
      dosage: m.dosage,
      prescriber: m.prescriber,
      active: m.active,
      startDate: iso(m.startDate),
      notes: m.notes,
    }));
  }

  if (sections.dosing && (args.regimens || args.doseLogs)) {
    pkg.dosing = {
      regimens: (args.regimens ?? []).map((r) => ({
        id: r.id,
        productId: r.productId,
        active: r.active,
        volumePerDose: r.volumePerDose,
        volumeUnit: r.volumeUnit,
        frequencyPerDay: r.frequencyPerDay,
        timingInstructions: r.timingInstructions,
        thcMgPerDose: r.calculatedThcMgPerDose,
        cbdMgPerDose: r.calculatedCbdMgPerDose,
        thcMgPerDay: r.calculatedThcMgPerDay,
        cbdMgPerDay: r.calculatedCbdMgPerDay,
        patientInstructions: r.patientInstructions,
        clinicianNotes: r.clinicianNotes,
        startDate: isoStrict(r.startDate),
        endDate: iso(r.endDate),
      })),
      recentDoseLogs: (args.doseLogs ?? []).map((d) => ({
        id: d.id,
        regimenId: d.regimenId,
        actualVolume: d.actualVolume,
        volumeUnit: d.volumeUnit,
        route: d.route,
        thcMg: d.estimatedThcMg,
        cbdMg: d.estimatedCbdMg,
        note: d.note,
        loggedAt: isoStrict(d.loggedAt),
      })),
    };
  }

  if (sections.outcomes && args.outcomes) {
    pkg.outcomes = args.outcomes.map((o) => ({
      id: o.id,
      metric: o.metric,
      value: o.value,
      note: o.note,
      loggedAt: isoStrict(o.loggedAt),
    }));
  }

  if (sections.assessments && args.assessments) {
    pkg.assessments = args.assessments.map((a) => ({
      id: a.id,
      assessmentSlug: a.assessment.slug,
      assessmentTitle: a.assessment.title,
      score: a.score,
      interpretation: a.interpretation,
      submittedAt: isoStrict(a.submittedAt),
    }));
  }

  if (sections.encounters && args.encounters) {
    pkg.encounters = args.encounters.map((e) => ({
      id: e.id,
      status: e.status,
      modality: e.modality,
      reason: e.reason,
      scheduledFor: iso(e.scheduledFor),
      startedAt: iso(e.startedAt),
      completedAt: iso(e.completedAt),
      chartingCompletedAt: iso(e.chartingCompletedAt),
    }));
  }

  if (sections.notes && args.notes) {
    pkg.notes = args.notes.map((n) => ({
      id: n.id,
      encounterId: n.encounterId,
      status: n.status,
      finalizedAt: iso(n.finalizedAt),
      createdAt: isoStrict(n.createdAt),
      aiDrafted: n.aiDrafted,
      blocks: n.blocks,
      narrative: n.narrative,
    }));
  }

  if (sections.labs && args.labs) {
    pkg.labs = args.labs.map((l) => ({
      id: l.id,
      panelName: l.panelName,
      receivedAt: isoStrict(l.receivedAt),
      abnormalFlag: l.abnormalFlag,
      results: l.results,
      signedAt: iso(l.signedAt),
      reviewOutcome: l.reviewOutcome,
    }));
  }

  if (sections.documents && args.documents) {
    pkg.documents = args.documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      originalName: d.originalName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      tags: d.tags,
      createdAt: isoStrict(d.createdAt),
    }));
  }

  if (sections.memories && args.memories) {
    pkg.memories = args.memories.map((m) => ({
      id: m.id,
      kind: m.kind,
      content: m.content,
      confidence: m.confidence,
      tags: m.tags,
      validFrom: isoStrict(m.validFrom),
      validUntil: iso(m.validUntil),
      source: m.source,
      sourceKind: m.sourceKind,
      createdAt: isoStrict(m.createdAt),
    }));
  }

  return pkg;
}

/* ── Serializers ───────────────────────────────────────────────── */

export function toLfjJson(pkg: ChartExportPackage): string {
  return JSON.stringify(pkg, null, 2);
}

export function suggestFilename(
  pkg: ChartExportPackage,
  ext: "lfj" | "html" | "json",
): string {
  const last = pkg.patient.lastName.replace(/[^a-zA-Z0-9-]+/g, "").slice(0, 24);
  const first = pkg.patient.firstName.replace(/[^a-zA-Z0-9-]+/g, "").slice(0, 16);
  const date = new Date().toISOString().slice(0, 10);
  return `chart-${last || "patient"}-${first || ""}-${date}.${ext}`
    .replace(/--+/g, "-")
    .replace(/-\./g, ".");
}

/* ── Printable HTML renderer (browser → PDF via Print dialog) ──── */

function esc(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function section(title: string, body: string): string {
  return `
    <section class="section">
      <h2>${esc(title)}</h2>
      ${body}
    </section>
  `;
}

/**
 * Render a self-contained, printable HTML chart suitable for "Save as PDF"
 * via the browser's print dialog. No external assets — all styles inline.
 */
export function renderPrintableHtml(pkg: ChartExportPackage): string {
  const p = pkg.patient;
  const fullName = `${p.firstName} ${p.lastName}`.trim();
  const printedAt = new Date(pkg.meta.exportedAt).toLocaleString();

  const addr = p.address
    ? [
        p.address.line1,
        p.address.line2,
        [p.address.city, p.address.state, p.address.postalCode]
          .filter(Boolean)
          .join(", "),
      ]
        .filter(Boolean)
        .join("\n")
    : "—";

  const demographics = `
    <table class="kv">
      <tr><th>Name</th><td>${esc(fullName)}</td></tr>
      <tr><th>Date of birth</th><td>${esc(
        p.dateOfBirth ? fmtDate(p.dateOfBirth) : "—",
      )}${p.age != null ? ` <span class="muted">(age ${esc(p.age)})</span>` : ""}</td></tr>
      <tr><th>Status</th><td>${esc(p.status)}</td></tr>
      <tr><th>Qualification</th><td>${esc(p.qualificationStatus)}${
        p.qualificationExpiresAt
          ? ` <span class="muted">· expires ${esc(fmtDate(p.qualificationExpiresAt))}</span>`
          : ""
      }</td></tr>
      <tr><th>Email</th><td>${esc(p.email ?? "—")}</td></tr>
      <tr><th>Phone</th><td>${esc(p.phone ?? "—")}</td></tr>
      <tr><th>Address</th><td class="pre">${esc(addr)}</td></tr>
      <tr><th>Chart readiness</th><td>${
        p.chartCompletenessScore != null ? `${esc(p.chartCompletenessScore)}%` : "—"
      }</td></tr>
    </table>
  `;

  const allergiesBlock = pkg.allergies
    ? section(
        "Allergies & contraindications",
        `
          <p><strong>Allergies:</strong> ${
            pkg.allergies.allergies.length === 0
              ? "<span class='muted'>NKDA</span>"
              : pkg.allergies.allergies.map((a) => `<span class="chip danger">⚠ ${esc(a)}</span>`).join(" ")
          }</p>
          <p><strong>Contraindications:</strong> ${
            pkg.allergies.contraindications.length === 0
              ? "<span class='muted'>None on file</span>"
              : pkg.allergies.contraindications.map((c) => `<span class="chip">${esc(c)}</span>`).join(" ")
          }</p>
        `,
      )
    : "";

  const problemsBlock = pkg.problems
    ? section(
        "Problem list & treatment goals",
        `
          <p><strong>Presenting concerns</strong></p>
          <p class="pre">${
            pkg.problems.presentingConcerns
              ? esc(pkg.problems.presentingConcerns)
              : "<span class='muted'>No presenting concerns documented.</span>"
          }</p>
          <p><strong>Treatment goals</strong></p>
          <p class="pre">${
            pkg.problems.treatmentGoals
              ? esc(pkg.problems.treatmentGoals)
              : "<span class='muted'>No treatment goals documented.</span>"
          }</p>
        `,
      )
    : "";

  const medsBlock = pkg.medications
    ? section(
        "Medications",
        pkg.medications.length === 0
          ? "<p class='muted'>No medications on file.</p>"
          : `<table class="data">
              <thead><tr>
                <th>Name</th><th>Type</th><th>Dosage</th><th>Prescriber</th><th>Active</th>
              </tr></thead>
              <tbody>
                ${pkg.medications
                  .map(
                    (m) => `<tr>
                      <td>${esc(m.name)}${m.genericName ? ` <span class="muted">(${esc(m.genericName)})</span>` : ""}</td>
                      <td>${esc(m.type)}</td>
                      <td>${esc(m.dosage ?? "—")}</td>
                      <td>${esc(m.prescriber ?? "—")}</td>
                      <td>${m.active ? "✓" : "—"}</td>
                    </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>`,
      )
    : "";

  const dosingBlock = pkg.dosing
    ? section(
        "Cannabis dosing",
        `
          <p><strong>Regimens</strong></p>
          ${
            pkg.dosing.regimens.length === 0
              ? "<p class='muted'>No regimens on file.</p>"
              : `<table class="data">
                  <thead><tr>
                    <th>Dose</th><th>Frequency</th><th>THC mg/day</th><th>CBD mg/day</th>
                    <th>Active</th><th>Started</th>
                  </tr></thead>
                  <tbody>
                    ${pkg.dosing.regimens
                      .map(
                        (r) => `<tr>
                          <td>${esc(r.volumePerDose)} ${esc(r.volumeUnit)}</td>
                          <td>${esc(r.frequencyPerDay)}× / day</td>
                          <td>${r.thcMgPerDay != null ? esc(r.thcMgPerDay.toFixed(1)) : "—"}</td>
                          <td>${r.cbdMgPerDay != null ? esc(r.cbdMgPerDay.toFixed(1)) : "—"}</td>
                          <td>${r.active ? "✓" : "—"}</td>
                          <td>${esc(fmtDate(r.startDate))}</td>
                        </tr>`,
                      )
                      .join("")}
                  </tbody>
                </table>`
          }
          <p><strong>Recent dose logs (last ${pkg.dosing.recentDoseLogs.length})</strong></p>
          ${
            pkg.dosing.recentDoseLogs.length === 0
              ? "<p class='muted'>No dose logs in window.</p>"
              : `<table class="data">
                  <thead><tr>
                    <th>Logged</th><th>Volume</th><th>Route</th><th>THC mg</th><th>CBD mg</th><th>Note</th>
                  </tr></thead>
                  <tbody>
                    ${pkg.dosing.recentDoseLogs
                      .map(
                        (d) => `<tr>
                          <td>${esc(fmtDateTime(d.loggedAt))}</td>
                          <td>${esc(d.actualVolume)} ${esc(d.volumeUnit)}</td>
                          <td>${esc(d.route ?? "—")}</td>
                          <td>${d.thcMg != null ? esc(d.thcMg.toFixed(1)) : "—"}</td>
                          <td>${d.cbdMg != null ? esc(d.cbdMg.toFixed(1)) : "—"}</td>
                          <td>${esc(d.note ?? "")}</td>
                        </tr>`,
                      )
                      .join("")}
                  </tbody>
                </table>`
          }
        `,
      )
    : "";

  const outcomesBlock = pkg.outcomes
    ? section(
        "Outcome logs",
        pkg.outcomes.length === 0
          ? "<p class='muted'>No outcome logs.</p>"
          : `<table class="data">
              <thead><tr><th>Logged</th><th>Metric</th><th>Value</th><th>Note</th></tr></thead>
              <tbody>
                ${pkg.outcomes
                  .map(
                    (o) => `<tr>
                      <td>${esc(fmtDateTime(o.loggedAt))}</td>
                      <td>${esc(o.metric)}</td>
                      <td>${esc(o.value)}</td>
                      <td>${esc(o.note ?? "")}</td>
                    </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>`,
      )
    : "";

  const assessmentsBlock = pkg.assessments
    ? section(
        "Assessments",
        pkg.assessments.length === 0
          ? "<p class='muted'>No assessments on file.</p>"
          : `<table class="data">
              <thead><tr><th>Submitted</th><th>Assessment</th><th>Score</th><th>Interpretation</th></tr></thead>
              <tbody>
                ${pkg.assessments
                  .map(
                    (a) => `<tr>
                      <td>${esc(fmtDate(a.submittedAt))}</td>
                      <td>${esc(a.assessmentTitle)} <span class="muted">(${esc(a.assessmentSlug)})</span></td>
                      <td>${a.score != null ? esc(a.score) : "—"}</td>
                      <td>${esc(a.interpretation ?? "—")}</td>
                    </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>`,
      )
    : "";

  const encountersBlock = pkg.encounters
    ? section(
        "Encounter history",
        pkg.encounters.length === 0
          ? "<p class='muted'>No encounters.</p>"
          : `<table class="data">
              <thead><tr>
                <th>Scheduled</th><th>Modality</th><th>Reason</th><th>Status</th><th>Completed</th>
              </tr></thead>
              <tbody>
                ${pkg.encounters
                  .map(
                    (e) => `<tr>
                      <td>${esc(fmtDate(e.scheduledFor))}</td>
                      <td>${esc(e.modality)}</td>
                      <td>${esc(e.reason ?? "—")}</td>
                      <td>${esc(e.status)}</td>
                      <td>${esc(fmtDate(e.completedAt))}</td>
                    </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>`,
      )
    : "";

  const notesBlock = pkg.notes
    ? section(
        "Clinical notes",
        pkg.notes.length === 0
          ? "<p class='muted'>No notes on file.</p>"
          : pkg.notes
              .map((n) => {
                const blocks = Array.isArray(n.blocks)
                  ? (n.blocks as Array<any>)
                  : [];
                return `
                  <article class="note">
                    <header>
                      <span class="muted">${esc(fmtDateTime(n.finalizedAt ?? n.createdAt))}</span>
                      <span class="chip">${esc(n.status)}</span>
                      ${n.aiDrafted ? '<span class="chip">AI-drafted</span>' : ""}
                    </header>
                    ${
                      blocks.length > 0
                        ? blocks
                            .map(
                              (b: any) => `
                              <div class="block">
                                <p class="block-heading">${esc(b.heading ?? "Note")}</p>
                                <p class="pre">${esc(b.body ?? "")}</p>
                              </div>`,
                            )
                            .join("")
                        : n.narrative
                          ? `<p class="pre">${esc(n.narrative)}</p>`
                          : "<p class='muted'>Empty note.</p>"
                    }
                  </article>
                `;
              })
              .join(""),
      )
    : "";

  const labsBlock = pkg.labs
    ? section(
        "Labs",
        pkg.labs.length === 0
          ? "<p class='muted'>No lab results on file.</p>"
          : pkg.labs
              .map((l) => {
                const results = (l.results && typeof l.results === "object"
                  ? l.results
                  : {}) as Record<string, any>;
                const markers = Object.entries(results);
                return `
                  <article class="lab">
                    <header>
                      <strong>${esc(l.panelName)}</strong>
                      <span class="muted">${esc(fmtDate(l.receivedAt))}</span>
                      ${l.abnormalFlag ? '<span class="chip danger">Abnormal</span>' : ""}
                      ${l.signedAt ? `<span class="muted">Signed ${esc(fmtDate(l.signedAt))}</span>` : ""}
                    </header>
                    ${
                      markers.length > 0
                        ? `<table class="data compact">
                            <thead><tr><th>Marker</th><th>Value</th><th>Reference</th></tr></thead>
                            <tbody>
                              ${markers
                                .map(([name, r]) => {
                                  const value = r?.value != null ? `${esc(r.value)}${r.unit ? ` ${esc(r.unit)}` : ""}` : "—";
                                  const refLow = r?.refLow ?? "";
                                  const refHigh = r?.refHigh ?? "";
                                  const ref = refLow !== "" || refHigh !== "" ? `${esc(refLow)}–${esc(refHigh)}` : "—";
                                  return `<tr${r?.abnormal ? ' class="danger"' : ""}>
                                    <td>${esc(name)}</td>
                                    <td>${value}</td>
                                    <td>${ref}</td>
                                  </tr>`;
                                })
                                .join("")}
                            </tbody>
                          </table>`
                        : ""
                    }
                  </article>
                `;
              })
              .join(""),
      )
    : "";

  const documentsBlock = pkg.documents
    ? section(
        "Documents",
        pkg.documents.length === 0
          ? "<p class='muted'>No documents on file.</p>"
          : `<table class="data">
              <thead><tr><th>Name</th><th>Kind</th><th>Size</th><th>Uploaded</th></tr></thead>
              <tbody>
                ${pkg.documents
                  .map(
                    (d) => `<tr>
                      <td>${esc(d.originalName)}</td>
                      <td>${esc(d.kind)}</td>
                      <td>${esc(formatBytes(d.sizeBytes))}</td>
                      <td>${esc(fmtDate(d.createdAt))}</td>
                    </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>`,
      )
    : "";

  const memoriesBlock = pkg.memories
    ? section(
        "Care memory",
        pkg.memories.length === 0
          ? "<p class='muted'>No care memories on file.</p>"
          : pkg.memories
              .map(
                (m) => `<article class="memory">
                  <header>
                    <strong>${esc(m.kind)}</strong>
                    <span class="muted">${esc(fmtDate(m.validFrom))}</span>
                    <span class="muted">conf ${esc((m.confidence * 100).toFixed(0))}%</span>
                  </header>
                  <p class="pre">${esc(m.content)}</p>
                  ${m.tags.length > 0 ? `<p class="tags">${m.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join(" ")}</p>` : ""}
                </article>`,
              )
              .join(""),
      )
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(fullName)} — Chart Export</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <div class="toolbar print-hide">
    <div>
      <strong>${esc(pkg.meta.practiceName)}</strong> · Chart Export Preview
    </div>
    <div class="toolbar-actions">
      <button type="button" onclick="window.print()">Print / Save as PDF</button>
    </div>
  </div>
  <main class="sheet">
    <header class="doc-header">
      <div>
        <p class="eyebrow">${esc(pkg.meta.practiceName)}</p>
        <h1>Patient Chart Export</h1>
        <p class="muted">Prepared by ${esc(pkg.meta.preparedBy)} (${esc(pkg.meta.preparedByRole)}) · ${esc(printedAt)}</p>
      </div>
      <div class="header-right">
        <p>Confidential — Protected Health Information</p>
        <p>Chart ID: <code>${esc(pkg.meta.chartId.slice(0, 16).toUpperCase())}</code></p>
        <p>Format: <code>${esc(pkg.meta.format)} v${esc(pkg.meta.version)}</code></p>
      </div>
    </header>

    <section class="section">
      <h2>Demographics</h2>
      ${demographics}
    </section>

    ${allergiesBlock}
    ${problemsBlock}
    ${medsBlock}
    ${dosingBlock}
    ${outcomesBlock}
    ${assessmentsBlock}
    ${encountersBlock}
    ${notesBlock}
    ${labsBlock}
    ${documentsBlock}
    ${memoriesBlock}

    <footer>
      <p>${esc(pkg.meta.practiceName)} · Confidential PHI · Printed ${esc(printedAt)}</p>
      <p class="muted">${esc(pkg.meta.notice)}</p>
    </footer>
  </main>
</body>
</html>`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const PRINT_CSS = `
  * { box-sizing: border-box; }
  html, body { background: #f7f7f5; margin: 0; padding: 0; color: #111; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; line-height: 1.5; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; background: #fff; border-bottom: 1px solid #e3e3df; }
  .toolbar button { background: linear-gradient(180deg, #10b981, #059669); color: #fff; border: 0; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; }
  .toolbar button:hover { filter: brightness(1.05); }
  .sheet { max-width: 880px; margin: 24px auto; background: #fff; padding: 48px 56px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
  .doc-header h1 { font-size: 22px; margin: 4px 0 6px; }
  .doc-header .eyebrow { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #6b6b6b; margin: 0; font-weight: 600; }
  .doc-header .header-right { text-align: right; font-size: 11px; color: #4b4b4b; }
  .doc-header .header-right p { margin: 2px 0; }
  .section { margin-bottom: 28px; page-break-inside: auto; }
  .section h2 { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #5b5b5b; border-bottom: 1px solid #e3e3df; padding-bottom: 4px; margin: 0 0 12px; }
  table.kv { width: 100%; border-collapse: collapse; }
  table.kv th { text-align: left; font-weight: 500; color: #6b6b6b; width: 180px; padding: 4px 12px 4px 0; vertical-align: top; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  table.kv td { padding: 4px 0; vertical-align: top; }
  table.data { width: 100%; border-collapse: collapse; margin: 4px 0 12px; }
  table.data th { text-align: left; font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: #6b6b6b; border-bottom: 1px solid #d4d4d4; padding: 6px 8px 6px 0; font-weight: 600; }
  table.data td { padding: 6px 8px 6px 0; border-bottom: 1px solid #f0f0ed; vertical-align: top; }
  table.data.compact th, table.data.compact td { padding: 3px 8px 3px 0; }
  table.data tr.danger td { background: #fef2f2; color: #991b1b; }
  .chip { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #f0f0ed; font-size: 11px; margin-right: 4px; }
  .chip.danger { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  .muted { color: #777; }
  .pre { white-space: pre-wrap; margin: 4px 0; }
  .note, .lab, .memory { border: 1px solid #e3e3df; border-radius: 6px; padding: 12px; margin-bottom: 10px; page-break-inside: avoid; }
  .note header, .lab header, .memory header { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
  .block-heading { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #5b5b5b; font-weight: 600; margin: 8px 0 2px; }
  .block { margin-bottom: 6px; }
  footer { margin-top: 36px; padding-top: 12px; border-top: 1px solid #d4d4d4; font-size: 10px; color: #6b6b6b; }
  footer p { margin: 2px 0; }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; background: #f0f0ed; padding: 1px 4px; border-radius: 3px; }
  .tags { margin: 6px 0 0; }

  @media print {
    body { background: #fff; }
    .print-hide { display: none !important; }
    .sheet { box-shadow: none; margin: 0; padding: 0; max-width: none; }
    @page { margin: 0.55in; size: letter; }
    .note, .lab, .memory, .section { page-break-inside: avoid; }
    h1 { font-size: 18pt; }
  }
`;
