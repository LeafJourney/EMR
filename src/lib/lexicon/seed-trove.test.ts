import { describe, expect, it } from "vitest";
import {
  lex,
  lexPlural,
  tierForSeeds,
  TROVE_TIERS,
  type LexKey,
} from "./seed-trove";

const ALL_KEYS: LexKey[] = [
  "trove.name",
  "trove.tagline",
  "currency.point",
  "currency.points",
  "currency.short",
  "verb.earn",
  "verb.redeem",
  "verb.spend",
  "verb.donate",
  "noun.reward",
  "noun.giftCard",
  "noun.certificate",
  "noun.tier",
  "noun.streak",
  "noun.ledger",
  "program.volunteer",
  "program.cme",
  "program.fund",
  "program.feedback",
  "status.planted",
  "status.growing",
  "status.harvestable",
  "status.harvested",
];

describe("seed trove lexicon", () => {
  it("resolves every key to a non-empty label (no missing copy)", () => {
    for (const key of ALL_KEYS) {
      const value = lex(key);
      expect(value).toBeTruthy();
      // A missing key falls back to the key string itself — guard against that.
      expect(value).not.toBe(key);
    }
  });

  it("keeps the core metaphor intact", () => {
    expect(lex("trove.name")).toBe("Seed Trove");
    expect(lex("currency.point")).toBe("Seed");
    expect(lex("verb.earn")).toBe("Plant");
    expect(lex("verb.redeem")).toBe("Harvest");
  });

  it("pluralizes the currency by count", () => {
    expect(lexPlural(1, "currency")).toBe("Seed");
    expect(lexPlural(0, "currency")).toBe("Seeds");
    expect(lexPlural(42, "currency")).toBe("Seeds");
  });
});

describe("trove tiers", () => {
  it("are ordered by ascending threshold", () => {
    for (let i = 1; i < TROVE_TIERS.length; i += 1) {
      expect(TROVE_TIERS[i].minSeeds).toBeGreaterThan(TROVE_TIERS[i - 1].minSeeds);
    }
  });

  it("maps a seed balance to the right grove", () => {
    expect(tierForSeeds(0).key).toBe("sprout");
    expect(tierForSeeds(499).key).toBe("sprout");
    expect(tierForSeeds(500).key).toBe("sapling");
    expect(tierForSeeds(2000).key).toBe("canopy");
    expect(tierForSeeds(99999).key).toBe("old-growth");
  });
});
