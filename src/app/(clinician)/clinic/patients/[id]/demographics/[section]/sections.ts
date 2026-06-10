// Shared section/field definitions for the demographics detail pages
// (EMR-848 / EMR-850, persistence added in EMR-1109). The page renders
// from this map and the server action validates against it, so the two
// can never drift.

export interface SectionFieldDef {
  key: string;
  label: string;
  placeholder?: string;
}

export interface SectionDef {
  title: string;
  fields: SectionFieldDef[];
}

export const SECTIONS: Record<string, SectionDef> = {
  identity: {
    title: "Identity",
    fields: [
      { key: "ssn", label: "Social Security Number", placeholder: "XXX-XX-XXXX" },
      { key: "preferredName", label: "Preferred name" },
      { key: "pronouns", label: "Pronouns" },
      { key: "languages", label: "Preferred language(s)" },
    ],
  },
  contact: {
    title: "Contact",
    fields: [
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "address", label: "Address" },
      { key: "emergencyName", label: "Emergency contact name" },
      { key: "emergencyNumber", label: "Emergency contact number" },
      { key: "emergencyEmail", label: "Emergency contact email" },
    ],
  },
  insurance: {
    title: "Insurance",
    fields: [
      { key: "planName", label: "Plan name" },
      { key: "memberId", label: "Member ID" },
      { key: "groupNumber", label: "Group number" },
      { key: "coordinationOfBenefits", label: "Coordination of benefits" },
    ],
  },
};

/**
 * Fields whose canonical home is OUTSIDE the demographicsDetail blob.
 * On save they are mirrored through to that canonical store (Patient
 * columns / intakeAnswers.insurance); on read the canonical value wins
 * so the detail page can never show stale data next to the chart's
 * inline-edit card, which writes to the same canonical fields.
 */
export const MIRRORED_KEYS: Record<string, readonly string[]> = {
  contact: ["phone", "email"],
  insurance: ["planName", "memberId", "groupNumber"],
};
