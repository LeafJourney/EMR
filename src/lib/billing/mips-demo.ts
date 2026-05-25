/**
 * Demo MIPS dataset — synthetic patient charts used to power the clinician
 * MIPS dashboard until real Encounter / Note / Message data is wired in.
 *
 * Names are intentionally faux. The mix is tuned to give the dashboard a
 * realistic spread of "met", "not met", and "excluded" rows across all four
 * measures.
 */

import type { PatientDataset } from "./mips-calculator";

interface DemoSeed {
  name: string;
  age: number;
  conditions?: string[];
  flags?: PatientDataset["patient"]["flags"];
  postDischargeWindows?: number;
  bp?: [number, number] | null;
  /** Free-text findings that the calculator's regex sniffer will pick up. */
  noteSnippets: string[];
  messages?: string[];
  encounterCount?: number;
}

const SEED: DemoSeed[] = [
  {
    name: "Avery Holloway",
    age: 47,
    conditions: ["Hypertension (I10)", "Chronic pain"],
    bp: [128, 78],
    noteSnippets: [
      "PHQ-9 administered, score 4 (normal). Tobacco use assessed — non-user. Discussed cannabis tincture titration.",
    ],
    encounterCount: 3,
  },
  {
    name: "Maya Greenleaf",
    age: 34,
    conditions: ["Anxiety"],
    noteSnippets: [
      "Patient Health Questionnaire PHQ-2 negative. Tobacco: current smoker, pack-per-day. Cessation: offered NRT and quitline referral.",
    ],
    encounterCount: 2,
  },
  {
    name: "Jordan Ngata",
    age: 62,
    conditions: ["Hypertension (I10)", "Type 2 diabetes"],
    bp: [152, 94],
    noteSnippets: [
      "BP elevated. Counseled on lifestyle. Tobacco non-user. Depression screen PHQ-9 score 3.",
    ],
    encounterCount: 4,
  },
  {
    name: "Priya Sundaram",
    age: 71,
    conditions: ["Hypertension (I10)", "Osteoarthritis"],
    bp: [134, 82],
    postDischargeWindows: 1,
    noteSnippets: [
      "Post-discharge visit. Medication reconciliation completed and documented. PHQ-9 score 6. Tobacco non-user.",
    ],
    encounterCount: 3,
  },
  {
    name: "Theo Calloway",
    age: 28,
    conditions: ["Chronic migraine"],
    noteSnippets: [
      "Follow-up for cannabis edible regimen. Tolerance discussed.",
    ],
    encounterCount: 2,
  },
  {
    name: "Linnea Forsberg",
    age: 55,
    conditions: ["Major depressive disorder", "Hypertension (I10)"],
    flags: { activeDepression: true },
    bp: [138, 86],
    noteSnippets: [
      "Continue current SSRI. Cannabis tincture providing adjunctive relief. BP controlled.",
    ],
    encounterCount: 3,
  },
  {
    name: "Hiro Tanaka",
    age: 44,
    conditions: ["PTSD"],
    noteSnippets: [
      "PHQ-9 score 14 — positive screen. Follow-up plan documented: referral to behavioral health, safety plan reviewed.",
    ],
    messages: ["Patient declined tobacco screening this visit; will revisit next encounter."],
    encounterCount: 2,
  },
  {
    name: "Camille Okafor",
    age: 39,
    conditions: ["Endometriosis"],
    noteSnippets: [
      "PHQ-2 negative. Tobacco user, vaping — patient declined cessation discussion today.",
    ],
    encounterCount: 2,
  },
  {
    name: "Owen Whitfield",
    age: 67,
    conditions: ["Hypertension (I10)", "CKD stage 2"],
    bp: [142, 88],
    postDischargeWindows: 1,
    noteSnippets: [
      "Recent ED discharge for hypertensive urgency. Medications reconciled with patient.",
      "Depression screening PHQ-9 score 2.",
    ],
    encounterCount: 3,
  },
  {
    name: "Sofia Marchetti",
    age: 30,
    conditions: ["Generalized anxiety", "Pregnancy"],
    flags: { pregnancy: true },
    bp: [118, 74],
    noteSnippets: [
      "Pregnancy in 2nd trimester. PHQ-9 score 5. Tobacco non-user.",
    ],
    encounterCount: 2,
  },
  {
    name: "Darnell Hayes",
    age: 58,
    conditions: ["Hypertension (I10)", "Chronic back pain"],
    bp: [136, 84],
    noteSnippets: [
      "BP controlled on losartan + lifestyle. Tobacco former smoker, quit 3 years ago. PHQ-9 score 1.",
    ],
    encounterCount: 4,
  },
  {
    name: "Ines Vargas",
    age: 49,
    conditions: ["Fibromyalgia", "Hypertension (I10)"],
    bp: [148, 92],
    noteSnippets: [
      "BP uncontrolled. Discussed med adherence. Cannabis topical for myalgia.",
    ],
    encounterCount: 3,
  },
  {
    name: "Kai Nakamura",
    age: 22,
    noteSnippets: [
      "First visit. Patient Health Questionnaire PHQ-2 negative. Tobacco: vaping — cessation counseling offered, set quit date.",
    ],
    encounterCount: 2,
  },
  {
    name: "Eloise Tremblay",
    age: 84,
    conditions: ["Hypertension (I10)", "Dementia"],
    flags: { hospice: true, limitedLifeExpectancy: true },
    bp: [144, 88],
    postDischargeWindows: 1,
    noteSnippets: [
      "Comfort-focused care. Family discussion held. Cannabis tincture for agitation.",
    ],
    encounterCount: 2,
  },
  {
    name: "Marcus Holloway",
    age: 41,
    noteSnippets: [
      "Routine follow-up. Cannabis flower for chronic insomnia working well.",
    ],
    encounterCount: 2,
  },
  {
    name: "Yuki Sato",
    age: 36,
    conditions: ["Bipolar II disorder"],
    flags: { bipolar: true },
    noteSnippets: [
      "Mood stable. Tobacco non-user. Continue cannabinoid co-therapy with psychiatrist coordination.",
    ],
    encounterCount: 3,
  },
  {
    name: "Rashid Patel",
    age: 53,
    conditions: ["Hypertension (I10)"],
    bp: [132, 80],
    noteSnippets: [
      "BP controlled. Smoker, declined cessation today. PHQ-9 score 8.",
    ],
    encounterCount: 3,
  },
  {
    name: "Greta Lindqvist",
    age: 60,
    conditions: ["Hypertension (I10)", "Hypothyroid"],
    bp: [130, 78],
    postDischargeWindows: 1,
    noteSnippets: [
      "Hospital discharge follow-up; medication reconciliation performed. PHQ-9 score 0. Tobacco non-user.",
    ],
    encounterCount: 3,
  },
];

function patientDataset(seed: DemoSeed, index: number): PatientDataset {
  const id = `demo-pt-${index + 1}`;
  const today = new Date();
  const dateAt = (daysAgo: number) =>
    new Date(today.getTime() - daysAgo * 86_400_000).toISOString();

  const encounterCount = seed.encounterCount ?? 1;
  const encounters = Array.from({ length: encounterCount }, (_, i) => ({
    id: `${id}-enc-${i + 1}`,
    patientId: id,
    date: dateAt(15 + i * 32),
    type: i === 0 && seed.postDischargeWindows ? "discharge_follow_up" : "office_visit",
    systolic: i === 0 && seed.bp ? seed.bp[0] : undefined,
    diastolic: i === 0 && seed.bp ? seed.bp[1] : undefined,
  }));

  const notes = seed.noteSnippets.map((content, i) => ({
    id: `${id}-note-${i + 1}`,
    patientId: id,
    encounterId: encounters[Math.min(i, encounters.length - 1)]?.id,
    date: dateAt(15 + i * 32),
    content,
  }));

  const messages = (seed.messages ?? []).map((body, i) => ({
    id: `${id}-msg-${i + 1}`,
    patientId: id,
    date: dateAt(5 + i * 3),
    body,
    direction: "in" as const,
  }));

  return {
    patient: {
      id,
      age: seed.age,
      displayName: seed.name,
      conditions: seed.conditions,
      flags: seed.flags,
      postDischargeWindows: seed.postDischargeWindows,
    },
    encounters,
    notes,
    messages,
  };
}

export function buildDemoMipsDataset(): PatientDataset[] {
  return SEED.map(patientDataset);
}
