import { describe, it, expect, vi } from "vitest";
import { fetchLeaflyStrains } from "./leafly-client";

global.fetch = vi.fn();

describe("Leafly API Client", () => {
  it("should fetch and return a list of strains", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { slug: "blue-dream", name: "Blue Dream", category: "Hybrid", thcLevel: 18, cbdLevel: 0.1, dominantTerpene: "Myrcene", effects: ["Happy", "Relaxed"] }
        ]
      })
    } as any);

    const strains = await fetchLeaflyStrains();
    expect(strains).toHaveLength(1);
    expect(strains[0].name).toBe("Blue Dream");
  });
});
