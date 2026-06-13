// UPI — emotional distress / sentiment evaluation (EMR-1146).
//
// Phase 2.3 of the red-text spec: "a parallel linguistic processor
// evaluates the structural syntax of the message to measure the patient's
// emotional state, tracking urgency indicators such as capital letters,
// exclamation points, and explicit panic words".
//
// Deterministic and pure — runs on the RAW message text (before
// normalization) because casing and punctuation ARE the signal here.

export interface DistressSignal {
  /** S_distress in [0, 1]. */
  score: number;
  /** Share of words (≥3 letters) written fully in caps. */
  capsRatio: number;
  /** Exclamation marks per message, capped contribution at 3. */
  exclamationCount: number;
  /** Panic vocabulary hits found in the message. */
  panicTerms: string[];
}

const PANIC_VOCABULARY: ReadonlyArray<RegExp> = [
  /\bterrified\b/i,
  /\bterrifying\b/i,
  /\bscared\b/i,
  /\bscary\b/i,
  /\bfrightened\b/i,
  /\bpanick?(?:ing|ed|y)?\b/i,
  /\bfreaking out\b/i,
  /\bhelp me\b/i,
  /\bplease help\b/i,
  /\bbleeding out\b/i,
  /\bcan'?t breathe\b/i,
  /\b(?:i'?m|am) dying\b/i,
  /\bgoing to die\b/i,
  /\bemergency\b/i,
  /\bdesperate\b/i,
  /\bhysterical\b/i,
  /\basap\b/i,
  /\bright now\b/i,
];

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Score emotional distress 0–1 from message structure and vocabulary.
 * Weighted toward explicit panic vocabulary; caps and exclamation marks
 * are supporting signals (some patients just type in caps).
 */
export function scoreDistress(rawText: string): DistressSignal {
  const text = rawText.trim();
  if (!text) {
    return { score: 0, capsRatio: 0, exclamationCount: 0, panicTerms: [] };
  }

  // Caps ratio over words with ≥3 alphabetic chars (skips "OK", "ER", "I").
  const words = text.split(/\s+/);
  const alphaWords = words.filter((w) => (w.match(/[A-Za-z]/g) ?? []).length >= 3);
  const capsWords = alphaWords.filter((w) => {
    const letters = w.replace(/[^A-Za-z]/g, "");
    return letters.length >= 3 && letters === letters.toUpperCase();
  });
  const capsRatio = alphaWords.length > 0 ? capsWords.length / alphaWords.length : 0;

  const exclamationCount = (text.match(/!/g) ?? []).length;

  const panicTerms: string[] = [];
  for (const re of PANIC_VOCABULARY) {
    const m = text.match(re);
    if (m) panicTerms.push(m[0].toLowerCase());
  }

  const panicScore = clamp01(panicTerms.length / 2); // two panic terms saturate
  const capsScore = clamp01(capsRatio * 4); // 25% caps words saturate
  const exclamationScore = clamp01(exclamationCount / 3); // three "!" saturate

  const score = clamp01(0.55 * panicScore + 0.25 * capsScore + 0.2 * exclamationScore);

  return { score, capsRatio, exclamationCount, panicTerms };
}
