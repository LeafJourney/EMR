import { randomUUID } from "node:crypto";

import { ingestionRequestSchema, type IngestionRequest } from "./schemas";
import type { IngestionStore } from "./store";
import type {
  IngestionEnvelope,
  IngestionReceipt,
  IngestionSourceKind,
} from "./types";

export interface IngestionGatewayOptions {
  store: IngestionStore;
  now?: () => Date;
  rateLimit?: {
    windowMs: number;
    maxPerWindow: number;
  };
}

const DEFAULT_RATE_LIMIT = { windowMs: 60_000, maxPerWindow: 240 } as const;

export class IngestionGateway {
  private readonly store: IngestionStore;
  private readonly now: () => Date;
  private readonly rateLimit: { windowMs: number; maxPerWindow: number };

  constructor(opts: IngestionGatewayOptions) {
    this.store = opts.store;
    this.now = opts.now ?? (() => new Date());
    this.rateLimit = opts.rateLimit ?? DEFAULT_RATE_LIMIT;
  }

  async ingest(raw: unknown): Promise<IngestionReceipt> {
    const parsed = ingestionRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return this.reject(parsed.error.issues.map((i) => i.message).join("; "));
    }
    const req = parsed.data;

    if (req.idempotencyKey && (await this.store.has(req.idempotencyKey))) {
      return this.duplicate(req.idempotencyKey);
    }

    const now = this.now();
    const window = await this.store.rateLimitWindow(
      req.organizationId,
      req.source,
      now.getTime(),
      this.rateLimit.windowMs,
    );
    if (window.count > this.rateLimit.maxPerWindow) {
      return this.rateLimited(req.organizationId, req.source);
    }

    const envelope = this.envelope(req, now);
    await this.store.put(envelope);
    return {
      envelopeId: envelope.envelopeId,
      status: "accepted",
      acceptedAt: envelope.receivedAt,
      reason: null,
    };
  }

  private envelope(req: IngestionRequest, now: Date): IngestionEnvelope {
    return {
      envelopeId: randomUUID(),
      source: req.source,
      organizationId: req.organizationId,
      receivedAt: now.toISOString(),
      payload: req.payload,
      contentType: req.contentType,
      idempotencyKey: req.idempotencyKey ?? null,
    };
  }

  private reject(reason: string): IngestionReceipt {
    return {
      envelopeId: randomUUID(),
      status: "rejected",
      acceptedAt: this.now().toISOString(),
      reason,
    };
  }

  private duplicate(idempotencyKey: string): IngestionReceipt {
    return {
      envelopeId: randomUUID(),
      status: "duplicate",
      acceptedAt: this.now().toISOString(),
      reason: `idempotencyKey ${idempotencyKey} already accepted`,
    };
  }

  private rateLimited(
    organizationId: string,
    source: IngestionSourceKind,
  ): IngestionReceipt {
    return {
      envelopeId: randomUUID(),
      status: "rate_limited",
      acceptedAt: this.now().toISOString(),
      reason: `rate limit exceeded for ${organizationId}/${source}`,
    };
  }
}
