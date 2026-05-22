export interface PatientDemographics {
  organizationId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex?: "male" | "female" | "other" | "unknown" | null;
  email?: string | null;
  phone?: string | null;
  postalCode?: string | null;
}

export interface MpiRecord {
  mpiId: string;
  organizationId: string;
  normalized: NormalizedDemographics;
  source: PatientDemographics;
  createdAt: string;
}

export interface NormalizedDemographics {
  firstNameNormalized: string;
  lastNameNormalized: string;
  dateOfBirth: string;
  phoneE164Suffix: string | null;
  emailNormalized: string | null;
  postalCode5: string | null;
}

export interface MpiMatchCandidate {
  record: MpiRecord;
  score: number;
  reasons: ReadonlyArray<string>;
}

export type MpiMatchOutcome =
  | { kind: "matched"; mpiId: string; score: number; reasons: ReadonlyArray<string> }
  | { kind: "review"; candidates: ReadonlyArray<MpiMatchCandidate> }
  | { kind: "created"; mpiId: string };
