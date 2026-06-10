// Phase 1 — per-org AI credential store (server-only).
//
// The single seam for the BYOK secret. It encrypts on write with the EMR's
// envelope framework (AES-256-GCM, per-record DEK, KEK from EMR_PHI_KEK / KMS)
// and decrypts only here, in the model-call path. The plaintext key never
// touches the config blob, the client, or a log line.
//
//   - purpose "byok-credential" isolates this surface's HKDF sub-key from PHI.
//   - aad = organizationId binds a ciphertext to its org: a row copied to
//     another org won't decrypt, so a leaked envelope can't be transplanted.

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import { encryptString, decryptString } from "@/lib/security/encryption-framework";

const PURPOSE = "byok-credential";

/** The masked placeholder the UI sends to mean "leave the stored key alone". */
export const MASKED_API_KEY = "••••••••";

export type OrgAiMode = "managed" | "byok";

/** Non-secret view safe to hand to a client component. */
export interface OrgAiCredentialView {
  mode: OrgAiMode;
  provider: string | null;
  modelId: string | null;
  /** Whether a BYOK key is on file — never the key itself. */
  apiKeySet: boolean;
  keySetAt: string | null;
}

function encOpts(organizationId: string) {
  return { purpose: PURPOSE, aad: organizationId };
}

/**
 * Upsert an org's AI credential. When `apiKeyPlaintext` is a real key (not the
 * mask, not empty) it is encrypted and the mode flips to "byok"; the masked
 * sentinel or `undefined` leaves the stored key untouched. Pass mode "managed"
 * with no key to (re)assert platform-key usage without wiping an existing key.
 */
export async function setOrgAiCredential(params: {
  organizationId: string;
  provider?: string | null;
  modelId?: string | null;
  apiKeyPlaintext?: string | null;
  setById?: string | null;
}): Promise<void> {
  const { organizationId } = params;
  const realKey =
    params.apiKeyPlaintext &&
    params.apiKeyPlaintext !== MASKED_API_KEY &&
    params.apiKeyPlaintext.trim() !== ""
      ? params.apiKeyPlaintext
      : null;

  // Encrypt OUTSIDE the upsert so a KEK/crypto failure surfaces to the caller
  // instead of silently storing nothing (or, worse, plaintext).
  let encrypted: string | undefined;
  if (realKey) {
    encrypted = await encryptString(realKey, encOpts(organizationId));
  }

  const base = {
    provider: params.provider ?? null,
    modelId: params.modelId ?? null,
  };

  await prisma.orgAiCredential.upsert({
    where: { organizationId },
    create: {
      organizationId,
      ...base,
      mode: realKey ? "byok" : "managed",
      encryptedApiKey: encrypted ?? null,
      keySetAt: realKey ? new Date() : null,
      keySetById: realKey ? params.setById ?? null : null,
    },
    update: {
      ...base,
      // Only touch the key fields when a new real key was supplied; otherwise
      // preserve whatever is on file (masked-sentinel / no-key edits).
      ...(realKey
        ? {
            mode: "byok" as const,
            encryptedApiKey: encrypted,
            keySetAt: new Date(),
            keySetById: params.setById ?? null,
          }
        : {}),
    },
  });
}

/** Read the non-secret view for display. Never includes the key. */
export async function getOrgAiCredentialView(
  organizationId: string,
): Promise<OrgAiCredentialView | null> {
  const row = await prisma.orgAiCredential.findUnique({
    where: { organizationId },
    select: {
      mode: true,
      provider: true,
      modelId: true,
      encryptedApiKey: true,
      keySetAt: true,
    },
  });
  if (!row) return null;
  return {
    mode: row.mode as OrgAiMode,
    provider: row.provider,
    modelId: row.modelId,
    apiKeySet: !!row.encryptedApiKey,
    keySetAt: row.keySetAt?.toISOString() ?? null,
  };
}

/**
 * Resolve the decrypted BYOK key for the call path. Server-only; returns null
 * for managed accounts (use the platform key) or on any decrypt failure — a
 * crypto error must degrade to the platform/stub path, never throw into a
 * clinical model call.
 */
export async function resolveByokApiKey(
  organizationId: string,
): Promise<string | null> {
  try {
    const row = await prisma.orgAiCredential.findUnique({
      where: { organizationId },
      select: { encryptedApiKey: true },
    });
    if (!row?.encryptedApiKey) return null;
    return await decryptString(row.encryptedApiKey, encOpts(organizationId));
  } catch (err) {
    logger.warn({
      event: "ai.credential.decrypt_failed",
      organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
