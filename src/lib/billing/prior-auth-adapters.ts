/**
 * Prior-auth portal adapters  (EMR-229)
 * --------------------------------------------------------------
 * One adapter per payer portal (or a generic fax fallback). Each
 * adapter implements `submit()` — assemble + send the packet to the
 * payer in whatever format that payer wants.
 *
 * V1 scope: stub adapters for the top-5 commercial payers + a fax
 * fallback. Real headless submission lands in EMR-229's follow-up
 * (browser automation against the actual portals).
 */
import type { PriorAuthPacket } from "./prior-auth";

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface PortalSubmissionInput {
  payerName: string;
  payerId: string | null;
  patientId: string;
  cptCodes: string[];
  icd10Codes: string[];
  packetPayload: PriorAuthPacket | unknown;
}

export interface PortalSubmissionResult {
  /** Adapter-specific tracking id (case number, fax confirmation,
   *  portal submission id). Stored on `PriorAuthorization.externalRef`
   *  and used to poll for outcome. */
  externalRef: string;
}

export interface PortalAdapter {
  readonly id: string;
  readonly displayName: string;
  /** Lowercased substrings — first match wins when picking by payer name. */
  readonly supportedPayers: readonly string[];
  submit(input: PortalSubmissionInput): Promise<PortalSubmissionResult>;
}

// ---------------------------------------------------------------------------
// Stub adapters
// ---------------------------------------------------------------------------

/** Generic stub that simulates a successful headless submission. Real
 *  adapters live in `src/lib/integrations/payer-portals/<payer>.ts`
 *  (out of scope for this PR). This keeps the workflow flow exercised
 *  end-to-end in dev / test without depending on external portals. */
function stubSubmit(adapterId: string): PortalAdapter["submit"] {
  return async (input) => {
    // The reference is deterministic on (adapter, patient, cpt codes,
    // current minute) so retries return the same id. That's how a
    // real portal's "duplicate submission" check works — caller's
    // idempotency key reuses the id.
    const slug = `${adapterId}-${input.patientId.slice(0, 6)}-${input.cptCodes.join("_")}`;
    const minute = Math.floor(Date.now() / 60000);
    return { externalRef: `${slug}-${minute}` };
  };
}

const ADAPTERS: PortalAdapter[] = [
  {
    id: "availity_pa",
    displayName: "Availity Prior Auth Portal",
    supportedPayers: ["aetna", "anthem", "cigna", "humana"],
    submit: stubSubmit("availity_pa"),
  },
  {
    id: "uhc_link",
    displayName: "UnitedHealthcare Link / OptumRx",
    supportedPayers: ["uhc", "united healthcare", "united health", "unitedhealth", "optum"],
    submit: stubSubmit("uhc_link"),
  },
  {
    id: "bcbs_provider_central",
    displayName: "BCBS Provider Central",
    supportedPayers: ["bcbs", "blue cross", "blue shield", "anthem bcbs"],
    submit: stubSubmit("bcbs"),
  },
  {
    id: "carecentrix",
    displayName: "CareCentrix",
    supportedPayers: ["carecentrix"],
    submit: stubSubmit("carecentrix"),
  },
  // ── EMR-952 — additional ePA / utilization-management engines ─────────────
  {
    id: "covermymeds",
    displayName: "CoverMyMeds",
    supportedPayers: ["covermymeds", "express scripts", "caremark", "optumrx", "medimpact"],
    submit: stubSubmit("covermymeds"),
  },
  {
    id: "innovaccer",
    displayName: "Innovaccer",
    supportedPayers: ["innovaccer", "molina", "centene", "wellcare"],
    submit: stubSubmit("innovaccer"),
  },
  {
    id: "insight_health",
    displayName: "Insight Health",
    supportedPayers: ["insight health", "insight", "kaiser", "tricare"],
    submit: stubSubmit("insight_health"),
  },
  {
    id: "scriberunner",
    displayName: "ScribeRunner",
    supportedPayers: ["scriberunner", "medicaid", "medicare", "ambetter"],
    submit: stubSubmit("scriberunner"),
  },
  {
    id: "manual_fax",
    displayName: "Manual fax (universal fallback)",
    supportedPayers: [],
    submit: async (input) => {
      // The fax adapter records intent; an operator picks up the
      // queued AgentJob and faxes the packet. The "external ref" is
      // the synthetic FAX-* id we'll later reconcile against the
      // outbound fax confirmation.
      return { externalRef: `FAX-${Date.now()}-${input.patientId.slice(0, 6)}` };
    },
  },
];

const REGISTRY = new Map<string, PortalAdapter>(ADAPTERS.map((a) => [a.id, a]));

export function listPortalAdapters(): PortalAdapter[] {
  return ADAPTERS;
}

export function getPortalAdapter(id: string): PortalAdapter | null {
  return REGISTRY.get(id) ?? null;
}
