/**
 * RCM Stress Test — massive end-to-end billing harness
 *
 * Acts as a revenue-cycle-management critic. Exercises the real
 * production billing modules (no mocking the platform):
 *
 *   1. Eligibility 270/271 (eligibility-client)
 *   2. Cannabis payer routing (payer-rules)
 *   3. Pre-submission claim scrub (scrub)
 *   4. 837P EDI generation (edi/edi-837p + edi/x12)
 *   5. SNIP 1–5 validation (edi/snip-validator)
 *   6. Clearinghouse submission (clearinghouse/gateway — simulated adapter)
 *   7. 999 functional ack parsing (clearinghouse-ack)
 *   8. 277CA claim ack parsing + decisioning (clearinghouse-ack)
 *   9. 835 ERA parsing (era/parser-835 JSON path)
 *  10. Adjudication classification + PR split + reconcile (remittance)
 *  11. Claim status classification (era/parser-835)
 *  12. Denial taxonomy (denials)
 *  13. Underpayment detection vs payer contract (contracts/allowables)
 *  14. Secondary claim build (secondary-claim)
 *  15. Reimbursement prediction (reimbursement-predictor)
 *  16. Appeal argument ranking (appeal-outcomes)
 *  17. Patient statement cadence + aggregation (patient-statements)
 *  18. AR aging (aging)
 *  19. Lockbox/bank-deposit match (lockbox)
 *  20. Identifiers validation (identifiers)
 *
 * Each stage records a finding to the ledger when it surfaces issues.
 * The bottom of the script emits a structured critic report.
 *
 * Run:  pnpm tsx scripts/rcm-stress-test.ts
 */

import { eligibilityClient } from "../src/lib/billing/eligibility-client";
import {
  computeTimelyFilingDeadline,
  isCommercialPayer,
  isGovernmentPayer,
  resolvePayerRule,
  shouldRouteCannabisToSelfPay,
} from "../src/lib/billing/payer-rules";
import { scrubClaim, isClaimSubmittable, countBySeverity } from "../src/lib/billing/scrub";
import {
  build837P,
  validate837Input,
  ControlNumberAllocator,
  type Claim837Input,
  type ClaimAdjustment,
} from "../src/lib/billing/edi/edi-837p";
import { validateSnip1to5 } from "../src/lib/billing/edi/snip-validator";
import { SimulatedClearinghouseAdapter } from "../src/lib/billing/clearinghouse/gateway";
import { parse999, parse277CA, decide277Actions } from "../src/lib/billing/clearinghouse-ack";
import { parseJsonEra, reconcileEraTotals, type Era835ClaimPayment } from "../src/lib/billing/era-parser";
import { classifyClaimStatus } from "../src/lib/billing/era/parser-835";
import {
  classifyAdjustment,
  splitPatientResponsibility,
  reconcileClaimTotals,
} from "../src/lib/billing/remittance";
import { classifyDenial } from "../src/lib/billing/denials";
import { detectClaimUnderpayments, summarizeUnderpayments } from "../src/lib/billing/contracts/allowables";
import type { ContractLite } from "../src/lib/billing/payer-contracts";
import { buildSecondaryClaimInput, shouldFileSecondary, patientResponsibilityCents } from "../src/lib/billing/secondary-claim";
import { predictReimbursement, type HistoricalAllowed } from "../src/lib/billing/reimbursement-predictor";
import { rankArguments, winRateByPayer, winRateByCarc, type OutcomeHistoryRow, ARGUMENT_TAGS } from "../src/lib/billing/appeal-outcomes";
import { decideCadence, aggregateStatement, generateStatementNumber } from "../src/lib/billing/patient-statements";
import { ageClaims, daysInAR, recoverabilityScore } from "../src/lib/billing/aging";
import { matchDeposit, parseBankCsv } from "../src/lib/billing/lockbox";
import { isValidNpi, isValidEin } from "../src/lib/billing/identifiers";

// ---------------------------------------------------------------------------
// Findings ledger — the critic's notebook
// ---------------------------------------------------------------------------

type Severity = "critical" | "high" | "medium" | "low" | "info" | "pass";

interface Finding {
  caseId: string;
  stage: string;
  severity: Severity;
  message: string;
  detail?: unknown;
}

const ledger: Finding[] = [];
const note = (f: Finding) => ledger.push(f);

const SEV_ICON: Record<Severity, string> = {
  critical: "✖",
  high: "!",
  medium: "?",
  low: ".",
  info: "i",
  pass: "✓",
};

// ---------------------------------------------------------------------------
// Stable fixtures
// ---------------------------------------------------------------------------

const PRACTICE = {
  organizationName: "LEAFJOURNEY PAIN & CANNABIS CARE PA",
  npi: "1234567893", // valid Luhn-checked NPI from prod tests
  taxId: "123456789",
  taxonomyCode: "207RP1001X",
  address: { line1: "123 Wellness Way", line2: null, city: "Boston", state: "MA", postalCode: "02108" },
};

const RENDERING = {
  npi: "1356781237", // valid 10-digit NPI passing Luhn
  firstName: "PRIYA",
  lastName: "PATEL",
  taxonomyCode: "207RP1001X",
};

const SUBMITTER = {
  name: "LEAFJOURNEY EMR",
  id: "LEAFJRNYEMR",
  contactName: "BILLING TEAM",
  contactPhone: "6175550100",
};

const RECEIVER = { name: "AVAILITY", id: "AVAILITY" };

const allocator = new ControlNumberAllocator({ isa: 1000, gs: 1000, st: 1000 });

// Per-payer EDI id mapping
const PAYER_EDI: Record<string, { name: string; payerId: string; ediMemberPrefix: string }> = {
  aetna: { name: "AETNA", payerId: "60054", ediMemberPrefix: "W" },
  uhc: { name: "UNITEDHEALTHCARE", payerId: "87726", ediMemberPrefix: "9" },
  cigna: { name: "CIGNA", payerId: "62308", ediMemberPrefix: "U" },
  bcbs: { name: "BLUE CROSS BLUE SHIELD", payerId: "00200", ediMemberPrefix: "YPK" },
  humana: { name: "HUMANA", payerId: "61101", ediMemberPrefix: "H" },
  anthem: { name: "ANTHEM", payerId: "47198", ediMemberPrefix: "Y" },
  kaiser: { name: "KAISER PERMANENTE", payerId: "94135", ediMemberPrefix: "K" },
  medicare: { name: "MEDICARE", payerId: "00131", ediMemberPrefix: "1" },
  medicaid: { name: "MEDICAID", payerId: "MASS01", ediMemberPrefix: "M" },
  tricare: { name: "TRICARE", payerId: "TRICARE", ediMemberPrefix: "T" },
};

// Realistic payer contract allowables — a few CPTs at varying %
const CONTRACTS: ContractLite[] = [
  {
    id: "ctr-aetna-2026",
    payerId: "60054",
    payerName: "AETNA",
    effectiveStart: new Date("2026-01-01"),
    effectiveEnd: null,
    active: true,
    rates: [
      { cptCode: "99213", modifier: null, allowedCents: 11000 },
      { cptCode: "99214", modifier: null, allowedCents: 16500 },
      { cptCode: "99204", modifier: null, allowedCents: 22500 },
    ],
  },
  {
    id: "ctr-uhc-2026",
    payerId: "87726",
    payerName: "UNITEDHEALTHCARE",
    effectiveStart: new Date("2026-01-01"),
    effectiveEnd: null,
    active: true,
    rates: [
      { cptCode: "99213", modifier: null, allowedCents: 9800 },
      { cptCode: "99214", modifier: null, allowedCents: 14800 },
      { cptCode: "99406", modifier: null, allowedCents: 1450 },
    ],
  },
  {
    id: "ctr-bcbs-2026",
    payerId: "00200",
    payerName: "BLUE CROSS BLUE SHIELD",
    effectiveStart: new Date("2026-01-01"),
    effectiveEnd: null,
    active: true,
    rates: [
      { cptCode: "99213", modifier: null, allowedCents: 10500 },
      { cptCode: "99214", modifier: null, allowedCents: 15800 },
      { cptCode: "99406", modifier: null, allowedCents: 1500 },
    ],
  },
  {
    id: "ctr-medicare-2026",
    payerId: "00131",
    payerName: "MEDICARE",
    effectiveStart: new Date("2026-01-01"),
    effectiveEnd: null,
    active: true,
    rates: [
      { cptCode: "99213", modifier: null, allowedCents: 8200 },
      { cptCode: "99214", modifier: null, allowedCents: 12100 },
      { cptCode: "99215", modifier: null, allowedCents: 17400 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Patient + encounter case definitions
// ---------------------------------------------------------------------------

interface BillCase {
  caseId: string;
  description: string;
  payerKey: keyof typeof PAYER_EDI | "selfpay";
  serviceDate: Date;
  patient: { firstName: string; lastName: string; dob: Date; gender: "M" | "F" | "U"; memberId: string };
  cpt: Array<{ code: string; label: string; units: number; chargeCents: number; modifiers: string[] }>;
  icd10: Array<{ code: string; label?: string }>;
  placeOfService: string;
  authNumber?: string | null;
  hasCannabisDx: boolean;
  /** Adversarial intent for the ledger. */
  expect: string;
}

const TODAY = new Date("2026-05-11");
const DOS = (daysAgo: number) => new Date(TODAY.getTime() - daysAgo * 86_400_000);

const cases: BillCase[] = [
  {
    caseId: "C01-aetna-cannabis-excluded",
    description: "Aetna new patient eval + cannabis dx — covered medically (Aetna ≠ excluded)",
    payerKey: "aetna",
    serviceDate: DOS(10),
    patient: { firstName: "MARIA", lastName: "GARCIA", dob: new Date("1972-04-21"), gender: "F", memberId: "W123456789" },
    cpt: [{ code: "99204", label: "Office visit, new pt, mod complexity", units: 1, chargeCents: 32500, modifiers: [] }],
    icd10: [{ code: "G89.29", label: "Other chronic pain" }, { code: "F12.20", label: "Cannabis use disorder, mild" }],
    placeOfService: "11",
    hasCannabisDx: true,
    expect: "Aetna requires prior auth for cannabis dx; should flag PA requirement",
  },
  {
    caseId: "C02-uhc-ncci-99406-no-mod25",
    description: "UHC E/M + tobacco counseling SAME DAY without modifier 25 (NCCI violation)",
    payerKey: "uhc",
    serviceDate: DOS(7),
    patient: { firstName: "JAMES", lastName: "PARK", dob: new Date("1985-11-02"), gender: "M", memberId: "987654321" },
    cpt: [
      { code: "99213", label: "Office visit, est pt", units: 1, chargeCents: 18500, modifiers: [] },
      { code: "99406", label: "Tobacco cessation 3-10 min", units: 1, chargeCents: 2400, modifiers: [] },
    ],
    icd10: [{ code: "M54.50", label: "Low back pain" }, { code: "Z87.891", label: "PHx of nicotine dependence" }],
    placeOfService: "11",
    hasCannabisDx: false,
    expect: "Scrub MUST flag NCCI bundling: 99406 needs mod 25 with 99213",
  },
  {
    caseId: "C03-bcbs-clean-em-counsel",
    description: "BCBS E/M + tobacco counseling with proper mod 25 (clean claim)",
    payerKey: "bcbs",
    serviceDate: DOS(5),
    patient: { firstName: "ELLA", lastName: "RIVERA", dob: new Date("1990-02-14"), gender: "F", memberId: "YPK123456" },
    cpt: [
      { code: "99214", label: "Office visit, est pt mod complex", units: 1, chargeCents: 23500, modifiers: ["25"] },
      { code: "99406", label: "Tobacco cessation 3-10 min", units: 1, chargeCents: 2400, modifiers: [] },
    ],
    icd10: [{ code: "M54.50" }, { code: "F17.210", label: "Nicotine dep, cigarettes" }],
    placeOfService: "11",
    hasCannabisDx: false,
    expect: "Should pass scrub clean. Underpayment if BCBS allows < contract.",
  },
  {
    caseId: "C04-cigna-phlebotomy-ncci",
    description: "Cigna E/M + 36415 phlebotomy (UNBUNDLEABLE pair)",
    payerKey: "cigna",
    serviceDate: DOS(3),
    patient: { firstName: "DAVID", lastName: "KIM", dob: new Date("1968-08-30"), gender: "M", memberId: "U567891234" },
    cpt: [
      { code: "99213", label: "Office visit, est pt", units: 1, chargeCents: 18500, modifiers: [] },
      { code: "36415", label: "Venipuncture", units: 1, chargeCents: 1500, modifiers: [] },
    ],
    icd10: [{ code: "E11.9", label: "Type 2 DM" }],
    placeOfService: "11",
    hasCannabisDx: false,
    expect: "36415 is incidental — must NEVER be unbundled (allowedModifier: null)",
  },
  {
    caseId: "C05-medicare-telehealth-clean",
    description: "Medicare telehealth E/M with mod 95",
    payerKey: "medicare",
    serviceDate: DOS(8),
    patient: { firstName: "ROBERT", lastName: "ZHANG", dob: new Date("1955-06-12"), gender: "M", memberId: "1AB2-CD3-EF45" },
    cpt: [{ code: "99214", label: "Office visit, est pt telehealth", units: 1, chargeCents: 23500, modifiers: ["95"] }],
    icd10: [{ code: "G89.29" }],
    placeOfService: "02",
    hasCannabisDx: false,
    expect: "Clean. Medicare contract allowable ~$121 expected.",
  },
  {
    caseId: "C06-medicare-cannabis-excluded",
    description: "Medicare + cannabis dx — federally illegal, must route to self-pay",
    payerKey: "medicare",
    serviceDate: DOS(2),
    patient: { firstName: "HELEN", lastName: "PIERCE", dob: new Date("1948-11-19"), gender: "F", memberId: "1XX2-AB3-CD45" },
    cpt: [{ code: "99214", label: "Cannabis cert visit", units: 1, chargeCents: 23500, modifiers: [] }],
    icd10: [{ code: "F12.21", label: "Cannabis use disorder, in remission" }, { code: "G89.4", label: "Chronic pain syndrome" }],
    placeOfService: "11",
    hasCannabisDx: true,
    expect: "shouldRouteCannabisToSelfPay must return selfPay=true (Medicare excludes)",
  },
  {
    caseId: "C07-humana-cannabis-pa-required",
    description: "Humana MA + cannabis dx, no auth on file → PA-required block",
    payerKey: "humana",
    serviceDate: DOS(1),
    patient: { firstName: "ALEX", lastName: "OKAFOR", dob: new Date("1970-03-04"), gender: "M", memberId: "H889977665" },
    cpt: [{ code: "99215", label: "Office visit, est pt high complex", units: 1, chargeCents: 31500, modifiers: [] }],
    icd10: [{ code: "F12.20" }, { code: "G89.4" }],
    placeOfService: "11",
    authNumber: null,
    hasCannabisDx: true,
    expect: "Humana requires prior auth for cannabis; scrub or routing should flag",
  },
  {
    caseId: "C08-anthem-approaching-timely",
    description: "Anthem claim 78d after DOS (window=90) — approaching timely",
    payerKey: "anthem",
    serviceDate: DOS(78),
    patient: { firstName: "OLIVIA", lastName: "BREWER", dob: new Date("1988-09-10"), gender: "F", memberId: "Y112233445" },
    cpt: [{ code: "99213", label: "Office visit, est pt", units: 1, chargeCents: 18500, modifiers: [] }],
    icd10: [{ code: "M25.561", label: "Pain right knee" }],
    placeOfService: "11",
    hasCannabisDx: false,
    expect: "Scrub should emit APPROACHING_TIMELY_FILING warning (last 20% of window)",
  },
  {
    caseId: "C09-anthem-past-timely",
    description: "Anthem claim 95d after DOS (window=90) — PAST timely filing",
    payerKey: "anthem",
    serviceDate: DOS(95),
    patient: { firstName: "NOAH", lastName: "ABBASI", dob: new Date("1979-05-17"), gender: "M", memberId: "Y556677889" },
    cpt: [{ code: "99213", label: "Office visit, est pt", units: 1, chargeCents: 18500, modifiers: [] }],
    icd10: [{ code: "M54.50" }],
    placeOfService: "11",
    hasCannabisDx: false,
    expect: "Scrub MUST block (PAST_TIMELY_FILING) — payer will categorically deny",
  },
  {
    caseId: "C10-kaiser-mue-overage",
    description: "Kaiser 99213 billed with 5 units (MUE limit = 1)",
    payerKey: "kaiser",
    serviceDate: DOS(15),
    patient: { firstName: "SOPHIA", lastName: "NGUYEN", dob: new Date("1995-12-01"), gender: "F", memberId: "K778899001" },
    cpt: [{ code: "99213", label: "Office visit (incorrectly 5 units)", units: 5, chargeCents: 92500, modifiers: [] }],
    icd10: [{ code: "M54.50" }],
    placeOfService: "11",
    hasCannabisDx: false,
    expect: "Scrub MUST flag MUE_EXCEEDED for 99213",
  },
  {
    caseId: "C11-uhc-missing-icd",
    description: "UHC claim with NO ICD-10 diagnoses (catastrophic)",
    payerKey: "uhc",
    serviceDate: DOS(4),
    patient: { firstName: "LIAM", lastName: "FOSTER", dob: new Date("1990-01-21"), gender: "M", memberId: "9988776655" },
    cpt: [{ code: "99202", label: "Office visit, new pt low complex", units: 1, chargeCents: 14500, modifiers: [] }],
    icd10: [],
    placeOfService: "11",
    hasCannabisDx: false,
    expect: "Must reject — no ICD = no payer adjudication possible",
  },
  {
    caseId: "C12-aetna-primary-bcbs-secondary",
    description: "Aetna primary → BCBS secondary; full secondary build after 835",
    payerKey: "aetna",
    serviceDate: DOS(20),
    patient: { firstName: "EMMA", lastName: "WHITMAN", dob: new Date("1965-10-08"), gender: "F", memberId: "W554433221" },
    cpt: [{ code: "99214", label: "Office visit, est pt mod complex", units: 1, chargeCents: 23500, modifiers: [] }],
    icd10: [{ code: "M54.50" }, { code: "M25.561" }],
    placeOfService: "11",
    hasCannabisDx: false,
    expect: "After primary ERA: must construct valid secondary 837P to BCBS",
  },
  {
    caseId: "C13-medicaid-clean",
    description: "Medicaid standard E/M (non-cannabis)",
    payerKey: "medicaid",
    serviceDate: DOS(6),
    patient: { firstName: "RAYAN", lastName: "PATEL", dob: new Date("1992-07-22"), gender: "M", memberId: "M321654987" },
    cpt: [{ code: "99214", label: "Office visit, est pt mod complex", units: 1, chargeCents: 23500, modifiers: [] }],
    icd10: [{ code: "E11.9" }, { code: "I10", label: "Essential HTN" }],
    placeOfService: "11",
    hasCannabisDx: false,
    expect: "Clean — Medicaid honors timely filing 365d, expect adjudication",
  },
  {
    caseId: "C14-tricare-clean",
    description: "TRICARE veteran chronic pain — non-cannabis",
    payerKey: "tricare",
    serviceDate: DOS(9),
    patient: { firstName: "MARCUS", lastName: "REED", dob: new Date("1980-02-14"), gender: "M", memberId: "T998877665" },
    cpt: [{ code: "99214", label: "Office visit, est pt mod complex", units: 1, chargeCents: 23500, modifiers: [] }],
    icd10: [{ code: "M54.50" }, { code: "F43.10", label: "PTSD unspecified" }],
    placeOfService: "11",
    hasCannabisDx: false,
    expect: "Clean — but TRICARE excludes cannabis if F12 added",
  },
  {
    caseId: "C15-selfpay-cannabis-cert",
    description: "Self-pay cannabis certification (no insurance touched)",
    payerKey: "selfpay",
    serviceDate: DOS(0),
    patient: { firstName: "TARA", lastName: "BLAKE", dob: new Date("1986-04-09"), gender: "F", memberId: "SELF-PAY" },
    cpt: [{ code: "S0339", label: "Cannabis certification visit", units: 1, chargeCents: 25000, modifiers: [] }],
    icd10: [{ code: "G89.4" }, { code: "F12.20" }],
    placeOfService: "11",
    hasCannabisDx: true,
    expect: "Self-pay: should NOT attempt claim submission. Cash collection only.",
  },
];

// ---------------------------------------------------------------------------
// Synthetic acknowledgement + ERA payload generators
// ---------------------------------------------------------------------------

function syntheticPayer(caseRef: BillCase) {
  if (caseRef.payerKey === "selfpay") return null;
  return PAYER_EDI[caseRef.payerKey];
}

function syntheticEra(caseRef: BillCase, scenario: "paid" | "denied" | "partial" | "takeback") {
  const p = syntheticPayer(caseRef);
  if (!p) return null;
  const totalCharge = caseRef.cpt.reduce((a, l) => a + l.chargeCents, 0) / 100;

  if (scenario === "paid") {
    const allowed = totalCharge * 0.72;
    const patientResp = allowed * 0.2; // 20% coinsurance
    const paid = allowed - patientResp;
    return {
      payer: { name: p.name, id: p.payerId },
      payee: { name: PRACTICE.organizationName, npi: PRACTICE.npi },
      trace: `TRC${caseRef.caseId.replace(/[^0-9]/g, "")}001`,
      check_date: TODAY.toISOString().slice(0, 10),
      payment_method: "ACH",
      total_amount: paid,
      claims: [
        {
          claim_control: caseRef.caseId,
          payer_claim_id: `PYR-${p.payerId}-${Date.now()}`,
          status_code: "1",
          charge: totalCharge,
          paid,
          patient_resp: patientResp,
          adjustments: [
            { group: "CO", carc: "45", amount: totalCharge - allowed },
            { group: "PR", carc: "2", amount: patientResp },
          ],
          services: caseRef.cpt.map((l) => ({
            cpt: l.code,
            modifiers: l.modifiers,
            charge: l.chargeCents / 100,
            paid: (l.chargeCents / 100) * 0.72 * 0.8,
            units: l.units,
            adjustments: [
              { group: "CO", carc: "45", amount: (l.chargeCents / 100) * 0.28 },
              { group: "PR", carc: "2", amount: (l.chargeCents / 100) * 0.72 * 0.2 },
            ],
          })),
        },
      ],
    };
  }

  if (scenario === "denied") {
    return {
      payer: { name: p.name, id: p.payerId },
      payee: { name: PRACTICE.organizationName, npi: PRACTICE.npi },
      trace: `TRC${caseRef.caseId.replace(/[^0-9]/g, "")}002`,
      check_date: TODAY.toISOString().slice(0, 10),
      payment_method: "ACH",
      total_amount: 0,
      claims: [
        {
          claim_control: caseRef.caseId,
          payer_claim_id: `PYR-${p.payerId}-DEN`,
          status_code: "4",
          charge: totalCharge,
          paid: 0,
          patient_resp: 0,
          adjustments: [{ group: "CO", carc: "29", amount: totalCharge }], // CO-29 timely filing
          services: caseRef.cpt.map((l) => ({
            cpt: l.code,
            modifiers: l.modifiers,
            charge: l.chargeCents / 100,
            paid: 0,
            units: l.units,
            adjustments: [{ group: "CO", carc: "29", amount: l.chargeCents / 100 }],
          })),
        },
      ],
    };
  }

  if (scenario === "partial") {
    // Stacked PR: deductible + coinsurance + copay + contractual
    const allowed = totalCharge * 0.70;
    const deductible = 30;
    const coinsurance = (allowed - deductible) * 0.2;
    const copay = 10;
    const paid = allowed - deductible - coinsurance - copay;
    return {
      payer: { name: p.name, id: p.payerId },
      payee: { name: PRACTICE.organizationName, npi: PRACTICE.npi },
      trace: `TRC${caseRef.caseId.replace(/[^0-9]/g, "")}003`,
      check_date: TODAY.toISOString().slice(0, 10),
      payment_method: "ACH",
      total_amount: paid,
      claims: [
        {
          claim_control: caseRef.caseId,
          payer_claim_id: `PYR-${p.payerId}-PRT`,
          status_code: "1",
          charge: totalCharge,
          paid,
          patient_resp: deductible + coinsurance + copay,
          adjustments: [
            { group: "CO", carc: "45", amount: totalCharge - allowed },
            { group: "PR", carc: "1", amount: deductible },
            { group: "PR", carc: "2", amount: coinsurance },
            { group: "PR", carc: "3", amount: copay },
          ],
          services: caseRef.cpt.map((l) => ({
            cpt: l.code,
            modifiers: l.modifiers,
            charge: l.chargeCents / 100,
            paid: paid * (l.chargeCents / 100 / totalCharge),
            units: l.units,
            adjustments: [],
          })),
        },
      ],
    };
  }

  // takeback — status code 22, negative payment
  return {
    payer: { name: p.name, id: p.payerId },
    payee: { name: PRACTICE.organizationName, npi: PRACTICE.npi },
    trace: `TRC${caseRef.caseId.replace(/[^0-9]/g, "")}004`,
    check_date: TODAY.toISOString().slice(0, 10),
    payment_method: "ACH",
    total_amount: -totalCharge * 0.5,
    claims: [
      {
        claim_control: caseRef.caseId,
        payer_claim_id: `PYR-${p.payerId}-RVS`,
        status_code: "22", // reversal
        charge: totalCharge,
        paid: totalCharge * 0.5,
        patient_resp: 0,
        adjustments: [{ group: "OA", carc: "23", amount: totalCharge * 0.5 }],
        services: caseRef.cpt.map((l) => ({ cpt: l.code, modifiers: l.modifiers, charge: l.chargeCents / 100, paid: 0, units: l.units, adjustments: [] })),
      },
    ],
    plb: [{ reason: "WO", amount: totalCharge * 0.5, reference: caseRef.caseId }],
  };
}

function synthetic277Reject(claimControl: string, code: "INVALID_MEMBER" | "INVALID_NPI" | "DUPLICATE") {
  return {
    claims: [
      {
        claimControlNumber: claimControl,
        category: "rejected" as const,
        statusCode: "A7",
        statusDescription: `Claim rejected: ${code}`,
        rejectReason: code === "INVALID_MEMBER" ? "Member id not found in payer eligibility" : code === "INVALID_NPI" ? "Provider NPI not registered with payer" : "Duplicate claim already on file",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildClaim837(caseRef: BillCase, frequency: "1" | "7" | "8" = "1"): Claim837Input | null {
  const p = syntheticPayer(caseRef);
  if (!p) return null;
  return {
    submitter: SUBMITTER,
    receiver: RECEIVER,
    billingProvider: { ...PRACTICE, payToAddress: null },
    subscriber: {
      memberId: caseRef.patient.memberId,
      firstName: caseRef.patient.firstName,
      lastName: caseRef.patient.lastName,
      dateOfBirth: caseRef.patient.dob,
      gender: caseRef.patient.gender,
      address: PRACTICE.address,
      relationshipToPatient: "18",
      insuranceType: caseRef.payerKey === "medicare" ? "MB" : caseRef.payerKey === "medicaid" ? "MC" : "CI",
    },
    patient: null,
    payer: { name: p.name, payerId: p.payerId },
    rendering: RENDERING,
    claim: {
      patientControlNumber: caseRef.caseId,
      totalChargeCents: caseRef.cpt.reduce((a, l) => a + l.chargeCents * l.units, 0),
      placeOfService: caseRef.placeOfService,
      frequencyCode: frequency,
      diagnoses: caseRef.icd10.map((d) => d.code.replace(".", "")),
      serviceDate: caseRef.serviceDate,
      priorAuthNumber: caseRef.authNumber ?? null,
      notes: null,
    },
    serviceLines: caseRef.cpt.map((l, i) => ({
      sequence: i + 1,
      cptCode: l.code,
      modifiers: l.modifiers,
      units: l.units,
      chargeCents: l.chargeCents * l.units,
      diagnosisPointers: caseRef.icd10.length > 0 ? [1] : [],
      serviceDate: caseRef.serviceDate,
      placeOfService: caseRef.placeOfService,
    })),
    secondary: null,
  };
}

// ---------------------------------------------------------------------------
// Main run
// ---------------------------------------------------------------------------

async function runOneCase(caseRef: BillCase) {
  const sep = "─".repeat(78);
  console.log(`\n${sep}\n[${caseRef.caseId}] ${caseRef.description}\n  expect: ${caseRef.expect}\n${sep}`);

  // ── Stage 1: Eligibility ────────────────────────────────────────
  if (caseRef.payerKey !== "selfpay") {
    const elig = await eligibilityClient.checkEligibility({
      patientId: caseRef.caseId,
      providerNpi: PRACTICE.npi,
      payerId: PAYER_EDI[caseRef.payerKey].payerId,
      serviceCode: caseRef.cpt[0].code,
    });
    console.log(`  [eligibility] ${elig.status} copay=$${elig.coverageDetails.copayAmount} warnings=${elig.warnings.length}`);
    if (caseRef.hasCannabisDx && elig.warnings.length === 0) {
      note({
        caseId: caseRef.caseId,
        stage: "eligibility",
        severity: "high",
        message: "Eligibility 271 stub did NOT flag cannabis-dx coverage exclusion (only triggers on S0339/99429 service code, not on ICD-10)",
      });
    }
  } else {
    console.log(`  [eligibility] skipped (self-pay)`);
  }

  // ── Stage 2: Cannabis payer routing ──────────────────────────────
  if (caseRef.payerKey !== "selfpay") {
    const p = PAYER_EDI[caseRef.payerKey];
    const route = shouldRouteCannabisToSelfPay({ payerId: p.payerId, payerName: p.name, hasCannabisDx: caseRef.hasCannabisDx });
    console.log(`  [routing] selfPay=${route.selfPay} reason="${route.reason}"`);
    if (caseRef.payerKey === "medicare" && caseRef.hasCannabisDx && !route.selfPay) {
      note({ caseId: caseRef.caseId, stage: "routing", severity: "critical", message: "Medicare + cannabis dx did NOT route to self-pay" });
    }
    if (caseRef.payerKey === "tricare" && caseRef.hasCannabisDx && !route.selfPay) {
      note({ caseId: caseRef.caseId, stage: "routing", severity: "critical", message: "TRICARE + cannabis dx did NOT route to self-pay" });
    }
  }

  // ── Stage 3: Scrub ───────────────────────────────────────────────
  const p = caseRef.payerKey === "selfpay" ? null : PAYER_EDI[caseRef.payerKey];
  const scrubIssues = scrubClaim({
    cptCodes: caseRef.cpt.map((l) => ({ code: l.code, label: l.label, units: l.units, chargeAmount: l.chargeCents / 100, modifiers: l.modifiers })),
    icd10Codes: caseRef.icd10,
    payerName: p?.name ?? null,
    payerId: p?.payerId ?? null,
    serviceDate: caseRef.serviceDate,
    providerId: RENDERING.npi,
    authRequired: caseRef.hasCannabisDx,
    authNumber: caseRef.authNumber ?? null,
    corrected: false,
  });
  const counts = countBySeverity(scrubIssues);
  const submittable = isClaimSubmittable(scrubIssues);
  console.log(`  [scrub] submittable=${submittable} errors=${counts.error} warnings=${counts.warning} info=${counts.info}`);
  for (const i of scrubIssues) console.log(`      [${i.severity}] ${i.ruleCode}: ${i.message}`);

  // Assertions on scrub findings
  if (caseRef.caseId === "C02-uhc-ncci-99406-no-mod25" && !scrubIssues.some((i) => /NCCI|bundl|mod/i.test(i.ruleCode + i.message))) {
    note({ caseId: caseRef.caseId, stage: "scrub", severity: "critical", message: "Missed NCCI: 99406+99213 same-day without mod 25" });
  }
  if (caseRef.caseId === "C04-cigna-phlebotomy-ncci" && !scrubIssues.some((i) => /36415|venipuncture|NCCI|bundl/i.test(i.ruleCode + i.message))) {
    note({ caseId: caseRef.caseId, stage: "scrub", severity: "critical", message: "Missed NCCI: 36415 + 99213 (unbundleable)" });
  }
  if (caseRef.caseId === "C09-anthem-past-timely" && submittable) {
    note({ caseId: caseRef.caseId, stage: "scrub", severity: "critical", message: "PAST_TIMELY_FILING did not block submission (Anthem 90d window, 95d old)" });
  }
  if (caseRef.caseId === "C08-anthem-approaching-timely" && !scrubIssues.some((i) => /approach|timely/i.test(i.ruleCode + i.message))) {
    note({ caseId: caseRef.caseId, stage: "scrub", severity: "high", message: "APPROACHING_TIMELY_FILING warning missing for 78d-old Anthem claim (window 90d)" });
  }
  if (caseRef.caseId === "C10-kaiser-mue-overage" && !scrubIssues.some((i) => /MUE/i.test(i.ruleCode + i.message))) {
    note({ caseId: caseRef.caseId, stage: "scrub", severity: "critical", message: "MUE overage (99213 × 5) not flagged" });
  }
  if (caseRef.caseId === "C11-uhc-missing-icd" && submittable) {
    note({ caseId: caseRef.caseId, stage: "scrub", severity: "critical", message: "Claim with ZERO ICD-10 codes still marked submittable" });
  }
  if (caseRef.caseId === "C07-humana-cannabis-pa-required" && submittable) {
    note({ caseId: caseRef.caseId, stage: "scrub", severity: "high", message: "Humana cannabis claim with no auth was marked submittable — PA gate missing" });
  }

  // ── Stage 4: Timely-filing deadline computation ──────────────────
  if (p) {
    const deadline = computeTimelyFilingDeadline({ serviceDate: caseRef.serviceDate, payerId: p.payerId });
    const daysRemaining = Math.floor((deadline.getTime() - TODAY.getTime()) / 86_400_000);
    console.log(`  [timely-filing] deadline=${deadline.toISOString().slice(0, 10)} daysRemaining=${daysRemaining}`);
  }

  // ── Stage 5: 837P build + SNIP validate ──────────────────────────
  if (!submittable || caseRef.payerKey === "selfpay") {
    console.log(`  [edi] skipped (not submittable or self-pay)`);
    return;
  }
  const claim837 = buildClaim837(caseRef);
  if (!claim837) return;
  const valid = validate837Input(claim837);
  if (!valid.ok) {
    note({ caseId: caseRef.caseId, stage: "837-validate", severity: "high", message: `validate837Input rejected: ${valid.errors.map((e) => e.message).join("; ")}` });
    console.log(`  [837-validate] FAIL: ${valid.errors.map((e) => e.message).join("; ")}`);
    return;
  }
  const ctl = allocator.next();
  const built = build837P(claim837, {
    isaControlNumber: ctl.isaControlNumber,
    gsControlNumber: ctl.gsControlNumber,
    stControlNumber: ctl.stControlNumber,
    date: TODAY,
    lineWrap: true,
  });
  console.log(`  [837p] built ${built.transactionSegmentCount} segs, payload=${built.payload.length}b ctl=${ctl.isaControlNumber}/${ctl.stControlNumber}`);

  const snip = validateSnip1to5(built.payload);
  console.log(`  [snip] passed=${snip.passed} findings=${snip.findings.length}`);
  for (const f of snip.findings) console.log(`      [SNIP-${f.level}] ${f.segment ?? ""} ${f.message}`);
  if (!snip.passed) {
    note({ caseId: caseRef.caseId, stage: "snip", severity: "high", message: `SNIP failed: ${snip.findings.map((f) => `L${f.level}:${f.message}`).join("; ")}` });
  }

  // ── Stage 6: Clearinghouse submission (simulated) ────────────────
  const gw = new SimulatedClearinghouseAdapter();
  const sub = await gw.submit({ ediPayload: built.payload, correlationId: caseRef.caseId });
  console.log(`  [submit] ${sub.syncStatus} tracking=${sub.gatewayTrackingId}`);

  // ── Stage 7+8: Synthetic 999 + 277CA (positive ack) ──────────────
  const ack999 = parse999({
    status: "accepted",
    icn: String(ctl.isaControlNumber).padStart(9, "0"),
    gcn: String(ctl.gsControlNumber),
    rejectedTransactionSetIds: [],
    errors: [],
  });
  console.log(`  [999] ${ack999.status} rejectedTxIds=${ack999.rejectedTransactionSetIds.length} errors=${ack999.errors.length}`);

  // 277CA: for case C04 + C09 + C11 force rejects to exercise that path
  let ack277;
  if (caseRef.caseId === "C09-anthem-past-timely") {
    ack277 = parse277CA(synthetic277Reject(caseRef.caseId, "DUPLICATE"));
  } else if (caseRef.caseId === "C11-uhc-missing-icd") {
    ack277 = parse277CA(synthetic277Reject(caseRef.caseId, "INVALID_NPI"));
  } else {
    ack277 = parse277CA({
      claims: [
        {
          claimControlNumber: caseRef.caseId,
          category: "accepted" as const,
          statusCode: "A2",
          statusDescription: "Accepted for processing",
        },
      ],
    });
  }
  const actions = decide277Actions(ack277);
  console.log(`  [277CA] claims=${ack277.claims.length} actions=${actions.map((a) => a.action).join(",")}`);

  // ── Stage 9-12: ERA flow (for accepted-then-paid scenario) ───────
  if (ack277.claims[0].category === "accepted") {
    const scenario: "paid" | "denied" | "partial" | "takeback" =
      caseRef.caseId === "C12-aetna-primary-bcbs-secondary" ? "paid" :
      caseRef.caseId === "C06-medicare-cannabis-excluded" ? "denied" :
      caseRef.caseId === "C05-medicare-telehealth-clean" ? "partial" :
      "paid";
    const eraJson = syntheticEra(caseRef, scenario);
    if (eraJson) {
      const era = parseJsonEra(eraJson);
      const claimPay = era.claimPayments[0];
      console.log(`  [835] scenario=${scenario} paid=$${(claimPay.totalPaidCents / 100).toFixed(2)} pr=$${(claimPay.patientRespCents / 100).toFixed(2)}`);

      const reconc = reconcileEraTotals(era);
      if (!reconc.balanced) {
        note({ caseId: caseRef.caseId, stage: "era-reconcile", severity: "high", message: `ERA totals unbalanced: ${reconc.message}` });
      }
      const status = classifyClaimStatus(claimPay);
      console.log(`  [adjudication] status=${status}`);

      // Stage 11: classify each adjustment
      const split = splitPatientResponsibility(
        claimPay.claimAdjustments.map((a) => ({ groupCode: a.groupCode as "PR" | "CO" | "OA" | "PI" | "CR" | "WO", carcCode: a.carcCode, amountCents: a.amountCents })),
      );
      console.log(`  [pr-split] deductible=$${(split.deductibleCents / 100).toFixed(2)} coins=$${(split.coinsuranceCents / 100).toFixed(2)} copay=$${(split.copayCents / 100).toFixed(2)}`);

      const totals = reconcileClaimTotals({
        billedCents: claimPay.totalChargeCents,
        paidCents: claimPay.totalPaidCents,
        adjustmentsCents: claimPay.claimAdjustments.reduce((a, x) => a + x.amountCents, 0),
      });
      if (!totals.balanced) {
        note({ caseId: caseRef.caseId, stage: "claim-reconcile", severity: "high", message: `Claim totals don't balance: ${totals.message}` });
      }

      // Stage 12: denial classification (only if status indicates denial)
      if (status === "denied" || status === "partial") {
        const carc = claimPay.claimAdjustments[0]?.carcCode ?? "";
        const tax = classifyDenial(`CARC ${carc}: denial`);
        console.log(`  [denial-class] category=${tax.category} nextAction=${tax.suggestedAction}`);
      }

      // Stage 13: underpayment detection
      if (p) {
        const report = detectClaimUnderpayments({
          contracts: CONTRACTS,
          payerId: p.payerId,
          serviceDate: caseRef.serviceDate,
          lines: claimPay.serviceLines.map((s) => ({ cptCode: s.cptCode, modifiers: s.modifiers, allowedCents: s.paidCents + s.adjustments.filter((a) => a.groupCode === "PR").reduce((acc, a) => acc + a.amountCents, 0) })),
        });
        console.log(`  [underpayment] underpaidLines=${report.underpaidLineCount} shortfall=$${(report.totalShortfallCents / 100).toFixed(2)} contract=${report.contractId ?? "none"}`);
        if (caseRef.caseId === "C03-bcbs-clean-em-counsel" && report.contractId === null) {
          note({ caseId: caseRef.caseId, stage: "underpayment", severity: "medium", message: "BCBS contract not found despite seeded contract ctr-bcbs-2026" });
        }
      }

      // Stage 14: secondary claim build (only for C12)
      if (caseRef.caseId === "C12-aetna-primary-bcbs-secondary" && claim837) {
        const secondary = buildSecondaryClaimInput({
          primaryInput: claim837,
          primaryAdjudication: claimPay,
          primaryEraDate: era.checkDate,
          secondaryPayer: { name: PAYER_EDI.bcbs.name, payerId: PAYER_EDI.bcbs.payerId },
          secondarySubscriber: { ...claim837.subscriber, memberId: "YPK998877", insuranceType: "BL" },
        });
        const willFile = shouldFileSecondary(claimPay);
        const patientResp = patientResponsibilityCents(claimPay);
        console.log(`  [secondary] shouldFile=${willFile} prRemaining=$${(patientResp / 100).toFixed(2)} warnings=${secondary.warnings.length}`);
        if (willFile) {
          // Re-build the 837P with secondary block
          const sCtl = allocator.next();
          const sBuilt = build837P(secondary.input, { isaControlNumber: sCtl.isaControlNumber, gsControlNumber: sCtl.gsControlNumber, stControlNumber: sCtl.stControlNumber, date: TODAY, lineWrap: true });
          const sSnip = validateSnip1to5(sBuilt.payload);
          console.log(`  [secondary-837] segs=${sBuilt.transactionSegmentCount} snipPassed=${sSnip.passed} findings=${sSnip.findings.length}`);
          if (!sSnip.passed) {
            note({ caseId: caseRef.caseId, stage: "secondary-snip", severity: "high", message: `Secondary 837P SNIP failed: ${sSnip.findings.slice(0, 3).map((f) => f.message).join("; ")}` });
          }
        }
      }

      // Stage 15: reimbursement prediction
      if (p) {
        const pred = predictReimbursement({
          cptCode: caseRef.cpt[0].code,
          modifier: caseRef.cpt[0].modifiers[0] ?? null,
          payerId: p.payerId,
          payerClass: resolvePayerRule({ payerId: p.payerId }).class,
          serviceDate: caseRef.serviceDate,
          feeScheduleChargeCents: caseRef.cpt[0].chargeCents,
          contracts: CONTRACTS,
          history: [],
        });
        const actualPaid = claimPay.serviceLines[0]?.paidCents ?? 0;
        const variancePct = pred.predictedCents > 0 ? ((actualPaid - pred.predictedCents) / pred.predictedCents) * 100 : 0;
        console.log(`  [predict] predicted=$${(pred.predictedCents / 100).toFixed(2)} actualPaid=$${(actualPaid / 100).toFixed(2)} source=${pred.source} conf=${pred.confidence.toFixed(2)} variance=${variancePct.toFixed(1)}%`);
      }

      return { era, claimPay };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Run everything
// ---------------------------------------------------------------------------

async function main() {
  console.log("RCM STRESS TEST — production billing modules");
  console.log(`Today: ${TODAY.toISOString().slice(0, 10)}`);
  console.log(`Cases: ${cases.length}`);

  // Identifiers sanity
  if (!isValidNpi(PRACTICE.npi)) note({ caseId: "FIXTURES", stage: "identifiers", severity: "high", message: `Practice NPI ${PRACTICE.npi} fails Luhn` });
  if (!isValidNpi(RENDERING.npi)) note({ caseId: "FIXTURES", stage: "identifiers", severity: "high", message: `Rendering NPI ${RENDERING.npi} fails Luhn` });
  if (!isValidEin(PRACTICE.taxId)) note({ caseId: "FIXTURES", stage: "identifiers", severity: "high", message: `Practice EIN ${PRACTICE.taxId} fails validation` });

  const eraResults: Array<{ caseRef: BillCase; era: any; claimPay: Era835ClaimPayment }> = [];

  for (const c of cases) {
    try {
      const result = await runOneCase(c);
      if (result) eraResults.push({ caseRef: c, ...result });
    } catch (e: any) {
      note({ caseId: c.caseId, stage: "RUNTIME", severity: "critical", message: `Exception: ${e.message}`, detail: e.stack?.split("\n").slice(0, 5) });
      console.error(`  [error] ${e.message}\n${e.stack?.split("\n").slice(0, 5).join("\n")}`);
    }
  }

  // ── Portfolio-level RCM analytics ──────────────────────────────────
  const sep = "═".repeat(78);
  console.log(`\n${sep}\nPORTFOLIO-LEVEL RCM ANALYTICS\n${sep}`);

  // Underpayment summary across all paid claims
  const underReports = eraResults.map(({ caseRef, claimPay }) => {
    const p = syntheticPayer(caseRef);
    if (!p) return null;
    return {
      payerId: p.payerId,
      payerName: p.name,
      report: detectClaimUnderpayments({
        contracts: CONTRACTS,
        payerId: p.payerId,
        serviceDate: caseRef.serviceDate,
        lines: claimPay.serviceLines.map((s) => ({ cptCode: s.cptCode, modifiers: s.modifiers, allowedCents: s.paidCents + s.adjustments.filter((a) => a.groupCode === "PR").reduce((acc, a) => acc + a.amountCents, 0) })),
      }),
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);
  const portfolio = summarizeUnderpayments(underReports);
  console.log(`Underpayments: ${portfolio.underpaidClaims}/${portfolio.totalClaims} claims, $${(portfolio.totalShortfallCents / 100).toFixed(2)} total shortfall`);
  for (const r of portfolio.byPayer) console.log(`  ${r.payerName.padEnd(28)} $${(r.shortfallCents / 100).toFixed(2)} across ${r.underpaidClaims} claims`);

  // Aging snapshot — build pseudo claims
  const claimsForAging = cases.map((c) => ({
    id: c.caseId,
    serviceDate: c.serviceDate,
    status: c.caseId === "C09-anthem-past-timely" ? "denied" : c.caseId === "C06-medicare-cannabis-excluded" ? "denied" : "adjudicated",
    payerName: c.payerKey === "selfpay" ? null : PAYER_EDI[c.payerKey].name,
    billedAmountCents: c.cpt.reduce((a, l) => a + l.chargeCents * l.units, 0),
    paidAmountCents: c.cpt.reduce((a, l) => a + l.chargeCents * l.units, 0) * 0.5,
    patientRespCents: 3500,
    payments: [{ source: "patient", amountCents: 1000 }],
  }));
  const aging = ageClaims(claimsForAging);
  console.log(`\nAging snapshot:`);
  console.log(`  total A/R = $${(aging.totals.total / 100).toFixed(2)} (insurance $${(aging.totals.insurance / 100).toFixed(2)} + patient $${(aging.totals.patient / 100).toFixed(2)})`);
  for (const b of ["0-30", "31-60", "61-90", "91-120", "120+"] as const) {
    const bk = aging.totals.byBucket[b];
    console.log(`    ${b.padEnd(8)} $${(bk.total / 100).toFixed(2)}`);
  }
  console.log(`  daysInAR = ${daysInAR(claimsForAging).toFixed(1)}`);

  // Statement cadence — pick a couple of cases
  console.log(`\nStatement cadence simulation:`);
  for (const daysOut of [25, 32, 65, 95]) {
    const dec = decideCadence({
      firstResponsibilityAt: new Date(TODAY.getTime() - daysOut * 86_400_000),
      lastStatementSentAt: daysOut >= 32 ? new Date(TODAY.getTime() - (daysOut - 30) * 86_400_000) : null,
      lastPatientPaymentAt: null,
      amountDueCents: 8500,
      onPaymentPlan: false,
    }, TODAY);
    console.log(`  ${daysOut}d since first resp: cycle=${dec.cycle} issue=${dec.shouldIssue} (${dec.reason})`);
  }

  const stmtNum = generateStatementNumber(TODAY, 0);
  console.log(`  next statement #: ${stmtNum}`);

  // Lockbox match — fake a deposit batch
  console.log(`\nLockbox match:`);
  const exactAmount = eraResults[0]?.era?.totalPaymentCents ?? 25000;
  const bank = parseBankCsv(`Date,Amount,Description,Reference\n2026-05-10,${(exactAmount / 100).toFixed(2)},AETNA REMITTANCE,TRC120010001\n2026-05-10,$413.00,UHC EFT PAYMENT,TRC120020001`);
  console.log(`  parsed ${bank.rows.length} deposit rows, ${bank.errors.length} errors`);
  const candidates = eraResults.slice(0, 5).map(({ era }) => ({
    kind: "era" as const,
    id: era.checkNumber,
    amountCents: era.totalPaymentCents,
    expectedDate: era.checkDate,
    label: `${era.payerName} ${era.checkNumber}`,
  }));
  for (const deposit of bank.rows) {
    const outcome = matchDeposit(deposit, candidates);
    const matched = outcome.assignments.map((a) => a.candidate.label).join(",") || "none";
    console.log(`  deposit $${(deposit.amountCents / 100).toFixed(2)} (${deposit.bankReference}) → ${outcome.status} matched=${matched} variance=$${(outcome.varianceCents / 100).toFixed(2)}`);
  }

  // Appeal arg ranking — feed synthetic history
  console.log(`\nAppeal argument ranking (synthetic history):`);
  // Synthesize 10 historical appeals: timely_filing_proof wins 4/5 vs CO-29; policy_citation wins 2/5
  const history: OutcomeHistoryRow[] = [];
  for (let i = 0; i < 10; i++) {
    const tag = i % 2 === 0 ? "timely_filing_proof" : "policy_citation";
    const result = (i % 2 === 0 && i < 8) ? "overturned" : (i % 2 === 1 && i < 4) ? "overturned" : "upheld";
    history.push({
      payerId: "60054",
      carcCode: "29",
      argumentTags: [tag],
      result,
      recoveredCents: result === "overturned" ? 12000 : 0,
    });
  }
  const ranked = rankArguments({
    payerId: "60054",
    carcCode: "29",
    candidates: ["timely_filing_proof", "policy_citation", "medical_necessity"],
    history,
  });
  for (const r of ranked) {
    console.log(`  ${r.tag.padEnd(28)} winRate=${r.winRate.toFixed(2)} sample=${r.sampleSize} avgRecovery=$${(r.averageRecoveryCents / 100).toFixed(2)} (${r.reason})`);
  }

  const wpb = winRateByPayer(history.map((h) => ({ ...h, payerName: "Aetna" })));
  console.log(`Win rate by payer: ${wpb.map((w) => `${w.payerName}:${w.total > 0 ? Math.round((w.wins / w.total) * 100) : 0}% (n=${w.total})`).join(", ")}`);
  const wbc = winRateByCarc(history);
  console.log(`Win rate by CARC: ${wbc.map((w) => `${w.carcCode}:${w.total > 0 ? Math.round((w.wins / w.total) * 100) : 0}% (n=${w.total})`).join(", ")}`);

  // ── Findings ledger ───────────────────────────────────────────────
  console.log(`\n${sep}\nFINDINGS LEDGER (${ledger.length} entries)\n${sep}`);
  const bySev: Record<Severity, Finding[]> = { critical: [], high: [], medium: [], low: [], info: [], pass: [] };
  for (const f of ledger) bySev[f.severity].push(f);
  for (const sev of ["critical", "high", "medium", "low", "info"] as Severity[]) {
    if (bySev[sev].length === 0) continue;
    console.log(`\n  ${SEV_ICON[sev]} ${sev.toUpperCase()} (${bySev[sev].length})`);
    for (const f of bySev[sev]) {
      console.log(`     [${f.caseId}/${f.stage}] ${f.message}`);
      if (f.detail) console.log(`       detail: ${JSON.stringify(f.detail)}`);
    }
  }
  console.log(`\n${sep}\nDONE\n${sep}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
