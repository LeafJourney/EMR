// ───────────────────────────────────────────────────────────────────────────
// EMR-1151 — Medical localization layer
// ───────────────────────────────────────────────────────────────────────────
// Doc Phase 3: route non-English summaries through clinical-intent-preserving
// dictionaries (no unsafe literal idioms) with culturally sensitive
// substitutions. The hard safety invariant: translation NEVER alters a dose,
// number, or universal unit. We enforce that mechanically by masking numeric
// tokens before substitution and restoring them afterward, plus assert-equal
// helpers the pipeline + tests use to prove doses survived.

import type { AvsDocument, SupportedLanguage } from "./types";

export interface LocalizationResult {
  language: SupportedLanguage;
  text: string;
  /** The dictionary substitutions that fired (for auditability). */
  substitutions: Array<{ from: string; to: string }>;
}

/* -------------------------------------------------------------------------- */
/* Cultural / plain-language substitutions (English → English), pre-translation */
/* -------------------------------------------------------------------------- */

const PLAIN_LANGUAGE_SUBSTITUTIONS: Array<[RegExp, string]> = [
  [/\binsulin resistance\b/gi, "how your body cells process energy from your food"],
  [/\bhypertension\b/gi, "high blood pressure"],
  [/\bhyperglycemia\b/gi, "high blood sugar"],
  [/\bhypoglycemia\b/gi, "low blood sugar"],
  [/\bdyslipidemia\b/gi, "unhealthy cholesterol levels"],
  [/\bhepatic\b/gi, "liver"],
  [/\brenal\b/gi, "kidney"],
];

/* -------------------------------------------------------------------------- */
/* Translation dictionaries — controlled AVS vocabulary, longest phrase first   */
/* -------------------------------------------------------------------------- */

type Dict = Array<[RegExp, string]>;

const ES: Dict = [
  [/\bwhat to do next\b/gi, "qué hacer a continuación"],
  [/\byour care plan\b/gi, "su plan de cuidado"],
  [/\bhigh blood pressure\b/gi, "presión arterial alta"],
  [/\bhigh blood sugar\b/gi, "azúcar alta en la sangre"],
  [/\blow blood sugar\b/gi, "azúcar baja en la sangre"],
  [/\bfollow-?up\b/gi, "seguimiento"],
  [/\bnext steps\b/gi, "próximos pasos"],
  [/\btwice daily\b/gi, "dos veces al día"],
  [/\bthree times daily\b/gi, "tres veces al día"],
  [/\bonce daily\b/gi, "una vez al día"],
  [/\bat bedtime\b/gi, "a la hora de dormir"],
  [/\bevery morning\b/gi, "cada mañana"],
  [/\bwith meals\b/gi, "con las comidas"],
  [/\bas needed\b/gi, "según sea necesario"],
  [/\bby mouth\b/gi, "por la boca"],
  [/\bunder the tongue\b/gi, "debajo de la lengua"],
  [/\binhaled\b/gi, "inhalado"],
  [/\bminutes?\b/gi, "minutos"],
  [/\bhours?\b/gi, "horas"],
  [/\bsleep\b/gi, "dormir"],
  [/\bwalk\b/gi, "caminar"],
  [/\bplease\b/gi, "por favor"],
  [/\btake\b/gi, "tome"],
  [/\bstart\b/gi, "comience"],
  [/\bstop\b/gi, "deje de tomar"],
  [/\bcontinue\b/gi, "continúe"],
  [/\btoday\b/gi, "hoy"],
  [/\byour\b/gi, "su"],
];

const VI: Dict = [
  [/\bwhat to do next\b/gi, "việc cần làm tiếp theo"],
  [/\byour care plan\b/gi, "kế hoạch chăm sóc của bạn"],
  [/\bhigh blood pressure\b/gi, "huyết áp cao"],
  [/\bhigh blood sugar\b/gi, "đường huyết cao"],
  [/\blow blood sugar\b/gi, "đường huyết thấp"],
  [/\bfollow-?up\b/gi, "tái khám"],
  [/\bnext steps\b/gi, "các bước tiếp theo"],
  [/\btwice daily\b/gi, "hai lần mỗi ngày"],
  [/\bthree times daily\b/gi, "ba lần mỗi ngày"],
  [/\bonce daily\b/gi, "một lần mỗi ngày"],
  [/\bat bedtime\b/gi, "trước khi đi ngủ"],
  [/\bevery morning\b/gi, "mỗi buổi sáng"],
  [/\bwith meals\b/gi, "trong bữa ăn"],
  [/\bas needed\b/gi, "khi cần"],
  [/\bby mouth\b/gi, "bằng đường uống"],
  [/\bunder the tongue\b/gi, "đặt dưới lưỡi"],
  [/\binhaled\b/gi, "hít vào"],
  [/\bminutes?\b/gi, "phút"],
  [/\bhours?\b/gi, "giờ"],
  [/\bsleep\b/gi, "ngủ"],
  [/\bwalk\b/gi, "đi bộ"],
  [/\bplease\b/gi, "vui lòng"],
  [/\btake\b/gi, "uống"],
  [/\bstart\b/gi, "bắt đầu"],
  [/\bstop\b/gi, "ngừng dùng"],
  [/\bcontinue\b/gi, "tiếp tục"],
  [/\btoday\b/gi, "hôm nay"],
  [/\byour\b/gi, "của bạn"],
];

const DICTIONARIES: Record<Exclude<SupportedLanguage, "en">, Dict> = { es: ES, vi: VI };

/* -------------------------------------------------------------------------- */
/* Number protection — the dose-safety mechanism                               */
/* -------------------------------------------------------------------------- */

// A number core, optionally followed by a *universal* unit that must not be
// translated (mg/mcg/g/ml/iu/%/units, and clock-style windows like 14:10).
const NUMERIC_TOKEN =
  /\b\d[\d.,:/-]*(?:\s?(?:mg|mcg|µg|g|ml|iu|units?|%))?\b/gi;

// Printable, regex-safe sentinels that never appear in clinical prose or in the
// translation dictionaries. A masked dose looks like "@@N0@@".
const MASK_OPEN = "@@N";
const MASK_CLOSE = "@@";

function protectNumbers(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = [];
  const masked = text.replace(NUMERIC_TOKEN, (m) => {
    const i = tokens.push(m) - 1;
    return `${MASK_OPEN}${i}${MASK_CLOSE}`;
  });
  return { masked, tokens };
}

function restoreNumbers(masked: string, tokens: string[]): string {
  return masked.replace(/@@N(\d+)@@/g, (_, i) => tokens[Number(i)] ?? "");
}

/** The dose/number tokens in a string (used by the assert-equal guarantee). */
export function numericTokens(text: string): string[] {
  return (text.match(NUMERIC_TOKEN) || []).map((t) => t.replace(/\s+/g, " ").trim());
}

/** True when `after` preserves every numeric/dose token from `before`, in order. */
export function assertNumericTokensPreserved(before: string, after: string): boolean {
  const a = numericTokens(before);
  const b = numericTokens(after);
  if (a.length !== b.length) return false;
  return a.every((tok, i) => tok === b[i]);
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Localize a single string. Always applies the plain-language substitutions;
 * for es/vi it then runs the translation dictionary over number-masked text so
 * doses/units pass through verbatim. English input returns the plain-language
 * (de-jargoned) form.
 */
export function localizeText(text: string, lang: SupportedLanguage): LocalizationResult {
  const substitutions: Array<{ from: string; to: string }> = [];

  let working = text;
  for (const [pattern, replacement] of PLAIN_LANGUAGE_SUBSTITUTIONS) {
    if (pattern.test(working)) {
      working = working.replace(pattern, replacement);
      substitutions.push({ from: pattern.source, to: replacement });
    }
  }

  if (lang === "en") {
    return { language: "en", text: working, substitutions };
  }

  const { masked, tokens } = protectNumbers(working);
  let translated = masked;
  for (const [pattern, replacement] of DICTIONARIES[lang]) {
    if (pattern.test(translated)) {
      translated = translated.replace(pattern, replacement);
      substitutions.push({ from: pattern.source, to: replacement });
    }
  }
  return { language: lang, text: restoreNumbers(translated, tokens), substitutions };
}

function localizeList(items: string[], lang: SupportedLanguage): string[] {
  return items.map((s) => localizeText(s, lang).text);
}

/**
 * Localize an AVS document's patient-facing prose into `lang`.
 *
 * Structured medication fields (dose, route, timing, molecule) are left
 * BYTE-IDENTICAL — the dose-safety invariant — so the calendar renderer and
 * the verification panel keep exact values. Only narrative/instruction/roadmap
 * prose is translated. Use `assertDosesUnchanged` to prove the invariant held.
 */
export function localizeAvsDocument(doc: AvsDocument, lang: SupportedLanguage): AvsDocument {
  return {
    ...doc,
    language: lang,
    narrative: localizeText(doc.narrative, lang).text,
    nextSteps: localizeList(doc.nextSteps, lang),
    followUp: localizeText(doc.followUp, lang).text,
    roadmap: {
      nutrition: doc.roadmap.nutrition.map((i) => ({
        icon: i.icon,
        label: localizeText(i.label, lang).text,
        detail: localizeText(i.detail, lang).text,
      })),
      behavior: doc.roadmap.behavior.map((i) => ({
        icon: i.icon,
        label: localizeText(i.label, lang).text,
        detail: localizeText(i.detail, lang).text,
      })),
    },
    // calendars + decomposed.medications keep their structured dose/timing.
  };
}

/** Assert no medication dose/timing/route/molecule changed across localization. */
export function assertDosesUnchanged(before: AvsDocument, after: AvsDocument): boolean {
  if (before.decomposed.medications.length !== after.decomposed.medications.length) return false;
  const sameMeds = before.decomposed.medications.every((m, i) => {
    const n = after.decomposed.medications[i];
    return (
      m.dose === n.dose &&
      m.timing === n.timing &&
      m.route === n.route &&
      m.molecule === n.molecule
    );
  });
  if (!sameMeds) return false;

  if (before.calendars.length !== after.calendars.length) return false;
  return before.calendars.every((cal, i) => {
    const n = after.calendars[i];
    if (!n || cal.molecule !== n.molecule || cal.steps.length !== n.steps.length) return false;
    return cal.steps.every((s, j) => s.instruction === n.steps[j].instruction);
  });
}
