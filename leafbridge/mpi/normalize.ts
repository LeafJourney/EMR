import type { NormalizedDemographics, PatientDemographics } from "./types";

const NON_ALPHA = /[^a-z]/g;
const NON_DIGIT = /\D/g;

export function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(NON_ALPHA, "");
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.includes("@")) return null;
  return trimmed;
}

export function normalizePhoneSuffix(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const digits = value.replace(NON_DIGIT, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

export function normalizePostal(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length < 5) return null;
  return trimmed.slice(0, 5);
}

export function normalize(demographics: PatientDemographics): NormalizedDemographics {
  return {
    firstNameNormalized: normalizeName(demographics.firstName),
    lastNameNormalized: normalizeName(demographics.lastName),
    dateOfBirth: demographics.dateOfBirth,
    phoneE164Suffix: normalizePhoneSuffix(demographics.phone),
    emailNormalized: normalizeEmail(demographics.email),
    postalCode5: normalizePostal(demographics.postalCode),
  };
}
