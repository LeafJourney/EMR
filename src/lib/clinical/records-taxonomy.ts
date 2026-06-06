/**
 * EMR-862 / EMR-864 / EMR-865 — Records section taxonomy
 *
 * Dr. Patel reorganized the chart's "Records" area into a fixed set of
 * subtabs (Calculator, Consults, Images, Cardiology, Legal, Ancillary,
 * Disability, Procedures, My Notes, Insurance, E-signed). Each subtab carries
 * a palette of color-coded "tertiary" labels — the little bubbles a clinician
 * taps to file a document into a sub-bucket (e.g. a Consults doc tagged
 * "oncology" gets a green bubble, "neurology" blue, "dermatology" purple).
 *
 * EMR-865 / EMR-902 additionally break the Images subtab down by imaging
 * modality and body part, and expose the cardiology study list. Color classes
 * are raw Tailwind bubble strings so the UI can render them directly.
 *
 * Pure data only — no React, no project imports.
 */

export interface TertiaryLabel {
  key: string;
  label: string;
  /** tailwind bubble classes, e.g. "bg-green-100 text-green-800 border-green-300" */
  colorClass: string;
}

export interface RecordSubtab {
  key: string; // "consults"
  label: string; // "Consults"
  emoji: string;
  description: string;
  tertiaryLabels: TertiaryLabel[];
}

// Reusable Tailwind bubble palettes.
const GREEN = "bg-green-100 text-green-800 border-green-300";
const BLUE = "bg-blue-100 text-blue-800 border-blue-300";
const PURPLE = "bg-purple-100 text-purple-800 border-purple-300";
const AMBER = "bg-amber-100 text-amber-800 border-amber-300";
const ROSE = "bg-rose-100 text-rose-800 border-rose-300";
const CYAN = "bg-cyan-100 text-cyan-800 border-cyan-300";
const TEAL = "bg-teal-100 text-teal-800 border-teal-300";
const SLATE = "bg-slate-100 text-slate-800 border-slate-300";
const INDIGO = "bg-indigo-100 text-indigo-800 border-indigo-300";
const BROWN = "bg-amber-100 text-amber-900 border-amber-400";

const t = (key: string, label: string, colorClass: string): TertiaryLabel => ({
  key,
  label,
  colorClass,
});

export const RECORD_SUBTABS: readonly RecordSubtab[] = [
  {
    key: "calculator",
    label: "Calculator",
    emoji: "🧮",
    description: "Clinical calculators and risk scores.",
    tertiaryLabels: [
      t("mdcalc", "MDCalc", BLUE),
      t("acs-risk", "ACS Risk", ROSE),
      t("medscape", "Medscape", TEAL),
      t("ascvd", "ASCVD", AMBER),
      t("framingham", "Framingham", INDIGO),
    ],
  },
  {
    key: "consults",
    label: "Consults",
    emoji: "🩺",
    description: "Specialist consult notes filed by specialty.",
    tertiaryLabels: [
      t("nephrology", "Nephrology", CYAN),
      t("urology", "Urology", TEAL),
      t("cardiology", "Cardiology", ROSE),
      t("hematology", "Hematology", AMBER),
      t("rheumatology", "Rheumatology", INDIGO),
      t("orthopedic-surgery", "Orthopedic Surgery", SLATE),
      t("pain-management", "Pain Management", ROSE),
      t("gastroenterology", "Gastroenterology", AMBER),
      t("ent", "ENT", TEAL),
      // Dr. Patel's fixed colors:
      t("neurology", "Neurology", BLUE),
      t("dermatology", "Dermatology", PURPLE),
      t("oncology", "Oncology", GREEN),
    ],
  },
  {
    key: "images",
    label: "Images",
    emoji: "🖼️",
    description: "Radiology and imaging studies by modality.",
    tertiaryLabels: [
      // Dr. Patel: CT green, MRI blue.
      t("ct", "CT", GREEN),
      t("pet", "PET", AMBER),
      t("mri", "MRI", BLUE),
      t("ultrasound", "Ultrasound", CYAN),
      t("dexa", "DEXA", SLATE),
      t("mammogram", "Mammogram", ROSE),
      t("mra", "MRA", INDIGO),
      t("ct-angio", "CT Angio", TEAL),
    ],
  },
  {
    key: "cardiology",
    label: "Cardiology",
    emoji: "🫀",
    description: "Cardiac studies and rhythm monitoring.",
    tertiaryLabels: [
      t("angiogram", "Angiogram", ROSE),
      t("ekg", "EKG", BLUE),
      t("echocardiogram", "Echocardiogram", TEAL),
      t("stress-test", "Stress Test", AMBER),
      t("coronary-calcifications", "Coronary Calcifications", SLATE),
      t("holter-monitor", "Holter Monitor", INDIGO),
    ],
  },
  {
    key: "legal",
    label: "Legal",
    emoji: "⚖️",
    description: "Advance directives and legal documents.",
    tertiaryLabels: [
      t("advanced-directive", "Advanced Directive", SLATE),
      t("hipaa", "HIPAA", BLUE),
      t("medical-record-request", "Medical Record Request", CYAN),
      t("living-will", "Living Will", INDIGO),
      t("poa", "POA", AMBER),
      t("polst", "POLST", ROSE),
      t("informed-consent", "Informed Consent", TEAL),
    ],
  },
  {
    key: "ancillary",
    label: "Ancillary",
    emoji: "🤝",
    description: "Ancillary and support service documentation.",
    tertiaryLabels: [
      t("speech-therapy", "Speech Therapy", BLUE),
      t("occupational-therapy", "Occupational Therapy", TEAL),
      t("physical-therapy", "Physical Therapy", GREEN),
      t("case-management", "Case Management", AMBER),
      t("social-work", "Social Work", ROSE),
      t("nutrition-dietician", "Nutrition / Dietician", CYAN),
      t("respiratory", "Respiratory", INDIGO),
      t("wound-care", "Wound Care", PURPLE),
      t("pharmacy", "Pharmacy", SLATE),
      t("spiritual", "Spiritual", AMBER),
    ],
  },
  {
    key: "disability",
    label: "Disability Documents",
    emoji: "♿",
    description: "Disability, leave, and accommodation paperwork.",
    tertiaryLabels: [
      t("state-disability", "State Disability", BLUE),
      t("edd", "EDD", CYAN),
      t("handicap-parking", "Handicap Parking", INDIGO),
      t("fmla", "FMLA", AMBER),
      t("workers-comp", "Workers Comp", ROSE),
      t("ada", "ADA", TEAL),
      t("esa", "ESA", GREEN),
    ],
  },
  {
    key: "procedures",
    label: "Procedures",
    emoji: "🔬",
    description: "In-office and outpatient procedure records.",
    tertiaryLabels: [
      // Dr. Patel: EGD green, colonoscopy brown.
      t("egd", "EGD", GREEN),
      t("colonoscopy", "Colonoscopy", BROWN),
      t("balance-test", "Balance Test", SLATE),
      t("peripheral-blood-flow", "Peripheral Blood Flow", ROSE),
      t("pap-smear", "Pap Smear", PURPLE),
      t("iud", "IUD", PURPLE),
      t("skin-biopsy", "Skin Biopsy", AMBER),
      t("cryotherapy", "Cryotherapy", CYAN),
      t("joint-injection", "Joint Injection", INDIGO),
      t("splinting", "Splinting", SLATE),
      t("ear-cerumen-disimpaction", "Ear Cerumen Disimpaction", TEAL),
      t("nexplanon", "Nexplanon", PURPLE),
    ],
  },
  {
    key: "my-notes",
    label: "My Notes",
    emoji: "📝",
    description: "Provider notes and visit documentation.",
    tertiaryLabels: [
      t("orders", "Orders", AMBER),
      t("progress-note", "Progress Note", BLUE),
      t("history-and-physical", "History and Physical", INDIGO),
      t("same-day-visit", "Same Day Visit", TEAL),
      t("annual-wellness-visit", "Annual Wellness Visit", GREEN),
      t("urgent-care-visit", "Urgent Care Visit", ROSE),
    ],
  },
  {
    key: "insurance",
    label: "Insurance",
    emoji: "🛡️",
    description: "Coverage, authorization, and benefits documents.",
    tertiaryLabels: [
      t("scanned-insurance-cards", "Scanned Insurance Cards", BLUE),
      t("coordination-of-benefits", "Coordination of Benefits", CYAN),
      t("prior-authorization-approvals", "Prior Authorization Approvals", GREEN),
      t("referral-forms", "Referral Forms", TEAL),
      t("abn", "ABN", AMBER),
      t("aob", "AOB", AMBER),
      t("eob", "EOB", INDIGO),
      t("medical-necessity-appeal-letter", "Medical Necessity Appeal Letter", ROSE),
      t("peer-to-peer-review-logs", "Peer-to-Peer Review Logs", SLATE),
      t("real-time-eligibility-logs", "Real-Time Eligibility Logs", PURPLE),
    ],
  },
  {
    key: "e-signed",
    label: "E-signed",
    emoji: "✍️",
    description: "Electronically signed acknowledgements and overrides.",
    tertiaryLabels: [
      t("medication-overrides", "Medication Overrides", ROSE),
      t("warning-acknowledgements", "Warning Acknowledgements", AMBER),
      t("cures", "CURES", BLUE),
      t("controlled-substance-checks", "Controlled Substance Checks", INDIGO),
    ],
  },
];

// ---------------------------------------------------------------------------
// EMR-865 / EMR-902 — Images subtab: modality → body parts
// ---------------------------------------------------------------------------

export interface ImagingModality {
  key: string;
  label: string;
  bodyParts: string[];
  colorClass: string;
}

export const IMAGING_MODALITIES: readonly ImagingModality[] = [
  { key: "ct", label: "CT", bodyParts: ["chest", "abdomen/pelvis", "head"], colorClass: GREEN },
  { key: "pet", label: "PET", bodyParts: [], colorClass: AMBER },
  { key: "mri", label: "MRI", bodyParts: ["lumbar spine", "brain", "hip"], colorClass: BLUE },
  { key: "ultrasound", label: "Ultrasound", bodyParts: ["abdomen", "renal", "pelvic"], colorClass: CYAN },
  { key: "dexa", label: "DEXA", bodyParts: [], colorClass: SLATE },
  { key: "mammogram", label: "Mammogram", bodyParts: [], colorClass: ROSE },
  { key: "mra", label: "MRA", bodyParts: ["brain", "carotid"], colorClass: INDIGO },
  { key: "ct-angio", label: "CT Angio", bodyParts: ["chest", "aorta"], colorClass: TEAL },
];

export const CARDIOLOGY_STUDIES: readonly { key: string; label: string }[] = [
  { key: "angiogram", label: "Angiogram" },
  { key: "ekg", label: "EKG" },
  { key: "echocardiogram", label: "Echocardiogram" },
  { key: "stress-test", label: "Stress Test" },
  { key: "coronary-calcifications", label: "Coronary Calcifications" },
  { key: "holter-monitor", label: "Holter Monitor" },
];
