import type { NormalizedDemographics } from "./types";

export interface ScoreBreakdown {
  score: number;
  reasons: ReadonlyArray<string>;
}

const WEIGHTS = {
  lastName: 0.25,
  firstName: 0.15,
  dob: 0.3,
  phone: 0.15,
  email: 0.1,
  postal: 0.05,
} as const;

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.length === 0) return 1;
  const distance = levenshtein(longer, shorter);
  return Math.max(0, (longer.length - distance) / longer.length);
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[] = new Array(rows * cols).fill(0);
  for (let i = 0; i < rows; i++) dp[i * cols] = i;
  for (let j = 0; j < cols; j++) dp[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i * cols + j] = Math.min(
        dp[(i - 1) * cols + j] + 1,
        dp[i * cols + (j - 1)] + 1,
        dp[(i - 1) * cols + (j - 1)] + cost,
      );
    }
  }
  return dp[rows * cols - 1];
}

export function scorePair(
  a: NormalizedDemographics,
  b: NormalizedDemographics,
): ScoreBreakdown {
  const reasons: string[] = [];
  let score = 0;

  const lastSim = similarity(a.lastNameNormalized, b.lastNameNormalized);
  if (lastSim > 0) {
    score += lastSim * WEIGHTS.lastName;
    if (lastSim === 1) reasons.push("lastName:exact");
    else if (lastSim >= 0.85) reasons.push("lastName:fuzzy");
  }

  const firstSim = similarity(a.firstNameNormalized, b.firstNameNormalized);
  if (firstSim > 0) {
    score += firstSim * WEIGHTS.firstName;
    if (firstSim === 1) reasons.push("firstName:exact");
    else if (firstSim >= 0.85) reasons.push("firstName:fuzzy");
  }

  if (a.dateOfBirth && b.dateOfBirth && a.dateOfBirth === b.dateOfBirth) {
    score += WEIGHTS.dob;
    reasons.push("dob:exact");
  }

  if (a.phoneE164Suffix && b.phoneE164Suffix && a.phoneE164Suffix === b.phoneE164Suffix) {
    score += WEIGHTS.phone;
    reasons.push("phone:exact");
  }

  if (a.emailNormalized && b.emailNormalized && a.emailNormalized === b.emailNormalized) {
    score += WEIGHTS.email;
    reasons.push("email:exact");
  }

  if (a.postalCode5 && b.postalCode5 && a.postalCode5 === b.postalCode5) {
    score += WEIGHTS.postal;
    reasons.push("postal:exact");
  }

  return { score, reasons };
}
