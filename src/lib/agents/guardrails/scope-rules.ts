// ---------------------------------------------------------------------------
// EMR-304 — Scope rules: what each audience is allowed to ask, and what
// always escalates regardless of audience.
// ---------------------------------------------------------------------------
// The rules below run in declaration order. The FIRST match wins, so put
// "refuse / defer" rules before "allow" rules of the same topic.
//
// Adding a new rule: give it a stable `id` (used in telemetry), keep
// `match` cheap (substring or regex on already-lowered text), and make
// sure the refusal copy is bilingual.
// ---------------------------------------------------------------------------

import type {
  AgentAudience,
  AgentSurface,
  GuardrailContext,
  GuardrailDecision,
  GuardrailTopic,
} from "./types";

interface ScopeRule {
  id: string;
  topics: GuardrailTopic[];
  /** When omitted, applies to every audience. */
  audiences?: AgentAudience[];
  /** When omitted, applies to every surface. */
  surfaces?: AgentSurface[];
  /** Cheap predicate over the lower-cased utterance. */
  match: (lowered: string, ctx: GuardrailContext) => boolean;
  /** What to do when the rule matches. */
  decide: (ctx: GuardrailContext) => Omit<GuardrailDecision, "topics" | "ruleId">;
}

const has = (...needles: string[]) => (lowered: string) =>
  needles.some((n) => lowered.includes(n));

// ---------------------------------------------------------------------------
// Universal refusals — apply to every audience and surface.
// ---------------------------------------------------------------------------

const UNIVERSAL_RULES: ScopeRule[] = [
  {
    id: "universal.self-harm",
    topics: ["self-harm"],
    match: has(
      "kill myself",
      "suicidal",
      "end my life",
      "want to die",
      "quitarme la vida",
      "matarme",
      "no quiero vivir",
    ),
    decide: () => ({
      action: "defer",
      handoffTo: "emergency",
      reason:
        "Suicidal ideation — never resolve via AI; route to 988 / 911 immediately.",
      refusal: {
        en:
          "I'm worried about what you just shared. Please call or text 988 (Suicide & Crisis Lifeline) or 911 right now. " +
          "If you're in immediate danger, go to the nearest emergency room. A real person from our care team will follow up with you.",
        es:
          "Me preocupa lo que acabas de compartir. Por favor llama o envía un mensaje al 988 (Línea de Crisis y Suicidio) o al 911 ahora mismo. " +
          "Si estás en peligro inmediato, ve a la sala de emergencias más cercana. Un miembro real de nuestro equipo se comunicará contigo después.",
      },
    }),
  },
  {
    id: "universal.pediatric-ingestion",
    topics: ["pediatric"],
    match: has(
      "my child ate",
      "my kid ate",
      "toddler ate",
      "baby ate",
      "child got into",
      "edible child",
      "mi hijo comio",
      "mi hijo comió",
      "el bebé comió",
    ),
    decide: () => ({
      action: "defer",
      handoffTo: "emergency",
      reason:
        "Possible pediatric cannabis ingestion — route to Poison Control + ER, not the chatbot.",
      refusal: {
        en:
          "If a child may have ingested cannabis, call Poison Control at 1-800-222-1222 and consider the nearest ER right now. " +
          "High-THC edibles can cause respiratory depression in small children. Please don't wait on a chat reply.",
        es:
          "Si un niño pudo haber ingerido cannabis, llama a Control de Envenenamiento al 1-800-222-1222 y considera ir a la sala de emergencias más cercana ahora mismo. " +
          "Los comestibles con mucho THC pueden causar depresión respiratoria en niños pequeños. Por favor no esperes una respuesta en el chat.",
      },
    }),
  },
];

// ---------------------------------------------------------------------------
// Consumer / patient surfaces — refuse personalized clinical recommendations.
// ---------------------------------------------------------------------------

const CONSUMER_RULES: ScopeRule[] = [
  {
    id: "consumer.no-personal-dose",
    topics: ["dose-recommendation", "medication-change"],
    audiences: ["consumer", "patient"],
    match: has(
      "what dose should i take",
      "how much should i take",
      "should i take",
      "should i increase",
      "should i decrease",
      "can i stop my",
      "switch from",
      "qué dosis debería",
      "cuánto debería tomar",
    ),
    decide: () => ({
      action: "refuse",
      handoffTo: "clinician",
      reason:
        "Personalized dosing belongs to a licensed clinician — consumer surfaces stay general.",
      refusal: {
        en:
          "Dosing depends on your full health picture, so I can't recommend a specific amount for you here. " +
          "I can explain how cannabinoids generally work, or — if you're a patient — start a message to your care team who can answer this with your chart in front of them.",
        es:
          "La dosis depende de tu situación de salud completa, así que aquí no puedo recomendarte una cantidad específica. " +
          "Puedo explicar cómo funcionan los cannabinoides en general o, si eres paciente, iniciar un mensaje a tu equipo de atención que pueda responder con tu historial.",
      },
    }),
  },
  {
    id: "consumer.no-diagnosis",
    topics: ["diagnosis"],
    audiences: ["consumer", "patient"],
    match: has(
      "do i have",
      "is this cancer",
      "diagnose me",
      "what's wrong with me",
      "tengo cáncer",
      "tengo cancer",
      "diagnóstica",
      "diagnostica",
    ),
    decide: () => ({
      action: "refuse",
      handoffTo: "clinician",
      reason: "Diagnosis is out of scope for consumer chat surfaces.",
      refusal: {
        en:
          "I can't diagnose conditions — that has to come from a clinician who can examine you and review your records. " +
          "I can share general info on what symptoms might point toward, and help you find a clinician on Leafjourney.",
        es:
          "No puedo diagnosticar enfermedades — eso debe venir de un clínico que pueda examinarte y revisar tu historial. " +
          "Puedo compartir información general sobre lo que pueden indicar los síntomas, y ayudarte a encontrar un clínico en Leafjourney.",
      },
    }),
  },
  {
    id: "consumer.no-phi-lookup",
    topics: ["phi-lookup"],
    audiences: ["consumer"],
    match: has(
      "my chart",
      "my labs",
      "my last labs",
      "my recent labs",
      "my medication list",
      "my meds",
      "my last visit",
      "my last appointment",
      "mi expediente",
      "mis laboratorios",
    ),
    decide: () => ({
      action: "defer",
      handoffTo: "human-ops",
      reason:
        "PHI lookups require an authenticated patient session, not a public chat.",
      refusal: {
        en:
          "I can't look up personal records from this public chat. If you have a Leafjourney patient account, sign in and I'll have your chart in context — or message your care team directly.",
        es:
          "No puedo buscar registros personales desde este chat público. Si tienes una cuenta de paciente en Leafjourney, inicia sesión y tendré tu historial en contexto — o envía un mensaje directo a tu equipo.",
      },
    }),
  },
];

// ---------------------------------------------------------------------------
// Clinician surfaces — refuse non-clinical drift, allow specifics.
// ---------------------------------------------------------------------------

const CLINICIAN_RULES: ScopeRule[] = [
  {
    id: "clinician.no-marketing-tone",
    topics: ["operational"],
    audiences: ["clinician"],
    match: has("write a marketing", "promote our clinic", "social media post"),
    decide: () => ({
      action: "refuse",
      reason: "Clinical surfaces don't generate marketing copy.",
      refusal: {
        en:
          "This is the clinical assistant — I keep its scope to charting, dosing, and patient communication. " +
          "Marketing and social copy lives in the marketing studio (left rail → Studio).",
        es:
          "Este es el asistente clínico — su alcance se limita a documentación, dosificación y comunicación con pacientes. " +
          "El contenido de marketing y redes sociales vive en el estudio de marketing (panel izquierdo → Studio).",
      },
    }),
  },
];

// ---------------------------------------------------------------------------
// Operator surfaces — refuse PHI generation, allow ops/billing topics.
// ---------------------------------------------------------------------------

const OPERATOR_RULES: ScopeRule[] = [
  {
    id: "operator.no-clinical-advice",
    topics: ["dose-recommendation", "diagnosis", "medication-change"],
    audiences: ["operator"],
    match: has(
      "should the patient",
      "recommend a dose",
      "diagnose",
      "what's the right dose",
    ),
    decide: () => ({
      action: "refuse",
      reason:
        "Operator console doesn't render clinical recommendations — those route to a clinician.",
      refusal: {
        en:
          "Clinical recommendations come from a clinician, not the ops console. I can flag this for the on-call clinician if you'd like.",
        es:
          "Las recomendaciones clínicas vienen de un clínico, no de la consola de operaciones. Puedo marcar esto para el clínico de turno si quieres.",
      },
    }),
  },
];

export const SCOPE_RULES: ScopeRule[] = [
  ...UNIVERSAL_RULES,
  ...CONSUMER_RULES,
  ...CLINICIAN_RULES,
  ...OPERATOR_RULES,
];

/**
 * Internal entrypoint — evaluate ctx against the rule list, FIRST-MATCH wins.
 * Returns null when nothing matched (caller falls through to default-allow).
 */
export function evaluateScopeRules(
  ctx: GuardrailContext,
): GuardrailDecision | null {
  const lowered = (ctx.utterance ?? "").toLowerCase();

  for (const rule of SCOPE_RULES) {
    if (rule.audiences && !rule.audiences.includes(ctx.audience)) continue;
    if (rule.surfaces && !rule.surfaces.includes(ctx.surface)) continue;
    if (!rule.match(lowered, ctx)) continue;

    const partial = rule.decide(ctx);
    return {
      ...partial,
      topics: rule.topics,
      ruleId: rule.id,
    };
  }

  return null;
}
