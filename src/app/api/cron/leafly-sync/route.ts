import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import { fetchLeaflyStrains } from "@/lib/integrations/leafly-client";
import { translateEffectsToTherapeuticTags } from "@/lib/integrations/deepseek-client";
import type { StrainClassification } from "@prisma/client";

// Nightly cron job endpoint for synchronizing Leafly data to Verdant Apothecary EMR
// Can be hit manually from the Admin UI.
export async function POST(req: Request) {
  try {
    // 1. Fetch from Leafly
    logger.info({ event: "leafly_sync.started" });
    const strains = await fetchLeaflyStrains();
    let syncedCount = 0;

    for (const strain of strains) {
      // 2. Translate recreational effects to clinical symptoms via DeepSeek
      const clinicalSymptoms = await translateEffectsToTherapeuticTags(strain.effects);

      // 3. Upsert into database
      const classificationMapping: Record<string, StrainClassification> = {
        "Indica": "indica",
        "Sativa": "sativa",
        "Hybrid": "hybrid",
        "CBD": "cbd",
      };

      const classification = classificationMapping[strain.category] || "na";

      await prisma.strain.upsert({
        where: { slug: strain.slug },
        update: {
          name: strain.name,
          classification,
          thcPercent: strain.thcLevel,
          cbdPercent: strain.cbdLevel,
          dominantTerpene: strain.dominantTerpene,
          effects: strain.effects,
          symptoms: clinicalSymptoms.length ? clinicalSymptoms : undefined, // Keep existing if translation fails
          updatedAt: new Date(),
        },
        create: {
          slug: strain.slug,
          name: strain.name,
          classification,
          thcPercent: strain.thcLevel,
          cbdPercent: strain.cbdLevel,
          dominantTerpene: strain.dominantTerpene,
          effects: strain.effects,
          symptoms: clinicalSymptoms,
        },
      });

      syncedCount++;
    }

    logger.info({ event: "leafly_sync.completed", syncedCount });
    return NextResponse.json({ success: true, syncedCount });
  } catch (error) {
    logger.error({ event: "leafly_sync.failed", error });
    return NextResponse.json({ success: false, error: "Synchronization failed" }, { status: 500 });
  }
}
