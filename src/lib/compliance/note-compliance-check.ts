/**
 * EMR-065 — Note-level compliance check.
 *
 * The orchestration-side `complianceAuditAgent` looks at activity patterns
 * (off-hours access, bulk exports, etc.). This module is the OTHER half:
 * it audits a single clinical note for documentation gaps that CMS, the
 * Joint Commission, and major commercial insurers (Aetna, BCBS, UHC,
 * Cigna, Humana, Medicare, Medicaid) flag during chart reviews.
 *
 * Rule sources:
 *   - CMS — 1995 / 1997 E/M Documentation Guidelines, MDM table
 *   - Joint Commission RC.01.01.01 — record contains enough information
 *     to identify the patient, support the diagnosis, justify treatment,
 *     and promote continuity
 *   - Aetna / UHC clinical-payment-policy: medical-necessity statement
 *   - 42 CFR §482.24 — Medical records (Conditions of Participation)
 *
 * Pure function. The caller hands us a structured note + visit context;
 * we hand back a list of findings ranked critical / warning / info. The
 * `complianceAuditAgent` calls this on every finalized note and surfaces
 * any "critical" finding as a high-severity audit event.
 */

export interface NoteForComplianceCheck {
  noteId: string;
  noteType?: string | null;
  authorRole?: string | null;
  /** Chief complaint or "reason for visit" — required by JC RC.01.01.01. */
  chiefComplaint?: string | null;
  /** History of present illness narrative. */
  hpi?: string | null;
  /** Physical exam narrative or structured findings. */
  exam?: string | null;
  /** Free-text assessment / plan section. */
  assessment?: string | null;
  /** ICD-10 codes attached to the encounter. */
  icd10Codes?: string[] | null;
  /** CPT codes billed for the encounter. */
  cptCodes?: string[] | null;
  /** Medical decision-making complexity level when present. */
  mdmLevel?: "straightforward" | "low" | "moderate" | "high" | null;
  /** True iff the clinician has signed the note. */
  signed?: boolean | null;
  signedAt?: string | Date | null;
  /** When the visit occurred — used for 24h-signing rule. */
  encounterAt?: string | Date | null;
  /** True iff a controlled substance was prescribed at this visit. */
  controlledSubstancePrescribed?: boolean | null;
  /** True iff PDMP / state CURES was queried before prescribing. */
  pdmpQueried?: boolean | null;
  /** True iff a treatment plan was documented (justifies the encounter). */
  treatmentPlanDocumented?: boolean | null;
  /** True iff the patient was counseled about risks / alternatives. */
  patientCounseled?: boolean | null;
}

export type ComplianceFindingSeverity = "critical" | "warning" | "info";

export interface ComplianceFinding {
  id: string;
  severity: ComplianceFindingSeverity;
  /** Authority + citation that drives the rule. */
  citation: string;
  title: string;
  detail: string;
  remediation: string;
}

export interface NoteComplianceReport {
  noteId: string;
  findings: ComplianceFinding[];
  /** "passes" iff no critical findings were emitted. */
  passes: boolean;
  /** Highest severity emitted; null when no findings. */
  topSeverity: ComplianceFindingSeverity | null;
  /** Quick counts the dashboard can render without re-filtering. */
  counts: Record<ComplianceFindingSeverity, number>;
}

const NOTE_TYPES_REQUIRING_EXAM = new Set([
  "office_visit",
  "follow_up",
  "initial_consult",
  "annual_wellness",
]);

const SEVERITY_RANK: Record<ComplianceFindingSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

const HOURS_24 = 24 * 60 * 60 * 1000;

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? null : d;
}

function isBlank(value: string | null | undefined, min = 1): boolean {
  return !value || value.trim().length < min;
}

const HIGH_COMPLEXITY_CPT = new Set([
  "99204",
  "99205",
  "99214",
  "99215",
  "99244",
  "99245",
]);

const CONTROLLED_SUBSTANCE_ICD_HINTS = ["F11", "F13", "F19"];

export function checkNoteCompliance(
  note: NoteForComplianceCheck,
): NoteComplianceReport {
  const findings: ComplianceFinding[] = [];

  // ------------------------------------------------------------------
  // Joint Commission RC.01.01.01 — record must identify the reason for
  // the encounter and justify the treatment.
  // ------------------------------------------------------------------
  if (isBlank(note.chiefComplaint)) {
    findings.push({
      id: "jc.rc01.cc",
      severity: "critical",
      citation: "Joint Commission RC.01.01.01",
      title: "Chief complaint missing",
      detail:
        "Every encounter note must record the reason for the visit. Joint Commission considers the absence of a chief complaint a documentation deficiency.",
      remediation:
        "Add a chief complaint or reason-for-visit statement to the note header before finalizing.",
    });
  }

  if (isBlank(note.assessment, 10)) {
    findings.push({
      id: "cms.em.assessment",
      severity: "critical",
      citation: "CMS E/M Documentation Guidelines",
      title: "Assessment missing or trivial",
      detail:
        "The assessment section must articulate the diagnosis or differential. CMS chart reviewers downgrade or deny billed levels when the assessment is blank or boilerplate.",
      remediation:
        "Write a substantive assessment summarizing the diagnostic impression and rationale.",
    });
  }

  if ((note.icd10Codes?.length ?? 0) === 0) {
    findings.push({
      id: "cms.diagnosis.code",
      severity: "critical",
      citation: "42 CFR §482.24",
      title: "No diagnosis code attached",
      detail:
        "Every billed encounter must carry at least one ICD-10 diagnosis code that supports medical necessity.",
      remediation: "Attach the primary ICD-10 diagnosis before finalizing.",
    });
  }

  // ------------------------------------------------------------------
  // CMS 1995/1997 E/M — exam component
  // ------------------------------------------------------------------
  if (
    note.noteType &&
    NOTE_TYPES_REQUIRING_EXAM.has(note.noteType) &&
    isBlank(note.exam, 5)
  ) {
    findings.push({
      id: "cms.em.exam",
      severity: "warning",
      citation: "CMS 1995/1997 E/M Documentation Guidelines",
      title: "Physical exam section is empty",
      detail:
        "Office visits and follow-ups require an exam component to justify the billed E/M level. Documentation reviewers downcode when this is blank.",
      remediation: "Document at least the focused-system exam findings for this visit.",
    });
  }

  // ------------------------------------------------------------------
  // High-complexity codes need high MDM + assessment
  // ------------------------------------------------------------------
  if (note.cptCodes?.some((c) => HIGH_COMPLEXITY_CPT.has(c))) {
    if (!note.mdmLevel || note.mdmLevel === "straightforward" || note.mdmLevel === "low") {
      findings.push({
        id: "cms.em.mdm-mismatch",
        severity: "warning",
        citation: "CMS E/M Code Selection",
        title: "Billed E/M level exceeds documented MDM",
        detail:
          `Billed CPT ${[...new Set(note.cptCodes!.filter((c) => HIGH_COMPLEXITY_CPT.has(c)))].join(", ")} but medical decision-making is documented as ${note.mdmLevel ?? "unspecified"}.`,
        remediation:
          "Either downgrade the code or update MDM to reflect the data reviewed, problems addressed, and risk.",
      });
    }
  }

  // ------------------------------------------------------------------
  // Treatment plan + counseling — Aetna / UHC medical-necessity reviews
  // ------------------------------------------------------------------
  if (note.treatmentPlanDocumented === false) {
    findings.push({
      id: "payer.tx-plan",
      severity: "warning",
      citation: "Aetna / UHC Clinical Payment Policy",
      title: "Treatment plan not documented",
      detail:
        "Commercial payers require a documented plan (medications, follow-up interval, referrals) to demonstrate medical necessity.",
      remediation: "Add a Plan section identifying interventions and follow-up timing.",
    });
  }

  if (note.patientCounseled === false) {
    findings.push({
      id: "payer.counseling",
      severity: "info",
      citation: "BCBS / Cigna Medical Necessity",
      title: "Patient counseling not documented",
      detail:
        "When risks and alternatives are not documented as discussed with the patient, payers sometimes deny coverage.",
      remediation:
        "Note that risks, benefits, and alternatives were discussed and the patient consented to the plan.",
    });
  }

  // ------------------------------------------------------------------
  // Controlled substances — PDMP query required in most states.
  // ------------------------------------------------------------------
  const sudIcd = note.icd10Codes?.some((c) =>
    CONTROLLED_SUBSTANCE_ICD_HINTS.some((p) => c.startsWith(p)),
  );
  if (note.controlledSubstancePrescribed && note.pdmpQueried === false) {
    findings.push({
      id: "cms.pdmp",
      severity: "critical",
      citation: "CMS / SUPPORT Act / State PDMP Mandate",
      title: "PDMP query not documented before controlled-substance Rx",
      detail:
        "Federal and most state laws require providers to check the prescription-drug monitoring program before prescribing a controlled substance.",
      remediation:
        "Query CURES / state PDMP and attach the result to the note before finalizing the prescription.",
    });
  }
  if (sudIcd && note.controlledSubstancePrescribed) {
    findings.push({
      id: "cms.sud-controlled",
      severity: "warning",
      citation: "42 CFR Part 2",
      title: "Controlled substance prescribed alongside SUD diagnosis",
      detail:
        "Patient carries an active substance-use diagnosis (F11/F13/F19). Documented clinical justification is required for any controlled-substance Rx.",
      remediation:
        "Document the medical-necessity rationale and patient counseling for this prescribing decision.",
    });
  }

  // ------------------------------------------------------------------
  // Signature + timeliness — JC RC.02.01.07 / CMS 482.24(c)(1)
  // ------------------------------------------------------------------
  if (!note.signed) {
    findings.push({
      id: "jc.rc02.signed",
      severity: "critical",
      citation: "Joint Commission RC.02.01.07",
      title: "Note not signed",
      detail:
        "Unsigned notes are not part of the legal record and cannot be billed.",
      remediation: "Sign the note before exporting or billing.",
    });
  } else {
    const encounter = toDate(note.encounterAt ?? null);
    const signedAt = toDate(note.signedAt ?? null);
    if (encounter && signedAt && signedAt.getTime() - encounter.getTime() > HOURS_24) {
      findings.push({
        id: "cms.482.24.signing-window",
        severity: "warning",
        citation: "CMS 42 CFR §482.24(c)(1)",
        title: "Note signed more than 24 hours after the encounter",
        detail:
          "CMS Conditions of Participation expect entries to be authenticated promptly. Notes signed days after the visit are flagged in chart reviews.",
        remediation:
          "Sign visit notes within 24 hours. If delayed, document the reason in the note.",
      });
    }
  }

  // Sort by severity (critical first), preserving rule order within tier.
  findings.sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );

  const counts: Record<ComplianceFindingSeverity, number> = {
    critical: 0,
    warning: 0,
    info: 0,
  };
  for (const f of findings) counts[f.severity] += 1;
  const topSeverity =
    findings.length === 0 ? null : findings[0].severity;

  return {
    noteId: note.noteId,
    findings,
    passes: counts.critical === 0,
    topSeverity,
    counts,
  };
}

/**
 * Roll up a batch of per-note reports into one practice-wide summary.
 * Used by the compliance dashboard's "notes that need attention" tile.
 */
export interface BatchComplianceReport {
  notesScanned: number;
  notesWithFindings: number;
  notesWithCritical: number;
  byRule: Array<{ ruleId: string; severity: ComplianceFindingSeverity; count: number }>;
}

export function summarizeBatch(
  reports: NoteComplianceReport[],
): BatchComplianceReport {
  const ruleCount = new Map<string, { sev: ComplianceFindingSeverity; n: number }>();
  let withFindings = 0;
  let withCritical = 0;

  for (const rep of reports) {
    if (rep.findings.length > 0) withFindings += 1;
    if (rep.counts.critical > 0) withCritical += 1;
    for (const f of rep.findings) {
      const cur = ruleCount.get(f.id);
      if (cur) cur.n += 1;
      else ruleCount.set(f.id, { sev: f.severity, n: 1 });
    }
  }

  const byRule = [...ruleCount.entries()]
    .map(([ruleId, { sev, n }]) => ({
      ruleId,
      severity: sev,
      count: n,
    }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        b.count - a.count,
    );

  return {
    notesScanned: reports.length,
    notesWithFindings: withFindings,
    notesWithCritical: withCritical,
    byRule,
  };
}
