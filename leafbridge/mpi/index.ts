export { MpiService, type MpiServiceOptions } from "./service";
export { InMemoryMpiStore, type MpiStore } from "./store";
export { normalize, normalizeName, normalizeEmail, normalizePhoneSuffix, normalizePostal } from "./normalize";
export { scorePair, type ScoreBreakdown } from "./score";
export { patientDemographicsSchema } from "./schemas";
export type {
  MpiMatchCandidate,
  MpiMatchOutcome,
  MpiRecord,
  NormalizedDemographics,
  PatientDemographics,
} from "./types";
