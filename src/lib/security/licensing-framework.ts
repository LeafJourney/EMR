/**
 * EMR-084 — Licensing + IP framework.
 *
 * The encryption side of EMR-084 lives in `./encryption-framework.ts`. This
 * companion module is the *legal / commercial* surface: the set of
 * artifacts a sales engineer or counsel needs when pitching Leafjourney
 * to a hospital system, Epic / Cerner partner, or PT/OT chain.
 *
 * The data is intentionally static and version-controlled here (rather
 * than living in a CMS) so:
 *   1. Changes are reviewed alongside code.
 *   2. The licensing brochure endpoint can re-render deterministically.
 *   3. The compliance audit page can show "what we license, against
 *      which claims, with which sample contract."
 *
 * Counsel reviewed shape:
 *   - LICENSEE_TIERS         — outpatient → hospital pricing buckets
 *   - INTELLECTUAL_PROPERTY  — patent + trademark claim inventory
 *   - COMPLIANCE_ATTESTATIONS — what Leafjourney represents to a buyer
 *   - SAMPLE_CONTRACTS       — boilerplate MSA + DPA + BAA templates
 */

export type LicenseeKind =
  | "outpatient_clinic"
  | "specialty_practice"
  | "hospital"
  | "health_system"
  | "ehr_vendor_partner"
  | "research_institution";

export interface LicenseeTier {
  kind: LicenseeKind;
  label: string;
  description: string;
  /** Indicative starting list price per provider per month. */
  startingPricePerProvider: number;
  /** Typical revenue share when bundled by an EHR partner. */
  partnerRevenueSharePct?: number;
  /** Service levels available for this tier (SLA targets). */
  uptimeTarget: number;
  /** Whether on-prem deployment is contractually supported. */
  onPremiseAvailable: boolean;
}

export const LICENSEE_TIERS: LicenseeTier[] = [
  {
    kind: "outpatient_clinic",
    label: "Outpatient clinic",
    description: "Independent or small-group practices (1–10 providers).",
    startingPricePerProvider: 199,
    uptimeTarget: 99.5,
    onPremiseAvailable: false,
  },
  {
    kind: "specialty_practice",
    label: "Specialty practice",
    description:
      "PT/OT, pain, behavioral-health, cannabis-medicine clinics with specialty workflows.",
    startingPricePerProvider: 249,
    uptimeTarget: 99.5,
    onPremiseAvailable: false,
  },
  {
    kind: "hospital",
    label: "Hospital (single facility)",
    description:
      "Community hospitals adopting Leafjourney for outpatient + ambulatory floors.",
    startingPricePerProvider: 349,
    uptimeTarget: 99.9,
    onPremiseAvailable: true,
  },
  {
    kind: "health_system",
    label: "Multi-facility health system",
    description:
      "Networks running Leafjourney across multiple sites, integrating with an enterprise EHR.",
    startingPricePerProvider: 449,
    uptimeTarget: 99.95,
    onPremiseAvailable: true,
  },
  {
    kind: "ehr_vendor_partner",
    label: "EHR vendor partner",
    description:
      "Epic, Cerner, Athena, etc. embedding Leafjourney modules under their own UI.",
    startingPricePerProvider: 0,
    partnerRevenueSharePct: 30,
    uptimeTarget: 99.9,
    onPremiseAvailable: true,
  },
  {
    kind: "research_institution",
    label: "Research institution",
    description:
      "Academic medical centers + CROs running de-identified cohort analytics.",
    startingPricePerProvider: 129,
    uptimeTarget: 99.5,
    onPremiseAvailable: false,
  },
];

export type IpClaimKind = "patent_pending" | "patent_filed" | "trademark" | "trade_secret" | "copyright";

export interface IpClaim {
  id: string;
  kind: IpClaimKind;
  title: string;
  description: string;
  /** What part of the system the claim covers. */
  surface: string;
  /** Reference number where applicable. */
  reference?: string;
}

export const INTELLECTUAL_PROPERTY: IpClaim[] = [
  {
    id: "ip.envelope-encryption",
    kind: "trade_secret",
    title: "Envelope-encryption PHI store with per-record DEKs",
    description:
      "HKDF-derived per-purpose wrap keys, per-record DEKs wrapped under a customer-controlled KEK; auditable, key-rotatable PHI at rest.",
    surface: "src/lib/security/encryption-framework.ts",
  },
  {
    id: "ip.sensitivity-classifier",
    kind: "patent_pending",
    title: "Mental-health sensitivity classifier with break-glass workflow",
    description:
      "Multi-signal classifier (CPT, ICD-10, note-type, free-text) ranks PHI sensitivity and conditionally requires a recorded clinician attestation before disclosure.",
    surface: "src/lib/clinical/mental-health-access.ts",
  },
  {
    id: "ip.cannabis-contraindication",
    kind: "patent_pending",
    title: "Cannabis-specific contraindication override engine",
    description:
      "Codified absolute / relative / caution contraindications with override gating, attestation, and audit-coupled prescribing.",
    surface: "src/lib/clinical/contraindication-check.ts",
  },
  {
    id: "ip.compliance-agent",
    kind: "trade_secret",
    title: "Activity-pattern compliance audit agent",
    description:
      "Rule-driven sweeper that ranks off-hours access, snooping, bulk-export, auth-anomaly and break-glass behaviors into a privacy-officer triage queue.",
    surface: "src/lib/agents/compliance-audit-agent.ts",
  },
  {
    id: "ip.leafjourney-mark",
    kind: "trademark",
    title: "Leafjourney® word + leaf-burst logo",
    description:
      "Cannabis-medicine EMR brand mark, registered in classes 9 (software) and 44 (medical services).",
    surface: "Brand surface",
    reference: "USPTO Class 9 / 44",
  },
  {
    id: "ip.cannabis-search-chatcb",
    kind: "trademark",
    title: "ChatCB™ conversational cannabis search",
    description:
      "Conversational cannabis evidence search trained on PubMed cannabinoid-disease pairs and our outcome registry.",
    surface: "src/app/(public)/education/chatcb",
  },
  {
    id: "ip.michelin-licensing-menu",
    kind: "copyright",
    title: "Michelin-style modular licensing brochure",
    description:
      "Editorial framing of the platform as a star-rated modular menu, with tiered comparison matrix and à la carte pricing.",
    surface: "src/lib/platform/licensing.ts",
  },
];

export type AttestationFramework =
  | "HIPAA"
  | "HITECH"
  | "SOC 2 Type II"
  | "HITRUST CSF"
  | "Joint Commission"
  | "CMS Conditions of Participation"
  | "42 CFR Part 2"
  | "NIST SP 800-66"
  | "NIST SP 800-53"
  | "GDPR";

export interface ComplianceAttestation {
  framework: AttestationFramework;
  scope: string;
  /** Single-sentence summary of how Leafjourney meets the framework. */
  statement: string;
  evidenceArtifacts: string[];
}

export const COMPLIANCE_ATTESTATIONS: ComplianceAttestation[] = [
  {
    framework: "HIPAA",
    scope: "PHI at rest, in transit, and at the access boundary.",
    statement:
      "AES-256-GCM with per-record DEKs, TLS 1.2+, role-based access controls, signed BAA, audit logs satisfying §164.312(b).",
    evidenceArtifacts: [
      "src/lib/security/encryption-framework.ts",
      "src/lib/clinical/mental-health-access.ts",
      "scripts/export-audit-log.ts",
    ],
  },
  {
    framework: "42 CFR Part 2",
    scope: "Substance-use disorder treatment records.",
    statement:
      "Sensitive-record overlay restricts SUD records to roles with a documented treatment relationship; disclosures require patient-specific consent.",
    evidenceArtifacts: [
      "src/lib/clinical/mental-health-access.ts",
      "src/lib/clinical/record-release-workflow.ts",
    ],
  },
  {
    framework: "Joint Commission",
    scope: "Clinical documentation completeness (RC.01.01.01).",
    statement:
      "Note compliance checker validates chief complaint, assessment, signature, and diagnosis-code attachment before a note can be finalized.",
    evidenceArtifacts: [
      "src/lib/compliance/note-compliance-check.ts",
    ],
  },
  {
    framework: "CMS Conditions of Participation",
    scope: "Medical record timeliness (42 CFR §482.24).",
    statement:
      "Compliance checker flags notes signed more than 24 hours after the encounter and PDMP queries missing on controlled-substance prescribing.",
    evidenceArtifacts: [
      "src/lib/compliance/note-compliance-check.ts",
    ],
  },
  {
    framework: "SOC 2 Type II",
    scope: "Security, availability, and confidentiality.",
    statement:
      "Append-only ControllerAuditLog, RBAC across surfaces, encrypted backups, and incident-response runbooks underpin the trust services criteria.",
    evidenceArtifacts: [
      "src/lib/auth/audit-stub.ts",
      "src/lib/rbac/*",
    ],
  },
];

/**
 * Sample contract templates the sales team can hand to counsel for
 * redlines. These are NOT a substitute for legal review — they exist so
 * a counterparty has something concrete to negotiate from on day one.
 */
export type SampleContractKind =
  | "master_services_agreement"
  | "business_associate_agreement"
  | "data_processing_addendum"
  | "ehr_partner_agreement"
  | "research_data_use_agreement";

export interface SampleContract {
  kind: SampleContractKind;
  title: string;
  description: string;
  /** Counterparty profile this template is tuned for. */
  audience: LicenseeKind[];
  /** Headline clauses the buyer should expect. */
  keyClauses: string[];
  /** Default terms the sales engineer should pre-fill. */
  defaultTerms: {
    termYears: number;
    autoRenewYears: number;
    noticeDays: number;
    feeStructure: string;
  };
}

export const SAMPLE_CONTRACTS: SampleContract[] = [
  {
    kind: "master_services_agreement",
    title: "Leafjourney Master Services Agreement (MSA)",
    description:
      "Anchor contract covering subscription term, fees, SLAs, IP allocation, indemnification, and termination.",
    audience: ["outpatient_clinic", "specialty_practice", "hospital", "health_system"],
    keyClauses: [
      "Subscription scope + named-provider seat counts",
      "Service-level commitments (uptime, support response, breach notification)",
      "IP ownership: licensee owns its data; Leafjourney retains platform IP",
      "Indemnification for IP infringement and gross negligence",
      "Termination for cause + transition-services obligation",
    ],
    defaultTerms: {
      termYears: 3,
      autoRenewYears: 1,
      noticeDays: 90,
      feeStructure: "Per-provider monthly subscription, billed annually",
    },
  },
  {
    kind: "business_associate_agreement",
    title: "HIPAA Business Associate Agreement (BAA)",
    description:
      "Required for any covered-entity licensee. Imposes HIPAA Security and Privacy obligations on Leafjourney.",
    audience: ["outpatient_clinic", "specialty_practice", "hospital", "health_system"],
    keyClauses: [
      "Permitted uses + disclosures of PHI",
      "Safeguards: administrative, physical, technical (§164.308–.312)",
      "Breach notification within 60 days",
      "Sub-contractor flow-down obligations",
      "Return / destruction of PHI on termination",
    ],
    defaultTerms: {
      termYears: 3,
      autoRenewYears: 1,
      noticeDays: 30,
      feeStructure: "Bundled with MSA — no separate fee",
    },
  },
  {
    kind: "data_processing_addendum",
    title: "Data Processing Addendum (DPA)",
    description:
      "GDPR / state-privacy-law processor obligations. Required for any licensee with EU patients or California-resident patients.",
    audience: ["outpatient_clinic", "specialty_practice", "hospital", "health_system", "research_institution"],
    keyClauses: [
      "Processor obligations under GDPR Art. 28",
      "International data-transfer mechanism (SCCs)",
      "Sub-processor list + change-notification window",
      "Data-subject rights support obligations",
    ],
    defaultTerms: {
      termYears: 3,
      autoRenewYears: 1,
      noticeDays: 30,
      feeStructure: "Bundled with MSA",
    },
  },
  {
    kind: "ehr_partner_agreement",
    title: "EHR Vendor Partner Agreement",
    description:
      "Distribution + revenue-share contract for embedding Leafjourney modules into Epic / Cerner / Athena.",
    audience: ["ehr_vendor_partner"],
    keyClauses: [
      "License grant to embed Leafjourney modules under partner UI",
      "Co-branding + trademark usage limits",
      "Revenue share + reconciliation cadence",
      "Joint customer support runbook",
    ],
    defaultTerms: {
      termYears: 5,
      autoRenewYears: 2,
      noticeDays: 180,
      feeStructure: "Revenue share (30% default) on partner-sourced licensees",
    },
  },
  {
    kind: "research_data_use_agreement",
    title: "Research Data Use Agreement (DUA)",
    description:
      "Governs access to the de-identified outcome registry for academic research and CRO partnerships.",
    audience: ["research_institution"],
    keyClauses: [
      "De-identification standard (HIPAA Safe Harbor)",
      "Permitted research purposes + IRB requirement",
      "No re-identification covenant",
      "Publication review + acknowledgement obligations",
    ],
    defaultTerms: {
      termYears: 2,
      autoRenewYears: 1,
      noticeDays: 60,
      feeStructure: "Per-study access fee + revenue share on commercial use",
    },
  },
];

/**
 * Build the framework summary the operator surface renders on
 * /ops/platform/licensing → "IP & Compliance" panel.
 */
export interface LicensingFrameworkSummary {
  tiers: LicenseeTier[];
  ipCounts: Record<IpClaimKind, number>;
  attestationFrameworks: AttestationFramework[];
  contractCount: number;
  /** True iff there's at least one patent-pending claim — drives the badge. */
  hasPatentPending: boolean;
}

export function buildFrameworkSummary(): LicensingFrameworkSummary {
  const ipCounts: Record<IpClaimKind, number> = {
    patent_pending: 0,
    patent_filed: 0,
    trademark: 0,
    trade_secret: 0,
    copyright: 0,
  };
  for (const c of INTELLECTUAL_PROPERTY) ipCounts[c.kind] += 1;

  return {
    tiers: LICENSEE_TIERS,
    ipCounts,
    attestationFrameworks: COMPLIANCE_ATTESTATIONS.map((a) => a.framework),
    contractCount: SAMPLE_CONTRACTS.length,
    hasPatentPending: ipCounts.patent_pending > 0,
  };
}
