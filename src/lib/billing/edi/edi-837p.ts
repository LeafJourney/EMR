// EMR-216 — Production 837P (Professional) generator
// ---------------------------------------------------
// Emits a complete ANSI X12 v5010 837P transaction set covering every
// loop the implementation guide marks as required for a primary or
// secondary professional claim:
//
//   ISA / GS / ST envelope
//   Loop 1000A — Submitter name
//   Loop 1000B — Receiver name
//   Loop 2000A — Billing provider HL
//     Loop 2010AA — Billing provider name + address + tax ID
//     Loop 2010AB — Pay-to address (when different)
//   Loop 2000B — Subscriber HL
//     Loop 2010BA — Subscriber name + demographics
//     Loop 2010BB — Payer name + ID
//   Loop 2000C — Patient HL (only when patient ≠ subscriber)
//     Loop 2010CA — Patient name + demographics
//   Loop 2300 — Claim
//     CLM, HI (diagnoses), DTP (dates), REF (prior auth, payer claim ctrl)
//     Loop 2310B — Rendering provider name
//     Loop 2320 — Other subscriber/payer (secondary claims)
//       AMT, CAS — primary payer adjudication amounts
//     Loop 2400 — Service line
//       SV1, DTP, REF
//       Loop 2430 — Line adjudication (when filing as secondary)
//
// The emitter is purely functional: feed it a `Claim837Input` and it
// returns a string. All data lookups happen upstream.

import {
  buildGe,
  buildGs,
  buildIea,
  buildIsa,
  buildSe,
  buildSt,
  DEFAULT_DELIMITERS,
  formatAmount,
  formatD8,
  joinSegments,
  segment,
  type X12Delimiters,
  type X12Element,
} from "./x12";
import type { BillingAddress } from "../identifiers";

// ---------------------------------------------------------------------------
// Input types — a normalized projection of Claim + Patient + Provider + Org
// ---------------------------------------------------------------------------

export interface Submitter {
  name: string;
  id: string;
  contactName: string;
  contactPhone: string; // digits only
}

export interface Receiver {
  name: string;
  id: string; // clearinghouse-assigned, NOT the payer id
}

export interface BillingProvider {
  organizationName: string;
  npi: string; // 10 digits
  taxId: string; // EIN, no hyphen — 9 digits
  taxonomyCode: string | null;
  address: BillingAddress;
  payToAddress: BillingAddress | null;
}

export interface Subscriber {
  memberId: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  dateOfBirth: Date;
  gender: "M" | "F" | "U";
  address: BillingAddress;
  /** "18" = self, "01" = spouse, "19" = child, "G8" = other */
  relationshipToPatient: "18" | "01" | "19" | "G8";
  /** "MB" Medicare-B, "MC" Medicaid, "CI" commercial, "BL" BlueCross,
   *  "16" HMO Medicare risk, "ZZ" mutually defined / other */
  insuranceType: "MB" | "MC" | "CI" | "BL" | "16" | "ZZ";
}

export interface PatientDemographics {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  dateOfBirth: Date;
  gender: "M" | "F" | "U";
  address: BillingAddress;
}

export interface Payer {
  name: string;
  payerId: string;
}

export interface ServiceLine {
  /** 1-based line sequence number. */
  sequence: number;
  cptCode: string;
  modifiers: string[]; // up to 4
  units: number;
  chargeCents: number;
  /** ICD-10 pointer indices (1-based, max 4) into the claim's diagnosis list. */
  diagnosisPointers: number[];
  serviceDate: Date;
  /** "11" office, "02" telehealth (audio+video), "10" telehealth audio-only, etc. */
  placeOfService?: string;
  /** Filled when filing as secondary — primary payer's allowed/paid for this line. */
  primaryAdjudication?: {
    allowedCents: number;
    paidCents: number;
    cas: ClaimAdjustment[];
    /** Date the primary adjudication ERA was received. */
    eraDate: Date;
  };
}

/** Claim Adjustment (CAS) — primary payer's contractual / patient-resp /
 *  other adjustments, used in Loop 2320 (claim level) and 2430 (line level)
 *  when filing a secondary claim. */
export interface ClaimAdjustment {
  /** "CO" contractual, "PR" patient resp, "OA" other, "PI" payer-initiated */
  groupCode: "CO" | "PR" | "OA" | "PI";
  /** CARC code (e.g. "45" = charge exceeds fee schedule). */
  reasonCode: string;
  amountCents: number;
  /** Optional units adjustment. */
  units?: number;
}

export interface Claim837Input {
  submitter: Submitter;
  receiver: Receiver;
  billingProvider: BillingProvider;
  subscriber: Subscriber;
  /** When subscriber === patient this is null and we skip Loop 2000C. */
  patient: PatientDemographics | null;
  payer: Payer;
  rendering: {
    npi: string;
    firstName: string;
    lastName: string;
    taxonomyCode: string | null;
  };
  claim: {
    /** Patient account number, alphanumeric, must be unique per claim. */
    patientControlNumber: string;
    totalChargeCents: number;
    placeOfService: string;
    /** "1" original, "7" replacement, "8" void. */
    frequencyCode: "1" | "7" | "8";
    /** ICD-10 diagnoses, in pointer order (1-based, max 12). */
    diagnoses: string[];
    serviceDate: Date;
    priorAuthNumber?: string | null;
    /** Required on a corrected claim: payer's claim control number from the
     *  original 277CA / 835. */
    originalClaimControlNumber?: string | null;
    /** Free-text notes (NTE — 80 chars max, dropped if longer). */
    notes?: string | null;
  };
  serviceLines: ServiceLine[];
  /** Filled when this is a secondary submission. */
  secondary?: {
    primaryPayer: Payer;
    primarySubscriber: Subscriber;
    primaryAllowedCents: number;
    primaryPaidCents: number;
    primaryEraDate: Date;
    primaryCas: ClaimAdjustment[];
    /** Primary payer claim control number from the 835 (REF*F8). */
    primaryClaimControlNumber: string;
  } | null;
}

export interface BuildOptions {
  delimiters?: X12Delimiters;
  lineWrap?: boolean;
  usageIndicator?: "T" | "P";
  isaControlNumber: number;
  gsControlNumber: number;
  stControlNumber: string; // 4-9 chars
  date?: Date;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface Built837 {
  payload: string;
  /** Number of segments in the ST..SE transaction (used for SE counter). */
  transactionSegmentCount: number;
  controlNumbers: {
    isa: number;
    gs: number;
    st: string;
  };
}

export function build837P(input: Claim837Input, opts: BuildOptions): Built837 {
  const delims = opts.delimiters ?? DEFAULT_DELIMITERS;
  const date = opts.date ?? new Date();
  const segments: string[] = [];

  // ── Envelope: ISA / GS / ST ──────────────────────────────────────
  const isa = buildIsa({
    authQualifier: "00",
    senderId: input.submitter.id,
    receiverId: input.receiver.id,
    date,
    controlNumber: opts.isaControlNumber,
    usageIndicator: opts.usageIndicator ?? "P",
    delimiters: delims,
  });
  const gs = buildGs(
    {
      functionalId: "HC",
      senderCode: input.submitter.id,
      receiverCode: input.receiver.id,
      date,
      controlNumber: opts.gsControlNumber,
      versionCode: "005010X222A1",
    },
    delims,
  );
  const st = buildSt("837", opts.stControlNumber, "005010X222A1", delims);
  segments.push(st);

  // ── BHT (Beginning of Hierarchical Transaction) ──────────────────
  segments.push(
    segment(
      "BHT",
      [
        "0019", // structure code (claim hierarchy)
        "00", // purpose: original
        input.claim.patientControlNumber,
        formatD8(date),
        `${date.getUTCHours().toString().padStart(2, "0")}${date.getUTCMinutes().toString().padStart(2, "0")}`,
        "CH", // claim purpose: chargeable
      ],
      delims,
    ),
  );

  // ── Loop 1000A — Submitter ───────────────────────────────────────
  segments.push(segment("NM1", ["41", "2", input.submitter.name, null, null, null, null, "46", input.submitter.id], delims));
  segments.push(segment("PER", ["IC", input.submitter.contactName, "TE", input.submitter.contactPhone], delims));

  // ── Loop 1000B — Receiver ────────────────────────────────────────
  segments.push(segment("NM1", ["40", "2", input.receiver.name, null, null, null, null, "46", input.receiver.id], delims));

  // ── HL bookkeeping ──────────────────────────────────────────────
  let hlCounter = 0;

  // ── Loop 2000A — Billing provider HL ─────────────────────────────
  hlCounter++;
  const billingHl = hlCounter;
  segments.push(segment("HL", [String(billingHl), null, "20", "1"], delims)); // child code 1 = subscriber HL follows
  if (input.billingProvider.taxonomyCode) {
    segments.push(segment("PRV", ["BI", "PXC", input.billingProvider.taxonomyCode], delims));
  }

  // ── Loop 2010AA — Billing provider name + address + tax ID ───────
  segments.push(
    segment(
      "NM1",
      ["85", "2", input.billingProvider.organizationName, null, null, null, null, "XX", input.billingProvider.npi],
      delims,
    ),
  );
  pushAddress(segments, input.billingProvider.address, delims);
  segments.push(segment("REF", ["EI", input.billingProvider.taxId], delims));

  // ── Loop 2010AB — Pay-to address (only when different) ───────────
  if (input.billingProvider.payToAddress) {
    segments.push(segment("NM1", ["87", "2"], delims));
    pushAddress(segments, input.billingProvider.payToAddress, delims);
  }

  // ── Loop 2000B — Subscriber HL ───────────────────────────────────
  hlCounter++;
  const subscriberHl = hlCounter;
  const hasPatientHl = input.patient !== null && input.subscriber.relationshipToPatient !== "18";
  segments.push(segment("HL", [String(subscriberHl), String(billingHl), "22", hasPatientHl ? "1" : "0"], delims));
  segments.push(segment("SBR", [input.secondary ? "S" : "P", input.subscriber.relationshipToPatient, null, null, null, null, null, null, input.subscriber.insuranceType], delims));

  // ── Loop 2010BA — Subscriber ─────────────────────────────────────
  pushPersonNm1(segments, "IL", input.subscriber, delims);
  pushAddress(segments, input.subscriber.address, delims);
  segments.push(segment("DMG", ["D8", formatD8(input.subscriber.dateOfBirth), input.subscriber.gender], delims));

  // ── Loop 2010BB — Payer ──────────────────────────────────────────
  segments.push(segment("NM1", ["PR", "2", input.payer.name, null, null, null, null, "PI", input.payer.payerId], delims));

  // ── Loop 2000C — Patient HL (only when patient ≠ subscriber) ─────
  if (hasPatientHl && input.patient) {
    hlCounter++;
    segments.push(segment("HL", [String(hlCounter), String(subscriberHl), "23", "0"], delims));
    segments.push(segment("PAT", [input.subscriber.relationshipToPatient], delims));
    pushPersonNm1(segments, "QC", input.patient, delims);
    pushAddress(segments, input.patient.address, delims);
    segments.push(segment("DMG", ["D8", formatD8(input.patient.dateOfBirth), input.patient.gender], delims));
  }

  // ── Loop 2300 — Claim ────────────────────────────────────────────
  segments.push(
    segment(
      "CLM",
      [
        input.claim.patientControlNumber,
        formatAmount(input.claim.totalChargeCents),
        null,
        null,
        // CLM05 composite: place-of-service : facility-code-qualifier : claim-frequency
        { sub: [input.claim.placeOfService, "B", input.claim.frequencyCode] },
        "Y", // provider signature on file
        "A", // assignment of benefits accepted
        "Y", // benefits-assignment cert
        "Y", // release of info
      ],
      delims,
    ),
  );

  // DTP — service date (statement-from). Use earliest service-line date.
  segments.push(segment("DTP", ["472", "D8", formatD8(input.claim.serviceDate)], delims));

  // HI — diagnoses. ABK = principal, ABF = additional. Pad up to 12.
  if (input.claim.diagnoses.length > 0) {
    const diagElements: X12Element[] = input.claim.diagnoses.slice(0, 12).map((dx, idx) =>
      idx === 0 ? { sub: ["ABK", dx] } : { sub: ["ABF", dx] },
    );
    segments.push(segment("HI", diagElements, delims));
  }

  // REF — prior auth number
  if (input.claim.priorAuthNumber) {
    segments.push(segment("REF", ["G1", input.claim.priorAuthNumber], delims));
  }

  // REF*F8 — original claim control number (replacements/voids only)
  if (input.claim.frequencyCode !== "1" && input.claim.originalClaimControlNumber) {
    segments.push(segment("REF", ["F8", input.claim.originalClaimControlNumber], delims));
  }

  // NTE — claim notes. Each NTE is capped at 80 chars; longer notes split
  // across multiple segments rather than getting truncated.
  if (input.claim.notes) {
    for (const chunk of splitNote(input.claim.notes, 80)) {
      segments.push(segment("NTE", ["ADD", chunk], delims));
    }
  }

  // ── Loop 2310B — Rendering provider (when ≠ billing) ─────────────
  if (input.rendering.npi !== input.billingProvider.npi) {
    segments.push(
      segment(
        "NM1",
        ["82", "1", input.rendering.lastName, input.rendering.firstName, null, null, null, "XX", input.rendering.npi],
        delims,
      ),
    );
    if (input.rendering.taxonomyCode) {
      segments.push(segment("PRV", ["PE", "PXC", input.rendering.taxonomyCode], delims));
    }
  }

  // ── Loop 2320 — Other payer (secondary claims) ───────────────────
  if (input.secondary) {
    segments.push(
      segment(
        "SBR",
        ["P", input.secondary.primarySubscriber.relationshipToPatient, null, null, null, null, null, null, input.secondary.primarySubscriber.insuranceType],
        delims,
      ),
    );
    // CAS — claim-level adjustments from primary payer. One CAS per group.
    for (const group of groupCas(input.secondary.primaryCas)) {
      segments.push(segment("CAS", buildCasElements(group.groupCode, group.adjustments), delims));
    }
    segments.push(segment("AMT", ["D", formatAmount(input.secondary.primaryPaidCents)], delims)); // payer paid amount
    segments.push(segment("AMT", ["B6", formatAmount(input.secondary.primaryAllowedCents)], delims)); // allowed
    // OI — claim filing indicator
    segments.push(segment("OI", [null, null, "Y", null, null, "Y"], delims));
    // Loop 2330A — primary subscriber name
    pushPersonNm1(segments, "IL", input.secondary.primarySubscriber, delims);
    // Loop 2330B — primary payer
    segments.push(
      segment(
        "NM1",
        ["PR", "2", input.secondary.primaryPayer.name, null, null, null, null, "PI", input.secondary.primaryPayer.payerId],
        delims,
      ),
    );
    segments.push(segment("DTP", ["573", "D8", formatD8(input.secondary.primaryEraDate)], delims));
    segments.push(segment("REF", ["F8", input.secondary.primaryClaimControlNumber], delims));
  }

  // ── Loop 2400 — Service lines ────────────────────────────────────
  for (const line of input.serviceLines) {
    segments.push(segment("LX", [String(line.sequence)], delims));

    // SV1 — professional service. SV101 is composite: HC : CPT : modifiers
    const svComposite: Array<string | number | null | undefined> = ["HC", line.cptCode];
    for (let i = 0; i < 4; i++) svComposite.push(line.modifiers[i] ?? null);
    segments.push(
      segment(
        "SV1",
        [
          { sub: svComposite },
          formatAmount(line.chargeCents),
          "UN",
          String(line.units),
          line.placeOfService ?? null,
          null,
          // SV107 — composite diagnosis-code pointer (up to 4). Must be a
          // real X12 composite so each pointer is joined with the sub-element
          // delimiter AFTER per-element sanitization. Passing a pre-joined
          // "1:2:3" string would have its ":" stripped by sanitizeX12,
          // collapsing the pointers into a bogus single value ("123").
          { sub: line.diagnosisPointers.slice(0, 4) },
        ],
        delims,
      ),
    );
    segments.push(segment("DTP", ["472", "D8", formatD8(line.serviceDate)], delims));

    // ── Loop 2430 — Line adjudication (secondary submissions) ──────
    if (line.primaryAdjudication) {
      segments.push(
        segment(
          "SVD",
          [
            input.secondary?.primaryPayer.payerId ?? "",
            formatAmount(line.primaryAdjudication.paidCents),
            { sub: ["HC", line.cptCode] },
            null,
            String(line.units),
          ],
          delims,
        ),
      );
      for (const group of groupCas(line.primaryAdjudication.cas)) {
        segments.push(segment("CAS", buildCasElements(group.groupCode, group.adjustments), delims));
      }
      segments.push(segment("DTP", ["573", "D8", formatD8(line.primaryAdjudication.eraDate)], delims));
    }
  }

  // ── SE / GE / IEA ────────────────────────────────────────────────
  const transactionSegmentCount = segments.length + 1; // +1 for SE itself
  segments.push(buildSe(transactionSegmentCount, opts.stControlNumber, delims));

  const ge = buildGe(1, opts.gsControlNumber, delims);
  const iea = buildIea(opts.isaControlNumber, 1, delims);

  const all = [isa, gs, ...segments, ge, iea];
  return {
    payload: joinSegments(all, opts.lineWrap ?? true),
    transactionSegmentCount,
    controlNumbers: {
      isa: opts.isaControlNumber,
      gs: opts.gsControlNumber,
      st: opts.stControlNumber,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pushAddress(out: string[], addr: BillingAddress, delims: X12Delimiters): void {
  const lines: X12Element[] = [addr.line1];
  if (addr.line2) lines.push(addr.line2);
  out.push(segment("N3", lines, delims));
  out.push(segment("N4", [addr.city, addr.state, addr.postalCode], delims));
}

interface PersonShape {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  memberId?: string;
}

function pushPersonNm1(out: string[], entityCode: string, person: PersonShape, delims: X12Delimiters): void {
  out.push(
    segment(
      "NM1",
      [
        entityCode,
        "1", // person
        person.lastName,
        person.firstName,
        person.middleName ?? null,
        null,
        null,
        person.memberId ? "MI" : null,
        person.memberId ?? null,
      ],
      delims,
    ),
  );
}

interface CasGroup {
  groupCode: ClaimAdjustment["groupCode"];
  adjustments: ClaimAdjustment[];
}

/** Group adjustments by group code so we emit one CAS segment per group
 *  (X12 5010 packs up to 6 reason/amount/units triplets per CAS). */
export function groupCas(adjustments: ClaimAdjustment[]): CasGroup[] {
  const byGroup = new Map<ClaimAdjustment["groupCode"], ClaimAdjustment[]>();
  for (const a of adjustments) {
    const list = byGroup.get(a.groupCode) ?? [];
    list.push(a);
    byGroup.set(a.groupCode, list);
  }
  // Stable order: CO, PR, OA, PI
  const order: ClaimAdjustment["groupCode"][] = ["CO", "PR", "OA", "PI"];
  return order
    .filter((g) => byGroup.has(g))
    .map((g) => ({ groupCode: g, adjustments: byGroup.get(g)! }));
}

function splitNote(text: string, max: number): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return [];
  const out: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    let end = Math.min(i + max, cleaned.length);
    if (end < cleaned.length) {
      // Break on the last whitespace so we don't split mid-word.
      const lastSpace = cleaned.lastIndexOf(" ", end);
      if (lastSpace > i) end = lastSpace;
    }
    out.push(cleaned.slice(i, end).trim());
    i = end;
    while (cleaned[i] === " ") i++;
  }
  return out;
}

function buildCasElements(groupCode: string, adjustments: ClaimAdjustment[]): X12Element[] {
  // CAS01 = group code, then up to 6 (reason / amount / units) triplets
  const els: X12Element[] = [groupCode];
  for (let i = 0; i < 6; i++) {
    const a = adjustments[i];
    if (!a) {
      els.push(null, null, null);
      continue;
    }
    els.push(a.reasonCode, formatAmount(a.amountCents), a.units != null ? String(a.units) : null);
  }
  return els;
}

// ---------------------------------------------------------------------------
// Hardening: pre-build validation
// ---------------------------------------------------------------------------
// Catches the structural mistakes that would otherwise produce a clean-looking
// 837P which the clearinghouse rejects with a generic "999 syntax error" or
// 277CA "claim level reject" — issues we can detect deterministically before
// we burn an interchange control number.

export interface ValidationFinding {
  /** Stable identifier for UI grouping ("billing.npi", "claim.totals", ...). */
  field: string;
  message: string;
  severity: "error" | "warning";
}

const NPI_RE = /^\d{10}$/;
const TAX_ID_RE = /^\d{9}$/;
const CPT_RE = /^[0-9A-Z]{5}$/;
const ICD10_RE = /^[A-TV-Z][0-9][A-Z0-9](?:\.[A-Z0-9]{1,4})?$/;

/** Validate a `Claim837Input` *before* `build837P` runs. Returns every
 *  finding rather than throwing on the first one so the UI can surface a
 *  full punch list. `errors` block submission; `warnings` are advisory. */
export function validate837Input(input: Claim837Input): {
  ok: boolean;
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
} {
  const findings: ValidationFinding[] = [];
  const err = (field: string, message: string) =>
    findings.push({ field, message, severity: "error" });
  const warn = (field: string, message: string) =>
    findings.push({ field, message, severity: "warning" });

  if (!NPI_RE.test(input.billingProvider.npi)) {
    err("billing.npi", "billing NPI must be 10 digits");
  }
  if (!NPI_RE.test(input.rendering.npi)) {
    err("rendering.npi", "rendering NPI must be 10 digits");
  }
  if (!TAX_ID_RE.test(input.billingProvider.taxId)) {
    err("billing.taxId", "billing tax ID must be 9 digits, no hyphen");
  }

  if (!input.subscriber.memberId.trim()) {
    err("subscriber.memberId", "subscriber member ID is required");
  }
  if (input.subscriber.relationshipToPatient !== "18" && !input.patient) {
    err(
      "patient",
      "subscriber.relationshipToPatient is not 'self' but no patient demographics were supplied",
    );
  }

  if (input.claim.diagnoses.length === 0) {
    err("claim.diagnoses", "at least one ICD-10 diagnosis is required");
  } else if (input.claim.diagnoses.length > 12) {
    err("claim.diagnoses", "X12 5010 caps diagnoses at 12 per claim");
  }
  for (const dx of input.claim.diagnoses) {
    if (!ICD10_RE.test(dx)) {
      warn("claim.diagnoses", `'${dx}' does not match the ICD-10 format`);
    }
  }

  if (input.serviceLines.length === 0) {
    err("serviceLines", "claim must contain at least one service line");
  }
  if (input.serviceLines.length > 50) {
    err("serviceLines", "X12 5010 caps service lines at 50 per claim");
  }

  // Per-line checks
  let lineSum = 0;
  for (const line of input.serviceLines) {
    lineSum += line.chargeCents;
    if (!CPT_RE.test(line.cptCode)) {
      err(`serviceLines[${line.sequence}].cptCode`, `'${line.cptCode}' is not a valid CPT/HCPCS code`);
    }
    if (line.modifiers.length > 4) {
      err(`serviceLines[${line.sequence}].modifiers`, "max 4 modifiers per line");
    }
    if (line.units <= 0) {
      err(`serviceLines[${line.sequence}].units`, "units must be > 0");
    }
    if (line.chargeCents < 0) {
      err(`serviceLines[${line.sequence}].chargeCents`, "negative charges aren't valid on a primary claim");
    }
    if (line.diagnosisPointers.length === 0) {
      err(`serviceLines[${line.sequence}].diagnosisPointers`, "at least one diagnosis pointer required");
    }
    for (const ptr of line.diagnosisPointers) {
      if (ptr < 1 || ptr > input.claim.diagnoses.length) {
        err(
          `serviceLines[${line.sequence}].diagnosisPointers`,
          `pointer ${ptr} is out of range for ${input.claim.diagnoses.length} diagnoses`,
        );
      }
    }
  }

  // Claim total must equal sum of line charges (X12 5010 hard-fails otherwise).
  // The mismatch must be caught even when the line charges sum to 0 but CLM02
  // is non-zero (e.g. line amounts failed to populate) — the prior `lineSum > 0`
  // guard silently let that exact case through.
  if (lineSum !== input.claim.totalChargeCents) {
    err(
      "claim.totalChargeCents",
      `claim total ${formatAmount(input.claim.totalChargeCents)} does not equal sum of line charges ${formatAmount(lineSum)}`,
    );
  }

  // Frequency 7 (replacement) / 8 (void) requires the original claim id
  if (input.claim.frequencyCode !== "1" && !input.claim.originalClaimControlNumber) {
    err(
      "claim.originalClaimControlNumber",
      `frequency '${input.claim.frequencyCode}' requires the original payer claim control number`,
    );
  }

  // Secondary submission cross-check: every line must carry primaryAdjudication
  if (input.secondary) {
    for (const line of input.serviceLines) {
      if (!line.primaryAdjudication) {
        err(
          `serviceLines[${line.sequence}].primaryAdjudication`,
          "secondary submission requires primary adjudication on every line",
        );
      }
    }
  }

  if (input.claim.notes && input.claim.notes.length > 80) {
    warn("claim.notes", "NTE is capped at 80 chars; the rest will be truncated");
  }

  return {
    ok: !findings.some((f) => f.severity === "error"),
    errors: findings.filter((f) => f.severity === "error"),
    warnings: findings.filter((f) => f.severity === "warning"),
  };
}

/** Stateful in-process control-number allocator. Use one instance per
 *  submission batch — ISA / GS / ST control numbers must be unique within
 *  the interchange but stable enough that an SE counter mismatch is
 *  catchable. ISA is 9 digits, GS is up to 9 digits, ST is 4-9 chars. */
export class ControlNumberAllocator {
  private isa: number;
  private gs: number;
  private st: number;
  constructor(seed: { isa?: number; gs?: number; st?: number } = {}) {
    this.isa = seed.isa ?? 1;
    this.gs = seed.gs ?? 1;
    this.st = seed.st ?? 1;
  }
  next(): { isaControlNumber: number; gsControlNumber: number; stControlNumber: string } {
    const out = {
      isaControlNumber: this.isa,
      gsControlNumber: this.gs,
      stControlNumber: this.st.toString().padStart(4, "0"),
    };
    this.isa = (this.isa % 999_999_999) + 1;
    this.gs = (this.gs % 999_999_999) + 1;
    this.st += 1;
    return out;
  }
}
