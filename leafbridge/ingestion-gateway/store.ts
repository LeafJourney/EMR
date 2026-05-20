import type { IngestionEnvelope, RateLimitWindow } from "./types";

export interface IngestionStore {
  has(idempotencyKey: string): Promise<boolean>;
  put(envelope: IngestionEnvelope): Promise<void>;
  rateLimitWindow(
    organizationId: string,
    source: IngestionEnvelope["source"],
    nowMs: number,
    windowMs: number,
  ): Promise<RateLimitWindow>;
}

export class InMemoryIngestionStore implements IngestionStore {
  private envelopes = new Map<string, IngestionEnvelope>();
  private keys = new Set<string>();
  private windows = new Map<string, RateLimitWindow>();

  async has(idempotencyKey: string): Promise<boolean> {
    return this.keys.has(idempotencyKey);
  }

  async put(envelope: IngestionEnvelope): Promise<void> {
    this.envelopes.set(envelope.envelopeId, envelope);
    if (envelope.idempotencyKey) this.keys.add(envelope.idempotencyKey);
  }

  async rateLimitWindow(
    organizationId: string,
    source: IngestionEnvelope["source"],
    nowMs: number,
    windowMs: number,
  ): Promise<RateLimitWindow> {
    const key = `${organizationId}::${source}`;
    const existing = this.windows.get(key);
    if (!existing || nowMs - existing.windowStartedAt >= windowMs) {
      const fresh: RateLimitWindow = {
        organizationId,
        source,
        windowStartedAt: nowMs,
        count: 1,
      };
      this.windows.set(key, fresh);
      return fresh;
    }
    existing.count += 1;
    return existing;
  }

  snapshot(): ReadonlyArray<IngestionEnvelope> {
    return Array.from(this.envelopes.values());
  }
}
