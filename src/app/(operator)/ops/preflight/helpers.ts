/**
 * EMR-1139 — pure helpers for the Pre-Flight Claims Dashboard.
 *
 * Everything in this file is synchronous and side-effect free (no Prisma,
 * no network) so it can be unit-tested directly (see helpers.test.ts) and
 * shared between the server page and the remediation server action.
 *
 * The heavy lifting (feature extraction, P_denial scoring, root-cause
 * attribution, one-click remediation) lives in the pre-flight engine —
 * src/lib/billing/preflight — and is consumed strictly via its public
 * exports per the engine's input contract.
 */

import type {
  ClaimOutcomeRow,
  PreflightClaim,
  PreflightServiceLine,
  RootCauseFinding,
} from "@/lib/billing/preflight";
import { PREFLIGHT_LCD_RULES } from "@/lib/billing/preflight";

// ---------------------------------------------------------------------------
// Candidate selection
// ---------------------------------------------------------------------------

/**
 * Pre-submission claims the pre-flight gate evaluates: drafts still being
 * coded plus "ready" claims awaiting submission (scrub passed). Mirrors the
 * "ready to submit" population the scrub workbench queries — the gate sits
 * between coding_scrub and submission, so already-submitted statuses are
 * out of scope.
 */
export const PREFLIGHT_CANDIDATE_STATUSES = ["draft", "ready"] as const;

// ---------------------------------------------------------------------------
// Claim JSON → engine input shapes
// ---------------------------------------------------------------------------

/** Loose shape of one entry in Claim.cptCodes / Claim.icd10Codes JSON. */
interface CodeJsonEntry {
  code?: unknown;
  label?: unknown;
  units?: unknown;
  chargeAmount?: unknown;
  modifiers?: unknown;
}

/** Parse the Claim.cptCodes JSON column into engine service lines. */
export function parseServiceLines(cptCodesJson: unknown): PreflightServiceLine[] {
  if (!Array.isArray(cptCodesJson)) return [];
  const lines: PreflightServiceLine[] = [];
  for (const raw of cptCodesJson as CodeJsonEntry[]) {
    if (!raw || typeof raw.code !== "string" || raw.code.length === 0) continue;
    lines.push({
      code: raw.code,
      label: typeof raw.label === "string" ? raw.label : undefined,
      units: typeof raw.units === "number" ? raw.units : undefined,
      chargeAmount:
        typeof raw.chargeAmount === "number" ? raw.chargeAmount : undefined,
      modifiers: Array.isArray(raw.modifiers)
        ? (raw.modifiers as unknown[]).filter(
            (m): m is string => typeof m === "string",
          )
        : undefined,
    });
  }
  return lines;
}

/** Parse the Claim.icd10Codes JSON column into engine diagnosis entries. */
export function parseIcdCodes(
  icd10CodesJson: unknown,
): Array<{ code: string; label?: string }> {
  if (!Array.isArray(icd10CodesJson)) return [];
  const codes: Array<{ code: string; label?: string }> = [];
  for (const raw of icd10CodesJson as CodeJsonEntry[]) {
    if (!raw || typeof raw.code !== "string" || raw.code.length === 0) continue;
    codes.push({
      code: raw.code,
      label: typeof raw.label === "string" ? raw.label : undefined,
    });
  }
  return codes;
}

/** Minimal claim row the page/action select for the engine input. */
export interface CandidateClaimInput {
  id: string;
  payerName: string | null;
  payerId: string | null;
  serviceDate: Date;
  cptCodes: unknown;
  icd10Codes: unknown;
}

export function toPreflightClaim(claim: CandidateClaimInput): PreflightClaim {
  return {
    claimId: claim.id,
    payerName: claim.payerName,
    payerId: claim.payerId,
    serviceDate: claim.serviceDate,
    serviceLines: parseServiceLines(claim.cptCodes),
    icd10Codes: parseIcdCodes(claim.icd10Codes),
  };
}

/** Map engine service lines back into the Claim.cptCodes JSON shape so a
 *  remediated claim persists losslessly (label/units/chargeAmount kept). */
export function serviceLinesToCptJson(
  lines: PreflightServiceLine[],
): Array<Record<string, unknown>> {
  return lines.map((l) => {
    const entry: Record<string, unknown> = { code: l.code };
    if (l.label !== undefined) entry.label = l.label;
    if (l.units !== undefined) entry.units = l.units;
    if (l.chargeAmount !== undefined) entry.chargeAmount = l.chargeAmount;
    if (l.modifiers !== undefined && l.modifiers.length > 0)
      entry.modifiers = l.modifiers;
    return entry;
  });
}

/** "99214" → "99214-25" when modifiers are present (worklist display). */
export function displayCode(line: PreflightServiceLine): string {
  const mods = line.modifiers ?? [];
  return mods.length > 0 ? `${line.code}-${mods.join("-")}` : line.code;
}

// ---------------------------------------------------------------------------
// Narrative note extraction (Encounter → Note → text)
// ---------------------------------------------------------------------------

interface NoteRow {
  status: string;
  narrative: string | null;
  blocks: unknown;
  updatedAt: Date;
}

/** Flatten a Note's structured blocks + free-form narrative into one text
 *  blob for the engine's phi_narrative extractor. */
export function noteToNarrativeText(note: Pick<NoteRow, "narrative" | "blocks">): string {
  const parts: string[] = [];
  if (Array.isArray(note.blocks)) {
    for (const raw of note.blocks as Array<{ heading?: unknown; body?: unknown }>) {
      if (raw && typeof raw.body === "string" && raw.body.trim().length > 0) {
        parts.push(raw.body.trim());
      }
    }
  }
  if (note.narrative && note.narrative.trim().length > 0) {
    parts.push(note.narrative.trim());
  }
  return parts.join("\n\n");
}

/** Prefer the most recent finalized note, falling back to the most recent
 *  draft, falling back to empty (the engine treats it as a thin note). */
export function pickEncounterNarrative(notes: NoteRow[]): string {
  const sorted = [...notes].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
  const best =
    sorted.find((n) => n.status === "finalized") ?? sorted[0] ?? null;
  return best ? noteToNarrativeText(best) : "";
}

// ---------------------------------------------------------------------------
// Payer history — one adjudicated-claims query, grouped by payer
// ---------------------------------------------------------------------------

/** Shape of the single adjudicated-outcomes query the page runs (claims
 *  with a payer decision in the rolling window). */
export interface AdjudicatedClaimRow {
  payerName: string | null;
  payerId: string | null;
  status: string; // paid | denied | partial (filtered in the query)
  cptCodes: unknown;
  paidAt: Date | null;
  deniedAt: Date | null;
}

export function payerKey(payerName: string | null | undefined): string | null {
  const trimmed = payerName?.trim().toLowerCase();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

const OUTCOME_BY_STATUS: Record<string, ClaimOutcomeRow["outcome"]> = {
  paid: "paid",
  denied: "denied",
  partial: "partial",
};

/**
 * Expand adjudicated claims into per-(claim, CPT) ClaimOutcomeRows — the
 * engine's payerHistory contract — and group them by payer so the page
 * runs ONE history query and each claim's runPreflight only sees its own
 * payer's rows. Rows without a payer name or an adjudication date are
 * dropped (the engine's window filter needs a real timestamp).
 */
export function groupPayerHistory(
  rows: AdjudicatedClaimRow[],
): Map<string, ClaimOutcomeRow[]> {
  const byPayer = new Map<string, ClaimOutcomeRow[]>();
  for (const row of rows) {
    const key = payerKey(row.payerName);
    if (!key) continue;
    const outcome = OUTCOME_BY_STATUS[row.status];
    if (!outcome) continue;
    const adjudicatedAt =
      outcome === "denied"
        ? (row.deniedAt ?? row.paidAt)
        : (row.paidAt ?? row.deniedAt);
    if (!adjudicatedAt) continue;
    const lines = parseServiceLines(row.cptCodes);
    if (lines.length === 0) continue;
    const bucket = byPayer.get(key) ?? [];
    for (const line of lines) {
      bucket.push({
        payerName: row.payerName!,
        payerId: row.payerId,
        cptCode: line.code,
        outcome,
        adjudicatedAt,
      });
    }
    byPayer.set(key, bucket);
  }
  return byPayer;
}

// ---------------------------------------------------------------------------
// Context-aware evidence — narrative sentences + highlight terms
// ---------------------------------------------------------------------------

/**
 * Phrases the engine's Modifier-25 evidence scanner looks for in the note
 * (mirrors MOD25_EVIDENCE_PHRASES in src/lib/billing/preflight/features.ts,
 * which is not exported — keep in sync).
 */
export const MOD25_HIGHLIGHT_PHRASES = [
  "separately identifiable",
  "separate evaluation",
  "separate and distinct",
  "distinct service",
  "in addition to",
  "unrelated to the",
  "separate e/m",
  "separate assessment",
];

/**
 * Build the set of phrases worth highlighting in the narrative for a given
 * claim: Modifier-25 evidence phrases when a modifier finding exists, plus
 * every LCD documentation keyword for the claim's CPTs (both the present
 * ones — proof of coverage — and the missing ones, which simply won't
 * match anything).
 */
export function collectHighlightTerms(
  findings: RootCauseFinding[],
  cptCodes: string[],
): string[] {
  const terms = new Set<string>();
  if (findings.some((f) => f.category === "modifier_deficiency")) {
    for (const p of MOD25_HIGHLIGHT_PHRASES) terms.add(p);
  }
  const cptSet = new Set(cptCodes);
  for (const rule of PREFLIGHT_LCD_RULES) {
    if (!cptSet.has(rule.cptCode)) continue;
    for (const k of rule.requiredDocKeywords) terms.add(k.toLowerCase());
  }
  for (const f of findings) {
    if (f.action.kind === "augment_documentation") {
      for (const k of f.action.requiredKeywords) terms.add(k.toLowerCase());
    }
  }
  return [...terms];
}

export interface EvidenceSentence {
  text: string;
  highlight: boolean;
  /** Which highlight terms this sentence matched (tooltip/aria use). */
  matchedTerms: string[];
}

/**
 * Split the narrative into sentences and mark the ones containing any
 * highlight term — the inline "Review narrative note context" panel.
 */
export function splitNarrativeForEvidence(
  narrative: string,
  terms: string[],
): EvidenceSentence[] {
  const normalizedTerms = terms.map((t) => t.toLowerCase()).filter(Boolean);
  return narrative
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((text) => {
      const lower = text.toLowerCase();
      const matchedTerms = normalizedTerms.filter((t) => lower.includes(t));
      return { text, highlight: matchedTerms.length > 0, matchedTerms };
    });
}
