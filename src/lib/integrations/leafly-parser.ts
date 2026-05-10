/**
 * Leafly Strain Parser Integration (EMR-018)
 * 
 * Utility to parse public chemovar data (terpenes, cannabinoids, reported effects)
 * from Leafly/Weedmaps endpoints or scraped data structures to map them
 * into the internal Verdant Apothecary database schema.
 */

import { prisma } from "@/lib/db/prisma";

export interface LeaflyStrainData {
  slug: string;
  name: string;
  category: "Indica" | "Sativa" | "Hybrid" | "CBD";
  thcLevel: number;
  cbdLevel: number;
  dominantTerpene: string;
  effects: string[];
}

export interface VerdantChemovarRecord {
  internalId: string;
  displayName: string;
  chemotype: 1 | 2 | 3; // 1: THC dominant, 2: Mixed, 3: CBD dominant
  terpeneProfile: string;
  therapeuticTags: string[];
  externalReferenceUrl: string;
}

export class LeaflyDataParser {
  /**
   * Transforms external strain data into the clinical chemovar model.
   */
  parseToInternalRecord(data: LeaflyStrainData): VerdantChemovarRecord {
    // Determine Chemotype (I, II, III) based on THC/CBD ratio
    let chemotype: 1 | 2 | 3 = 1; // Default THC dom
    
    if (data.cbdLevel > data.thcLevel && data.cbdLevel > 5) {
      chemotype = 3; // Type III: CBD Dominant
    } else if (data.cbdLevel > 2 && data.thcLevel > 2 && Math.abs(data.cbdLevel - data.thcLevel) < 5) {
      chemotype = 2; // Type II: Mixed Ratio
    }

    // Map recreational "effects" to clinical "therapeuticTags"
    const effectMap: Record<string, string> = {
      "Sleepy": "Insomnia / Sleep Disturbance",
      "Relaxed": "Anxiolytic / Muscle Relaxation",
      "Happy": "Antidepressant",
      "Hungry": "Appetite Stimulation",
      "Focused": "ADHD / Cognitive Focus",
    };

    const therapeuticTags = data.effects
      .map(eff => effectMap[eff])
      .filter(Boolean) as string[];

    return {
      internalId: `chv-${data.slug}`,
      displayName: data.name,
      chemotype,
      terpeneProfile: data.dominantTerpene,
      therapeuticTags,
      externalReferenceUrl: `https://www.leafly.com/strains/${data.slug}`
    };
  }

  /**
   * Mock method to simulate fetching from an external API
   */
  async fetchStrainData(slug: string): Promise<LeaflyStrainData | null> {
    console.log(`[LeaflyParser] Fetching data for slug: ${slug}`);
    
    // Simulate network delay
    await new Promise(res => setTimeout(res, 500));

    if (slug === "blue-dream") {
      return {
        slug: "blue-dream",
        name: "Blue Dream",
        category: "Hybrid",
        thcLevel: 18,
        cbdLevel: 0.1,
        dominantTerpene: "Myrcene",
        effects: ["Happy", "Relaxed"]
      };
    }
    
    return null;
  }

  /**
   * Fetches data for a slug, parses it, and saves it to the database.
   */
  async fetchAndSaveStrain(slug: string): Promise<VerdantChemovarRecord | null> {
    const rawData = await this.fetchStrainData(slug);
    if (!rawData) return null;

    const record = this.parseToInternalRecord(rawData);

    // Save to the database
    await prisma.chemovarRecord.upsert({
      where: { internalId: record.internalId },
      update: {
        displayName: record.displayName,
        chemotype: record.chemotype,
        terpeneProfile: record.terpeneProfile,
        therapeuticTags: record.therapeuticTags,
        externalReferenceUrl: record.externalReferenceUrl,
      },
      create: {
        internalId: record.internalId,
        displayName: record.displayName,
        chemotype: record.chemotype,
        terpeneProfile: record.terpeneProfile,
        therapeuticTags: record.therapeuticTags,
        externalReferenceUrl: record.externalReferenceUrl,
      },
    });

    return record;
  }
}

export const leaflyParser = new LeaflyDataParser();
