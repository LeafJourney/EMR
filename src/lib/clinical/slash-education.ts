// SAFE: dead-export-allowed reason="Slash command education helper for EMR-703"

/**
 * EMR-703 — Slash-command patient-education library.
 *
 * Engine: any `/<topic>` typed in the Plan or Education section of note
 * authoring expands to a pre-written patient-education block. Content lives
 * here so new topics can be added without code changes (data, not control
 * flow). A `stretch exercises` modifier renders a per-region exercise list.
 *
 * Seed content from Dr. Patel's Maya Reyes fixture is verbatim — DO NOT
 * paraphrase or wordsmith. The verbatim text is the acceptance gate.
 */

export interface SlashEducationEntry {
  topic: string;
  /** The verbatim block injected when the slash command fires. */
  body: string;
}

export interface SlashStretchEntry {
  /** Body region, lower-cased. */
  region: string;
  /** ~5 simple at-home stretches. */
  stretches: string[];
}

// ---------------------------------------------------------------------------
// Seed content — verbatim from doc1 SOAP exemplar (EMR-703 acceptance).
// ---------------------------------------------------------------------------

const SEED_TOPICS: SlashEducationEntry[] = [
  {
    topic: "blood pressure",
    body:
      "Advised to check BPs at home at least 3-4x/week ideally twice daily, randomly with proper technique including keeping feet planted on floor / cuff at level of heart / legs uncrossed, emptying out bladder before checking, using proper cuff size and cuff placement on bare skin, cutting down on overall stress, decreasing salt intake, reducing caffeine intake, limiting alcohol consumption if drinks, lose weight, make sure to get adequate and restful sleep, take 2 readings (wait 1-2 minutes between them and record the average), importance of consistency since 'trends are your friends.'",
  },
  {
    topic: "blood glucose",
    body:
      "Advised to f/u dentist qYear. Advised to f/u retinal screening qYear. Consider trying natural remedies such as fenugreek seeds (soak and drink in morning), cinnamon, turmeric, ginger, etc. Encourage foot care and monitoring for ulcers and sensation.",
  },
  {
    topic: "shoulder pain",
    body:
      "Advised to try Voltaren gel, Sensur Oil roll on (Ayurvedic), magnesium oil (Art Natural) capsaicin cream, ROM/stretching/strength exercises along with acupuncture mat, heat, TENS Unit, NeuroMD device, Theracane, Med Massager, zero gravity chair or Theragun PRN as tolerated, consider exploring store, 'Relax The Back' for different, comfortable furniture along with stretching exercises and services such as Stretch Lab, consider doing ARP wave therapy, red light therapy, Gyrotonic method, X-iser machine, www.startx39now.com (electromagnetic feedback). Consider PT if persist.",
  },
  {
    topic: "cholesterol",
    body:
      "Continue to encourage lifestyle changes via dietary modifications (decreasing carbohydrate intake such as juices, breads, pastas, etc, junk foods, along with portion control and adequate hydration of minimum 64oz of water per day, increase soluble fiber, increase extra virgin olive oil, reduce meat protein and substitute for plant proteins), increasing exercise frequency (at least 150 minutes/week of aerobic exercise + minimum of 2 days of strength/resistance training) as tolerated, weighing self at least once per week; advise intermittent fasting (doing 16:8, 12:12 ratios, skipping meals, doing 24 hour fasts, prolonged fasting); advised to take vitamin K2 + D3 (Cardio Platinum, Kyoloic), Omega 3, consider trying Oculus VR system as alternative motivation for activity and exercise; advised to review supplements and nutraceuticals using website (www.examine.com); advised on importance of stress management and not to neglect stressors.",
  },
];

const SEED_STRETCHES: SlashStretchEntry[] = [
  {
    region: "shoulder",
    stretches: [
      "Pendulum swing — hang the arm relaxed and swing in small circles for 30 seconds each direction.",
      "Cross-body stretch — pull the affected arm across the chest with the opposite hand and hold for 20 seconds.",
      "Doorway pec stretch — forearm against the doorframe, gentle lean forward until a stretch is felt in the front of the shoulder; hold 20 seconds.",
      "Towel internal-rotation stretch — hold a towel behind the back and pull up gently with the unaffected arm; hold 15 seconds.",
      "Wall climbs — walk the fingers up the wall as far as comfortable, then back down, 10 reps.",
    ],
  },
];

const TOPIC_INDEX = new Map<string, SlashEducationEntry>();
for (const e of SEED_TOPICS) TOPIC_INDEX.set(e.topic.toLowerCase(), e);

const STRETCH_INDEX = new Map<string, SlashStretchEntry>();
for (const e of SEED_STRETCHES) STRETCH_INDEX.set(e.region.toLowerCase(), e);

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export interface SlashExpansionMiss {
  ok: false;
  reason: "unknown-topic" | "unknown-region" | "malformed";
}

export interface SlashExpansionHit {
  ok: true;
  topic: string;
  body: string;
}

export type SlashExpansion = SlashExpansionHit | SlashExpansionMiss;

/**
 * Resolve a slash command typed inline in note authoring. Examples:
 *   "/blood pressure"               -> the BP education block
 *   "/shoulder stretch exercises"   -> the per-region stretch list
 *   "/cholesterol"                  -> the lipids education block
 *
 * Returns ok:false when the topic isn't seeded so the editor can show
 * "no template — type your own" instead of silently inserting nothing.
 */
export function expandSlashCommand(raw: string): SlashExpansion {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return { ok: false, reason: "malformed" };
  const phrase = trimmed.slice(1).trim().toLowerCase();
  if (!phrase) return { ok: false, reason: "malformed" };

  if (phrase.endsWith("stretch exercises")) {
    const region = phrase.slice(0, -"stretch exercises".length).trim();
    const entry = STRETCH_INDEX.get(region);
    if (!entry) return { ok: false, reason: "unknown-region" };
    const body = entry.stretches
      .map((s, i) => `${i + 1}. ${s}`)
      .join("\n");
    return { ok: true, topic: `${region} stretch exercises`, body };
  }

  const direct = TOPIC_INDEX.get(phrase);
  if (direct) return { ok: true, topic: direct.topic, body: direct.body };

  return { ok: false, reason: "unknown-topic" };
}

export function listSeedTopics(): readonly SlashEducationEntry[] {
  return SEED_TOPICS;
}

export function listSeedStretchRegions(): readonly string[] {
  return SEED_STRETCHES.map((s) => s.region);
}

/**
 * Register a topic at runtime — primarily for tests, eventually for a
 * practice-level admin surface that lets clinics add their own snippets
 * without a code deploy.
 */
export function registerSlashTopic(entry: SlashEducationEntry): void {
  TOPIC_INDEX.set(entry.topic.toLowerCase(), entry);
}
