// Native AI Scribe templates — EMR-782
// Heidi AI-style template library: each template defines a clinical
// document shape (sections, ordering, tone hints) plus a mock
// transcript + structured summary so the recorder can demo the
// experience end-to-end without a live model call.

import type { NoteBlockType } from "./notes";

// ── Template + tone identifiers ──────────────────────────────────

export type ScribeTemplateId =
  | "soap"
  | "hp"
  | "specialist_consult"
  | "progress_note"
  | "mental_health"
  | "cannabis_followup"
  | "discharge_summary";

export type ScribeToneId =
  | "clinical"
  | "conversational"
  | "plain_language"
  | "narrative";

export type ScribeSummaryStyleId =
  | "structured"
  | "narrative"
  | "patient_friendly"
  | "bullet";

// ── Template definition ──────────────────────────────────────────

export interface ScribeTemplate {
  id: ScribeTemplateId;
  label: string;
  shortLabel: string;
  description: string;
  /** Display order of section blocks in the resulting note. */
  sectionOrder: NoteBlockType[];
  /** Section-specific phrasing the model should use. */
  sectionGuidance: Partial<Record<NoteBlockType, string>>;
  /** Header rendered above the structured note for this format. */
  documentHeader: string;
  /** Mock structured summary used when no model is wired up. */
  mockSummary: Record<NoteBlockType, string>;
  /** Suggested default tone for this template. */
  defaultTone: ScribeToneId;
  /** Optional accent emoji for the picker. */
  glyph: string;
}

export interface ScribeTone {
  id: ScribeToneId;
  label: string;
  description: string;
  /** Direction the model should follow when phrasing the note. */
  instruction: string;
}

export interface ScribeSummaryStyle {
  id: ScribeSummaryStyleId;
  label: string;
  description: string;
  instruction: string;
}

// ── Tones ────────────────────────────────────────────────────────

export const SCRIBE_TONES: ScribeTone[] = [
  {
    id: "clinical",
    label: "Clinical",
    description: "Concise medical language with standard abbreviations.",
    instruction:
      "Use crisp clinical language. Prefer medical terminology, short declarative sentences, and standard abbreviations (BP, HR, SOB, c/o, w/o).",
  },
  {
    id: "conversational",
    label: "Conversational",
    description: "Approachable wording, longer sentences, light formality.",
    instruction:
      "Write in an approachable but still professional voice. Use complete sentences and avoid heavy abbreviation. Suitable for shared visits with care partners.",
  },
  {
    id: "plain_language",
    label: "Plain language",
    description: "Patient-friendly, 6th-grade reading level.",
    instruction:
      "Translate medical jargon into plain language at roughly a 6th-grade reading level. Avoid abbreviations. This output may be shared with the patient.",
  },
  {
    id: "narrative",
    label: "Narrative",
    description: "Story-style prose suitable for consult letters.",
    instruction:
      "Write the note as flowing narrative paragraphs that read like a referral letter. Maintain clinical accuracy without bulleted lists.",
  },
];

// ── Summary styles ───────────────────────────────────────────────

export const SCRIBE_SUMMARY_STYLES: ScribeSummaryStyle[] = [
  {
    id: "structured",
    label: "Structured",
    description: "Section headers with short paragraphs underneath.",
    instruction:
      "Render each section as a heading followed by a short paragraph (2-4 sentences).",
  },
  {
    id: "bullet",
    label: "Bulleted",
    description: "Dense bullet points for quick scanning.",
    instruction:
      "Render each section as a tight bulleted list. Each bullet should be one fact, one decision, or one observation.",
  },
  {
    id: "narrative",
    label: "Narrative",
    description: "Continuous prose with section transitions.",
    instruction:
      "Render the entire note as continuous prose. Use transition sentences between sections rather than headings.",
  },
  {
    id: "patient_friendly",
    label: "Patient-friendly",
    description: "Reading-level adjusted with a 'what this means' coda.",
    instruction:
      "Render each section in patient-friendly language and append a short 'What this means for you' line summarizing next steps the patient can act on.",
  },
];

// ── Templates ────────────────────────────────────────────────────

export const SCRIBE_TEMPLATES: ScribeTemplate[] = [
  {
    id: "soap",
    label: "SOAP Note",
    shortLabel: "SOAP",
    description: "Classic Subjective/Objective/Assessment/Plan documentation.",
    sectionOrder: ["summary", "findings", "assessment", "plan", "followUp"],
    documentHeader: "SOAP Note",
    defaultTone: "clinical",
    glyph: "🩺",
    sectionGuidance: {
      summary:
        "Capture chief complaint, HPI, and the patient's subjective report verbatim where useful.",
      findings:
        "List objective findings: vitals, exam, current meds, cannabis products and doses, labs.",
      assessment:
        "Provide a clinical impression with differential and supporting reasoning.",
      plan:
        "Itemize the treatment plan: medication/cannabis adjustments, labs ordered, patient education.",
      followUp:
        "State the follow-up interval, pending tasks, and red-flag instructions.",
    },
    mockSummary: {
      summary:
        "42 y/o patient returning for routine follow-up of chronic pain and insomnia, both managed with cannabis tincture. Reports overall improvement since last visit.",
      findings:
        "Vitals stable (per home log). Current regimen: 15mg CBD / 5mg THC tincture AM; 10mg CBD / 10mg THC PM. No new medications. Mild dry mouth, no other AEs.",
      assessment:
        "1) Chronic pain — well controlled (pain score 3-4/10, down from 7). 2) Insomnia — substantially improved (sleep onset <30 min). 3) Cannabis-associated xerostomia — mild, tolerable.",
      plan:
        "• Continue current cannabis tincture regimen at same dosing.\n• Encourage hydration for xerostomia.\n• Continue daily walking program.\n• No medication changes today.",
      followUp:
        "Return in 4 weeks. Patient to log any new side effects or breakthrough pain in the patient app.",
    },
  },
  {
    id: "hp",
    label: "History & Physical",
    shortLabel: "H&P",
    description: "Comprehensive intake with HPI, ROS, PMH, exam.",
    sectionOrder: ["summary", "findings", "assessment", "plan", "followUp"],
    documentHeader: "History & Physical",
    defaultTone: "clinical",
    glyph: "📋",
    sectionGuidance: {
      summary:
        "Include CC, HPI (OLDCARTS), pertinent ROS positives/negatives, PMH, PSH, FH, SH, allergies, current meds.",
      findings:
        "Document a focused physical exam by system. Include relevant cannabis usage history (years, products, route, frequency).",
      assessment:
        "Provide a numbered problem list with prioritized differential diagnoses for each.",
      plan:
        "For each problem: diagnostic workup, therapeutic interventions, patient education, and disposition.",
      followUp:
        "Outline follow-up cadence, referrals, and explicit return precautions.",
    },
    mockSummary: {
      summary:
        "CC: Chronic low back pain. HPI: 42 y/o with 5-year history of axial LBP, worsened over last 6 months. ROS: + insomnia, + intermittent anxiety. PMH: HTN, GERD. SH: Daily cannabis user x 2 years for pain/sleep. NKDA.",
      findings:
        "GEN: alert, well-appearing. MSK: paraspinal tenderness L4-L5, no radiculopathy. NEURO: intact strength/sensation LE. Cannabis hx: tincture preferred route, no inhaled use, no concurrent alcohol.",
      assessment:
        "1) Chronic mechanical low back pain — likely facet-mediated. 2) Comorbid insomnia — secondary to pain, partial response to PM cannabis. 3) Cannabis use for therapeutic purposes — appropriate, no signs of misuse.",
      plan:
        "1) Continue cannabis tincture; titrate THC up by 2.5mg if PM pain persists.\n2) PT referral for core stabilization.\n3) Consider lumbar X-ray if no improvement in 6 weeks.\n4) Sleep hygiene handout provided.",
      followUp:
        "Follow up in 6 weeks. Return sooner for new neurologic symptoms, bowel/bladder changes, or escalating pain.",
    },
  },
  {
    id: "specialist_consult",
    label: "Specialist Consult",
    shortLabel: "Consult",
    description: "Referral letter format addressed to the requesting provider.",
    sectionOrder: ["summary", "findings", "assessment", "plan", "followUp"],
    documentHeader: "Specialist Consultation",
    defaultTone: "narrative",
    glyph: "✉️",
    sectionGuidance: {
      summary:
        "Open with: 'Thank you for referring this patient...' Summarize the reason for consultation and pertinent history.",
      findings:
        "Describe relevant examination, prior workup reviewed, and current cannabis therapeutic regimen.",
      assessment:
        "State the consultant impression in narrative form, addressing the specific question posed by the referring provider.",
      plan:
        "Outline recommendations directly to the referring provider. Use 'I recommend...' phrasing.",
      followUp:
        "Indicate willingness to see the patient again and timeline for any planned re-evaluation.",
    },
    mockSummary: {
      summary:
        "Thank you for referring this 42-year-old patient for consultation regarding cannabis-based management of refractory chronic pain. The patient was seen today for an initial cannabis medicine evaluation.",
      findings:
        "On review, the patient has a 5-year history of chronic LBP refractory to NSAIDs, PT, and gabapentin. Cannabis-naive at time of referral. No history of substance use disorder, no significant cardiopulmonary disease.",
      assessment:
        "The patient is an appropriate candidate for cannabis-based pain management. Risk-benefit profile favors initiation given documented failure of conventional analgesics and absence of contraindications.",
      plan:
        "I recommend initiating a low-dose CBD-predominant tincture (10mg CBD / 2.5mg THC sublingually BID), with planned titration over 4 weeks. Patient education on safe storage, driving precautions, and AE reporting has been provided.",
      followUp:
        "I will see the patient again in 4 weeks for titration assessment. Please feel free to contact me with any interim questions.",
    },
  },
  {
    id: "progress_note",
    label: "Progress Note",
    shortLabel: "Progress",
    description: "Short interval note focused on changes since last visit.",
    sectionOrder: ["summary", "assessment", "plan", "followUp"],
    documentHeader: "Progress Note",
    defaultTone: "clinical",
    glyph: "📈",
    sectionGuidance: {
      summary:
        "Brief: interval changes since last visit. What got better, what got worse, adherence.",
      assessment:
        "One-line per active problem with current status (stable / improved / worsening).",
      plan:
        "Only the changes from prior plan. Note continued items in a single line.",
      followUp:
        "Next visit interval and any patient-side actions.",
    },
    mockSummary: {
      summary:
        "Interval: 4 weeks since last visit. Adherence: full. Pain improved from 5/10 to 3/10. Sleep onset latency reduced from 60 min to <30 min. No new AEs.",
      findings: "(Not used in this template — see Progress section.)",
      assessment:
        "1) Chronic pain — improved.\n2) Insomnia — improved.\n3) Cannabis regimen — well tolerated.",
      plan:
        "Continue current regimen unchanged. Continue daily activity log in patient app.",
      followUp: "Return in 8 weeks for next interval review.",
    },
  },
  {
    id: "mental_health",
    label: "Mental Health Note",
    shortLabel: "Mental Health",
    description: "Includes mental status exam, mood/affect, safety assessment.",
    sectionOrder: ["summary", "findings", "assessment", "plan", "followUp"],
    documentHeader: "Mental Health Visit",
    defaultTone: "conversational",
    glyph: "🧠",
    sectionGuidance: {
      summary:
        "Capture mood in patient's own words. Note sleep, appetite, energy, anhedonia, concentration.",
      findings:
        "Mental Status Exam: appearance, behavior, speech, mood, affect, thought process/content, perception, cognition, insight, judgment. Explicit safety assessment (SI/HI).",
      assessment:
        "DSM-5-TR formulation. Address response to cannabis-based therapy where relevant.",
      plan:
        "Therapeutic interventions, medication/cannabis adjustments, therapy referrals, safety planning.",
      followUp:
        "Next contact interval. Explicit crisis instructions (988, ED).",
    },
    mockSummary: {
      summary:
        "Patient reports mood as '6 out of 10, better than last month.' Sleep improved with PM cannabis dose. Appetite preserved. Energy adequate. No anhedonia.",
      findings:
        "MSE: well-groomed, cooperative; speech normal rate/rhythm; mood 'okay'; affect congruent; thought process linear; no SI/HI/AVH; insight/judgment intact. Safety screen negative.",
      assessment:
        "Generalized anxiety disorder, improved on current CBD-predominant regimen. No evidence of cannabis use disorder. Safety risk low.",
      plan:
        "Continue current CBD tincture. Recommend continuation of weekly CBT. No medication changes today. Provided crisis resources (988, local crisis line).",
      followUp:
        "Return in 4 weeks. If acute worsening, call clinic or dial 988 / present to ED.",
    },
  },
  {
    id: "cannabis_followup",
    label: "Cannabis Therapy Follow-up",
    shortLabel: "Cannabis F/U",
    description:
      "LeafJourney-specific template emphasizing product, dose, outcome scales.",
    sectionOrder: ["summary", "findings", "assessment", "plan", "followUp"],
    documentHeader: "Cannabis Therapy Follow-up",
    defaultTone: "conversational",
    glyph: "🌿",
    sectionGuidance: {
      summary:
        "Patient-reported outcome scales (pain, sleep, anxiety, mood — 1-10) and emoji check-ins since last visit.",
      findings:
        "Per-product log: product name, dose, route, frequency, perceived efficacy, side effects. Include any new products tried.",
      assessment:
        "Cannabis treatment efficacy for each targeted condition. Note any signals for product or dose adjustment.",
      plan:
        "Per-product adjustments (continue / titrate / discontinue / swap). Patient education on dose timing and storage.",
      followUp:
        "Next outcome log review date. Reinforce per-dose check-in in patient app.",
    },
    mockSummary: {
      summary:
        "Outcome scales (last 4 weeks): Pain 3/10 (↓ from 7), Sleep 8/10 (↑ from 4), Anxiety 4/10 (↓ from 6), Mood 7/10 (↑ from 5). Post-dose emoji check-ins: 78% 😊, 19% 😐, 3% 😟.",
      findings:
        "PRODUCT 1 — CBD:THC 3:1 tincture, 0.5mL AM. Efficacy 8/10 for daytime pain. No AEs.\nPRODUCT 2 — CBD:THC 1:1 tincture, 0.5mL PM. Efficacy 9/10 for sleep onset. Mild dry mouth.",
      assessment:
        "Excellent response to current dual-product regimen. Per-product efficacy supports continuation. Xerostomia is mild and outweighed by sleep benefit.",
      plan:
        "• Continue PRODUCT 1 unchanged.\n• Continue PRODUCT 2; add hydration reminder for xerostomia.\n• No new products today.\n• Continue daily post-dose emoji check-in.",
      followUp:
        "Outcome log review in 4 weeks. Patient to flag any product changes in the app.",
    },
  },
  {
    id: "discharge_summary",
    label: "Discharge Summary",
    shortLabel: "Discharge",
    description: "Encounter wrap-up with disposition and home instructions.",
    sectionOrder: ["summary", "findings", "assessment", "plan", "followUp"],
    documentHeader: "Discharge Summary",
    defaultTone: "plain_language",
    glyph: "🏠",
    sectionGuidance: {
      summary:
        "Reason for visit and brief course summary in plain language.",
      findings:
        "Key findings, treatments delivered, and the patient's response.",
      assessment:
        "Final diagnosis in plain language with brief 'what this means' line.",
      plan:
        "Home instructions: medications, cannabis dosing, activity, diet, warning signs. Use numbered list.",
      followUp:
        "When and where to follow up. Explicit reasons to return sooner.",
    },
    mockSummary: {
      summary:
        "You came in today for a check-up on your back pain and sleep. Things are going well overall.",
      findings:
        "Your pain score is now 3 out of 10 (down from 7). You're sleeping better with the evening cannabis dose. Your only side effect is mild dry mouth.",
      assessment:
        "Your chronic back pain and sleep problems are responding well to your current treatment. This means we can keep things the same for now.",
      plan:
        "1) Keep taking your morning and evening cannabis tincture as before.\n2) Drink more water during the day to help with dry mouth.\n3) Keep walking daily.\n4) Log any new symptoms in the patient app.",
      followUp:
        "Come back in 4 weeks for your next check-in. Call sooner if you have new numbness, weakness, or pain that won't go away.",
    },
  },
];

// ── Lookups ──────────────────────────────────────────────────────

export function findTemplate(id: ScribeTemplateId | string): ScribeTemplate {
  return (
    SCRIBE_TEMPLATES.find((t) => t.id === id) ?? SCRIBE_TEMPLATES[0]
  );
}

export function findTone(id: ScribeToneId | string): ScribeTone {
  return SCRIBE_TONES.find((t) => t.id === id) ?? SCRIBE_TONES[0];
}

export function findSummaryStyle(
  id: ScribeSummaryStyleId | string,
): ScribeSummaryStyle {
  return (
    SCRIBE_SUMMARY_STYLES.find((s) => s.id === id) ?? SCRIBE_SUMMARY_STYLES[0]
  );
}

// ── Mock transcripts (used as quick demo seeds) ──────────────────

/**
 * Per-template mock visit transcripts. Useful for demo flows where
 * the clinician wants to preview a template without recording, and
 * as test fixtures for the extraction pipeline.
 */
export const MOCK_TRANSCRIPTS: Record<ScribeTemplateId, string> = {
  soap: `[00:00] Dr: How have things been since we adjusted the tincture?
[00:08] Pt: Honestly, much better. Pain is down to a 3 out of 10 most days.
[00:14] Dr: And sleep?
[00:16] Pt: Falling asleep in about 30 minutes now. Used to take over an hour.
[00:22] Dr: Any side effects?
[00:24] Pt: Just a little dry mouth in the morning. Nothing bad.`,
  hp: `[00:00] Dr: Walk me through the history of your back pain.
[00:05] Pt: It started about five years ago after I fell off a ladder. Got worse in the last six months.
[00:14] Dr: What have you tried?
[00:16] Pt: Ibuprofen, then physical therapy, then a nerve medicine. None really helped.
[00:25] Dr: Any numbness or weakness in the legs?
[00:28] Pt: No, just the back itself.
[00:31] Dr: Other medical conditions?
[00:33] Pt: Blood pressure, and acid reflux. No allergies.`,
  specialist_consult: `[00:00] Dr: I see your primary care sent you over to discuss cannabis for your pain.
[00:08] Pt: Yes, they said you specialize in this.
[00:11] Dr: That's right. Tell me what you've already tried.
[00:14] Pt: NSAIDs, PT, gabapentin. None really worked.
[00:22] Dr: Any history of substance use issues?
[00:25] Pt: No, never.
[00:27] Dr: Heart or lung problems?
[00:29] Pt: No, healthy otherwise.`,
  progress_note: `[00:00] Dr: How are things since last visit?
[00:04] Pt: Pain is better, down from a 5 to a 3.
[00:08] Dr: And the sleep?
[00:10] Pt: Falling asleep faster, under 30 minutes now.
[00:15] Dr: Any new side effects?
[00:17] Pt: No, nothing new.`,
  mental_health: `[00:00] Dr: How would you rate your mood today, 1 to 10?
[00:05] Pt: About a 6. Better than last month.
[00:09] Dr: How's sleep, appetite, energy?
[00:12] Pt: Sleep is great with the evening dose. Eating normally. Energy is okay.
[00:21] Dr: Any thoughts of hurting yourself or anyone else?
[00:24] Pt: No, none.
[00:26] Dr: How is therapy going?
[00:28] Pt: Weekly sessions are helping.`,
  cannabis_followup: `[00:00] Dr: Let's go through your outcome scales for the last month.
[00:05] Pt: Pain dropped from 7 to 3. Sleep went from 4 to 8. Anxiety is down to a 4.
[00:18] Dr: And the post-dose check-ins in the app?
[00:21] Pt: Mostly happy faces, maybe one or two neutral.
[00:26] Dr: How did each product feel?
[00:28] Pt: The morning 3-to-1 tincture is great for daytime. The evening 1-to-1 is amazing for sleep.
[00:38] Dr: Any side effects with either?
[00:40] Pt: Just dry mouth from the evening one.`,
  discharge_summary: `[00:00] Dr: We're going to send you home with the same plan as before.
[00:05] Pt: Okay. Anything I need to watch for?
[00:08] Dr: Call us if you get new numbness, weakness, or pain that doesn't quit.
[00:14] Pt: Got it.
[00:15] Dr: Drink more water for the dry mouth, and keep walking each day.
[00:21] Pt: When do I come back?
[00:23] Dr: Four weeks.`,
};
