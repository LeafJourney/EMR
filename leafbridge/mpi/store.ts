import type { MpiRecord } from "./types";

export interface MpiStore {
  put(record: MpiRecord): Promise<void>;
  get(mpiId: string): Promise<MpiRecord | null>;
  listForOrg(organizationId: string): Promise<ReadonlyArray<MpiRecord>>;
}

export class InMemoryMpiStore implements MpiStore {
  private rows = new Map<string, MpiRecord>();

  async put(record: MpiRecord): Promise<void> {
    this.rows.set(record.mpiId, record);
  }

  async get(mpiId: string): Promise<MpiRecord | null> {
    return this.rows.get(mpiId) ?? null;
  }

  async listForOrg(organizationId: string): Promise<ReadonlyArray<MpiRecord>> {
    const out: MpiRecord[] = [];
    for (const row of this.rows.values()) {
      if (row.organizationId === organizationId) out.push(row);
    }
    return out;
  }
}
