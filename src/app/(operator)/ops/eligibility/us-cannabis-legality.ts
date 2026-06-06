// EMR-942 / EMR-949 — US cannabis legality + medical-card application source.
//
// A LOCAL, deterministic 50-state (+ DC) dataset backing two eligibility
// surfaces:
//   1. The state-legality popup (EMR-942a) — color-coded grid where hovering a
//      state reveals recreational / medicinal / both / neither.
//   2. The medical-card application link (EMR-949) — maps the selected state to
//      its official medical-marijuana program application page.
//
// This is a curated starter snapshot of program status (recreational +
// medical) reflecting broadly-known state programs. Cannabis law changes
// frequently; treat this as guidance, not legal advice, and refresh against
// the state programs when an authoritative feed lands.

export type LegalityStatus = "both" | "recreational" | "medicinal" | "neither";

export interface StateLegality {
  /** USPS two-letter code. */
  code: string;
  /** Full state name. */
  name: string;
  /** Combined recreational/medical posture. */
  status: LegalityStatus;
  /**
   * Official medical-marijuana-card / program application page. Null when the
   * state has no medical program (status "recreational" with no med track, or
   * "neither"); the eligibility UI falls back to a generic note in that case.
   */
  applicationUrl: string | null;
}

// Alphabetical by name. `applicationUrl` points at each state's official
// medical-cannabis program / patient-registry landing page.
export const US_CANNABIS_LEGALITY: StateLegality[] = [
  { code: "AL", name: "Alabama", status: "medicinal", applicationUrl: "https://amcc.alabama.gov/" },
  { code: "AK", name: "Alaska", status: "both", applicationUrl: "https://manage.alaska.gov/dmv/mmm/" },
  { code: "AZ", name: "Arizona", status: "both", applicationUrl: "https://azdhs.gov/licensing/medical-marijuana/index.php" },
  { code: "AR", name: "Arkansas", status: "medicinal", applicationUrl: "https://www.healthy.arkansas.gov/programs-services/topics/medical-marijuana" },
  { code: "CA", name: "California", status: "both", applicationUrl: "https://www.cdph.ca.gov/Programs/CHSI/Pages/MMICP.aspx" },
  { code: "CO", name: "Colorado", status: "both", applicationUrl: "https://cdphe.colorado.gov/medical-marijuana-registry" },
  { code: "CT", name: "Connecticut", status: "both", applicationUrl: "https://portal.ct.gov/dcp/medical-marijuana-program/medical-marijuana-program" },
  { code: "DE", name: "Delaware", status: "both", applicationUrl: "https://dhss.delaware.gov/dhss/dph/hsp/medmarpatient.html" },
  { code: "FL", name: "Florida", status: "medicinal", applicationUrl: "https://knowthefactsmmj.com/registry/" },
  { code: "GA", name: "Georgia", status: "medicinal", applicationUrl: "https://dph.georgia.gov/low-thc-oil-registry" },
  { code: "HI", name: "Hawaii", status: "medicinal", applicationUrl: "https://health.hawaii.gov/medicalcannabis/" },
  { code: "ID", name: "Idaho", status: "neither", applicationUrl: null },
  { code: "IL", name: "Illinois", status: "both", applicationUrl: "https://dph.illinois.gov/topics-services/prevention-wellness/medical-cannabis.html" },
  { code: "IN", name: "Indiana", status: "neither", applicationUrl: null },
  { code: "IA", name: "Iowa", status: "medicinal", applicationUrl: "https://hhs.iowa.gov/public-health/medical-cannabidiol" },
  { code: "KS", name: "Kansas", status: "neither", applicationUrl: null },
  { code: "KY", name: "Kentucky", status: "medicinal", applicationUrl: "https://kymedcan.ky.gov/" },
  { code: "LA", name: "Louisiana", status: "medicinal", applicationUrl: "https://www.lsbme.la.gov/content/medical-marijuana" },
  { code: "ME", name: "Maine", status: "both", applicationUrl: "https://www.maine.gov/dafs/ocp/medical-use" },
  { code: "MD", name: "Maryland", status: "both", applicationUrl: "https://cannabis.maryland.gov/Pages/patients.aspx" },
  { code: "MA", name: "Massachusetts", status: "both", applicationUrl: "https://www.mass.gov/how-to/apply-for-a-medical-marijuana-patient-registration" },
  { code: "MI", name: "Michigan", status: "both", applicationUrl: "https://www.michigan.gov/cra/resources/medical-marijuana" },
  { code: "MN", name: "Minnesota", status: "both", applicationUrl: "https://www.health.state.mn.us/people/cannabis/patients/index.html" },
  { code: "MS", name: "Mississippi", status: "medicinal", applicationUrl: "https://www.mmcp.ms.gov/" },
  { code: "MO", name: "Missouri", status: "both", applicationUrl: "https://cannabis.mo.gov/medical/" },
  { code: "MT", name: "Montana", status: "both", applicationUrl: "https://dphhs.mt.gov/marijuana/medicalmarijuanaprogram" },
  { code: "NE", name: "Nebraska", status: "neither", applicationUrl: null },
  { code: "NV", name: "Nevada", status: "both", applicationUrl: "https://cccp.nv.gov/Consumers/Medical/Medical_Marijuana_Patient_Cardholder_Registry/" },
  { code: "NH", name: "New Hampshire", status: "medicinal", applicationUrl: "https://www.dhhs.nh.gov/programs-services/health-care/therapeutic-cannabis-program" },
  { code: "NJ", name: "New Jersey", status: "both", applicationUrl: "https://www.nj.gov/cannabis/patients/" },
  { code: "NM", name: "New Mexico", status: "both", applicationUrl: "https://www.nmhealth.org/about/mcp/svcs/info/" },
  { code: "NY", name: "New York", status: "both", applicationUrl: "https://cannabis.ny.gov/patients" },
  { code: "NC", name: "North Carolina", status: "neither", applicationUrl: null },
  { code: "ND", name: "North Dakota", status: "medicinal", applicationUrl: "https://www.hhs.nd.gov/cannabis" },
  { code: "OH", name: "Ohio", status: "both", applicationUrl: "https://medicalmarijuana.ohio.gov/patients-caregivers" },
  { code: "OK", name: "Oklahoma", status: "medicinal", applicationUrl: "https://oklahoma.gov/omma/patients-caregivers.html" },
  { code: "OR", name: "Oregon", status: "both", applicationUrl: "https://www.oregon.gov/oha/ph/diseasesconditions/chronicdisease/medicalmarijuanaprogram/Pages/index.aspx" },
  { code: "PA", name: "Pennsylvania", status: "medicinal", applicationUrl: "https://www.pa.gov/services/health/register-for-the-medical-marijuana-program.html" },
  { code: "RI", name: "Rhode Island", status: "both", applicationUrl: "https://dbr.ri.gov/office-cannabis-regulation/medical-marijuana-program" },
  { code: "SC", name: "South Carolina", status: "neither", applicationUrl: null },
  { code: "SD", name: "South Dakota", status: "medicinal", applicationUrl: "https://medcannabis.sd.gov/" },
  { code: "TN", name: "Tennessee", status: "neither", applicationUrl: null },
  { code: "TX", name: "Texas", status: "medicinal", applicationUrl: "https://www.dps.texas.gov/section/compassionate-use-program" },
  { code: "UT", name: "Utah", status: "medicinal", applicationUrl: "https://medicalcannabis.utah.gov/patients/" },
  { code: "VT", name: "Vermont", status: "both", applicationUrl: "https://ccb.vermont.gov/registry" },
  { code: "VA", name: "Virginia", status: "both", applicationUrl: "https://www.cca.virginia.gov/patients" },
  { code: "WA", name: "Washington", status: "both", applicationUrl: "https://doh.wa.gov/you-and-your-family/marijuana-cannabis/medical-cannabis" },
  { code: "WV", name: "West Virginia", status: "medicinal", applicationUrl: "https://omc.wv.gov/Pages/Patient-Registration.aspx" },
  { code: "WI", name: "Wisconsin", status: "neither", applicationUrl: null },
  { code: "WY", name: "Wyoming", status: "neither", applicationUrl: null },
  { code: "DC", name: "District of Columbia", status: "both", applicationUrl: "https://abca.dc.gov/medicalcannabis" },
];

/** Human-readable label for each legality bucket. */
export const LEGALITY_LABEL: Record<LegalityStatus, string> = {
  both: "Recreational + Medicinal",
  recreational: "Recreational only",
  medicinal: "Medicinal only",
  neither: "Not legal",
};

/**
 * Resolve a free-text or code state input (e.g. "Colorado", "co", "CO") to its
 * legality record. Case/whitespace-insensitive. Returns null when unknown.
 */
export function findStateLegality(input: string): StateLegality | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  return (
    US_CANNABIS_LEGALITY.find(
      (s) => s.name.toLowerCase() === q || s.code.toLowerCase() === q,
    ) ?? null
  );
}
