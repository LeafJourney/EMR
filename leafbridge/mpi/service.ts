import { randomUUID } from "node:crypto";

import { normalize } from "./normalize";
import { patientDemographicsSchema } from "./schemas";
import { scorePair } from "./score";
import type { MpiStore } from "./store";
import type {
  MpiMatchCandidate,
  MpiMatchOutcome,
  MpiRecord,
  PatientDemographics,
} from "./types";

export interface MpiServiceOptions {
  store: MpiStore;
  now?: () => Date;
  autoMatchThreshold?: number;
  reviewThreshold?: number;
}

const DEFAULT_AUTO_MATCH = 0.92;
const DEFAULT_REVIEW = 0.7;

export class MpiService {
  private readonly store: MpiStore;
  private readonly now: () => Date;
  private readonly autoMatchThreshold: number;
  private readonly reviewThreshold: number;

  constructor(opts: MpiServiceOptions) {
    this.store = opts.store;
    this.now = opts.now ?? (() => new Date());
    this.autoMatchThreshold = opts.autoMatchThreshold ?? DEFAULT_AUTO_MATCH;
    this.reviewThreshold = opts.reviewThreshold ?? DEFAULT_REVIEW;

    if (this.reviewThreshold > this.autoMatchThreshold) {
      throw new Error("reviewThreshold must be <= autoMatchThreshold");
    }
  }

  async resolve(input: unknown): Promise<MpiMatchOutcome> {
    const parsed = patientDemographicsSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(
        `invalid PatientDemographics: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      );
    }
    const demographics: PatientDemographics = {
      ...parsed.data,
      sex: parsed.data.sex ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      postalCode: parsed.data.postalCode ?? null,
    };
    const normalized = normalize(demographics);

    const candidates: MpiMatchCandidate[] = [];
    const existing = await this.store.listForOrg(demographics.organizationId);
    for (const record of existing) {
      const { score, reasons } = scorePair(normalized, record.normalized);
      if (score >= this.reviewThreshold) {
        candidates.push({ record, score, reasons });
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (best && best.score >= this.autoMatchThreshold) {
      return {
        kind: "matched",
        mpiId: best.record.mpiId,
        score: best.score,
        reasons: best.reasons,
      };
    }
    if (best) {
      return { kind: "review", candidates };
    }

    const created: MpiRecord = {
      mpiId: randomUUID(),
      organizationId: demographics.organizationId,
      normalized,
      source: demographics,
      createdAt: this.now().toISOString(),
    };
    await this.store.put(created);
    return { kind: "created", mpiId: created.mpiId };
  }

  async getRecord(mpiId: string): Promise<MpiRecord | null> {
    return this.store.get(mpiId);
  }
}
