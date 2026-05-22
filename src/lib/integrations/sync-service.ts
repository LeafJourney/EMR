import { prisma } from "@/lib/db/prisma";
import { fetchLeaflyStrains } from "./leafly-client";
import { translateStrainToClinical } from "../ai/openrouter-client";

export async function syncLeaflyCatalog() {
  console.log("[Sync Service] Starting Leafly sync...");
  const strains = await fetchLeaflyStrains();
  let syncedCount = 0;

  for (const strain of strains) {
    try {
      const translation = await translateStrainToClinical(strain);
      
      const internalId = `chv-${strain.slug}`;
      
      await prisma.chemovarRecord.upsert({
        where: { internalId },
        update: {
          displayName: strain.name,
          chemotype: translation.chemotype,
          terpeneProfile: strain.dominantTerpene,
          therapeuticTags: translation.therapeuticTags,
          externalReferenceUrl: `https://www.leafly.com/strains/${strain.slug}`
        },
        create: {
          internalId,
          displayName: strain.name,
          chemotype: translation.chemotype,
          terpeneProfile: strain.dominantTerpene,
          therapeuticTags: translation.therapeuticTags,
          externalReferenceUrl: `https://www.leafly.com/strains/${strain.slug}`
        }
      });
      syncedCount++;
    } catch (err) {
      console.error(`[Sync Service] Failed to sync strain ${strain.slug}`, err);
    }
  }

  console.log(`[Sync Service] Sync complete. Processed ${syncedCount} strains.`);
  return { success: true, syncedCount };
}
