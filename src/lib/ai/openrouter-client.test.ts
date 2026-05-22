import { describe, it, expect, vi, beforeEach } from "vitest";
import { translateStrainToClinical } from "./openrouter-client";
import type { LeaflyStrainData } from "../integrations/leafly-client";

global.fetch = vi.fn();

describe("OpenRouter AI Translator", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should translate recreational tags to clinical tags", async () => {
    // Set mock env to test the fetch branch
    process.env.OPENROUTER_API_KEY = "test_key";
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              chemotype: 1,
              therapeuticTags: ["Antidepressant", "Anxiolytic / Muscle Relaxation"]
            })
          }
        }]
      })
    } as any);

    const mockStrain: LeaflyStrainData = {
      slug: "blue-dream",
      name: "Blue Dream",
      category: "Hybrid",
      thcLevel: 18,
      cbdLevel: 0.1,
      dominantTerpene: "Myrcene",
      effects: ["Happy", "Relaxed"]
    };

    const result = await translateStrainToClinical(mockStrain);
    expect(result.chemotype).toBe(1);
    expect(result.therapeuticTags).toContain("Antidepressant");
    
    delete process.env.OPENROUTER_API_KEY;
  });
  
  it("should use fallback logic if API key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    
    const mockStrain: LeaflyStrainData = {
      slug: "blue-dream",
      name: "Blue Dream",
      category: "Hybrid",
      thcLevel: 18,
      cbdLevel: 0.1,
      dominantTerpene: "Myrcene",
      effects: ["Happy", "Relaxed"]
    };

    const result = await translateStrainToClinical(mockStrain);
    expect(result.chemotype).toBe(1);
    expect(result.therapeuticTags).toContain("Antidepressant");
  });
});
