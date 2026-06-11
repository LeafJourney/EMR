/**
 * LeafBridge Lakehouse — append-only, hash-chained Audit zone.
 *
 * Every state-changing operation emits an `AuditEntry`. Each entry hashes its
 * own contents together with the previous entry's hash, forming a tamper-
 * evident chain (the same `prev_hash` / `row_hash` design described in
 * `leafbridge/docs/architecture/lakehouse-zones.md`). Re-deriving the chain and
 * comparing hashes detects any insertion, deletion, or mutation of history.
 *
 * The hash is a pure, dependency-free 128-bit FNV-1a digest rendered as hex —
 * good enough to demonstrate tamper-evidence in the demo without pulling in a
 * crypto dependency or making the engine non-portable. Swap in SHA-256 at the
 * production storage boundary if you need cryptographic strength.
 */
import type { AuditEntry } from "./types";

const GENESIS_HASH = "0".repeat(32);

/** Pure 128-bit FNV-1a → 32-char hex. Deterministic, no dependencies. */
export function hash128(input: string): string {
  // Two independent 64-bit FNV-1a streams (offset bases differ) → 128 bits.
  let h1 = 0xcbf29ce4n;
  let h2 = 0x84222325n;
  const prime = 0x01000193n;
  const mask = 0xffffffffn;
  for (let i = 0; i < input.length; i++) {
    const c = BigInt(input.charCodeAt(i) & 0xff);
    h1 = ((h1 ^ c) * prime) & mask;
    h2 = ((h2 ^ ((c << 1n) | 1n)) * prime) & mask;
  }
  const hex = (n: bigint) => n.toString(16).padStart(8, "0");
  // Fold each 32-bit stream into 16 hex chars by mixing position-rotated copies.
  const fold = (n: bigint) => hex(n) + hex((n * prime) & mask);
  return (fold(h1) + fold(h2)).slice(0, 32);
}

/** The canonical pre-image hashed for an entry (excludes rowHash itself). */
function preimage(e: Omit<AuditEntry, "rowHash">): string {
  return [
    e.tenantId, e.seq, e.auditId, e.recordedAt, e.action, e.typeCode, e.outcome,
    e.agentType, e.agentId, e.resourceType ?? "", e.resourceId ?? "", e.versionId ?? "",
    e.patientId ?? "", e.description ?? "", e.prevHash,
  ].join("");
}

export interface AuditAppend {
  action: AuditEntry["action"];
  typeCode: string;
  outcome?: AuditEntry["outcome"];
  agentType: string;
  agentId: string;
  resourceType?: string;
  resourceId?: string;
  versionId?: string;
  patientId?: string;
  description?: string;
}

/** Per-tenant append-only audit log with a verifiable hash chain. */
export class AuditLog {
  private readonly chains = new Map<string, AuditEntry[]>();
  private readonly now: () => Date;
  private seqCounter = 0;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  /** Append one event to a tenant's chain and return the sealed entry. */
  append(tenantId: string, e: AuditAppend): AuditEntry {
    const chain = this.chains.get(tenantId) ?? [];
    const prevHash = chain.length ? chain[chain.length - 1].rowHash : GENESIS_HASH;
    const seq = chain.length + 1;
    const base: Omit<AuditEntry, "rowHash"> = {
      tenantId,
      seq,
      auditId: `audit-${tenantId}-${seq}-${(++this.seqCounter).toString(36)}`,
      recordedAt: this.now().toISOString(),
      action: e.action,
      typeCode: e.typeCode,
      outcome: e.outcome ?? "0",
      agentType: e.agentType,
      agentId: e.agentId,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      versionId: e.versionId,
      patientId: e.patientId,
      description: e.description,
      prevHash,
    };
    const entry: AuditEntry = { ...base, rowHash: hash128(preimage(base)) };
    chain.push(entry);
    this.chains.set(tenantId, chain);
    return entry;
  }

  /** All entries for a tenant, oldest first. */
  list(tenantId: string): readonly AuditEntry[] {
    return this.chains.get(tenantId) ?? [];
  }

  /** Total entries across all tenants. */
  size(): number {
    let n = 0;
    for (const c of this.chains.values()) n += c.length;
    return n;
  }

  /**
   * Re-derive the chain and confirm every link. Returns `{ ok: true }` when the
   * chain is intact, or the 1-based index of the first broken link.
   */
  verify(tenantId: string): { ok: true } | { ok: false; brokenAt: number } {
    const chain = this.chains.get(tenantId) ?? [];
    let prevHash = GENESIS_HASH;
    for (let i = 0; i < chain.length; i++) {
      const { rowHash, ...rest } = chain[i];
      if (rest.prevHash !== prevHash) return { ok: false, brokenAt: i + 1 };
      if (hash128(preimage(rest)) !== rowHash) return { ok: false, brokenAt: i + 1 };
      prevHash = rowHash;
    }
    return { ok: true };
  }
}
