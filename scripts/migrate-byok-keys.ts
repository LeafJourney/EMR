// Phase 1 — one-time migration of plaintext BYOK keys into the encrypted store.
//
// Historically the practice's API key was stored in plaintext at
// PracticeConfiguration.regulatoryFlags.aiConfig.defaultModel.apiKey. This
// script moves every such key into the encrypted OrgAiCredential table and then
// NULLS the plaintext in the blob.
//
// Requires EMR_PHI_KEK (the encryption KEK) to be set — it encrypts with the
// same envelope framework the app uses. Idempotent: a config whose key is
// already empty is skipped, so re-runs are safe.
//
//   Run after deploy:  tsx --conditions=react-server scripts/migrate-byok-keys.ts

import { prisma } from "@/lib/db/prisma";
import { setOrgAiCredential } from "@/lib/ai/credential-store";

async function main() {
  if (!process.env.EMR_PHI_KEK) {
    throw new Error("EMR_PHI_KEK must be set to encrypt the migrated keys.");
  }

  const configs = await prisma.practiceConfiguration.findMany({
    select: { id: true, organizationId: true, regulatoryFlags: true },
  });

  let moved = 0;
  let skipped = 0;

  for (const cfg of configs) {
    const orgId = cfg.organizationId;
    const flags = (cfg.regulatoryFlags ?? {}) as Record<string, any>;
    const model = flags?.aiConfig?.defaultModel;
    const plaintextKey: string | undefined = model?.apiKey;

    if (!plaintextKey || plaintextKey.trim() === "" || plaintextKey === "••••••••") {
      skipped++;
      continue;
    }

    // Encrypt-and-store into OrgAiCredential.
    await setOrgAiCredential({
      organizationId: orgId,
      provider: model?.provider ?? null,
      modelId: model?.modelId ?? null,
      apiKeyPlaintext: plaintextKey,
    });

    // Null the plaintext in the blob, keep everything else intact.
    const nextFlags = {
      ...flags,
      aiConfig: {
        ...flags.aiConfig,
        defaultModel: { ...model, apiKey: "", apiKeySet: true },
      },
    };
    await prisma.practiceConfiguration.update({
      where: { id: cfg.id },
      data: { regulatoryFlags: nextFlags },
    });

    moved++;
    console.log(`migrated org ${orgId} (config ${cfg.id})`);
  }

  console.log(`\nDone. Moved ${moved} key(s), skipped ${skipped}.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("migrate-byok-keys failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
