import { describe, expect, it } from "vitest";
import {
  collectHighlightTerms,
  displayCode,
  groupPayerHistory,
  noteToNarrativeText,
  parseServiceLines,
  payerKey,
  pickEncounterNarrative,
  serviceLinesToCptJson,
  splitNarrativeForEvidence,
  toPreflightClaim,
} from "./helpers";
import type { RootCauseFinding } from "@/lib/billing/preflight";

// ---------------------------------------------------------------------------
// Claim JSON parsing
// ---------------------------------------------------------------------------

describe("parseServiceLines", () => {
  it("maps the Claim.cptCodes JSON shape into engine service lines", () => {
    const lines = parseServiceLines([
      { code: "99214", label: "Office visit", units: 1, chargeAmount: 18500 },
      { code: "96372", modifiers: ["59"] },
    ]);
    expect(lines).toEqual([
      { code: "99214", label: "Office visit", units: 1, chargeAmount: 18500, modifiers: undefined },
      { code: "96372", label: undefined, units: undefined, chargeAmount: undefined, modifiers: ["59"] },
    ]);
  });

  it("drops malformed entries and non-array input", () => {
    expect(parseServiceLines([{ code: 99214 }, null, { label: "x" }])).toEqual([]);
    expect(parseServiceLines(null)).toEqual([]);
    expect(parseServiceLines("nope")).toEqual([]);
  });
});

describe("serviceLinesToCptJson", () => {
  it("round-trips losslessly and omits empty modifier arrays", () => {
    const json = [
      { code: "99214", label: "Office visit", units: 1, chargeAmount: 18500 },
      { code: "96372", modifiers: ["25"] },
    ];
    const round = serviceLinesToCptJson(parseServiceLines(json));
    expect(round).toEqual([
      { code: "99214", label: "Office visit", units: 1, chargeAmount: 18500 },
      { code: "96372", modifiers: ["25"] },
    ]);
  });
});

describe("toPreflightClaim / displayCode", () => {
  it("builds the engine claim shape from a Prisma row", () => {
    const claim = toPreflightClaim({
      id: "c1",
      payerName: "Aetna",
      payerId: "60054",
      serviceDate: new Date("2026-06-01"),
      cptCodes: [{ code: "99214", modifiers: ["25"] }],
      icd10Codes: [{ code: "M54.5", label: "Low back pain" }],
    });
    expect(claim.claimId).toBe("c1");
    expect(claim.serviceLines).toHaveLength(1);
    expect(claim.icd10Codes[0]).toEqual({ code: "M54.5", label: "Low back pain" });
    expect(displayCode(claim.serviceLines[0])).toBe("99214-25");
    expect(displayCode({ code: "96372" })).toBe("96372");
  });
});

// ---------------------------------------------------------------------------
// Payer history grouping (one query → per-payer ClaimOutcomeRow buckets)
// ---------------------------------------------------------------------------

describe("groupPayerHistory", () => {
  const paidAt = new Date("2026-05-01");
  const deniedAt = new Date("2026-05-15");

  it("expands one adjudicated claim into per-CPT outcome rows", () => {
    const grouped = groupPayerHistory([
      {
        payerName: "Aetna",
        payerId: "60054",
        status: "denied",
        cptCodes: [{ code: "99214" }, { code: "96372" }],
        paidAt: null,
        deniedAt,
      },
    ]);
    const rows = grouped.get("aetna")!;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      payerName: "Aetna",
      payerId: "60054",
      cptCode: "99214",
      outcome: "denied",
      adjudicatedAt: deniedAt,
    });
  });

  it("groups by case-insensitive trimmed payer name", () => {
    const grouped = groupPayerHistory([
      { payerName: "Aetna ", payerId: null, status: "paid", cptCodes: [{ code: "99213" }], paidAt, deniedAt: null },
      { payerName: "AETNA", payerId: null, status: "denied", cptCodes: [{ code: "99213" }], paidAt: null, deniedAt },
      { payerName: "Cigna", payerId: null, status: "paid", cptCodes: [{ code: "99213" }], paidAt, deniedAt: null },
    ]);
    expect(grouped.get("aetna")).toHaveLength(2);
    expect(grouped.get("cigna")).toHaveLength(1);
    expect(payerKey("  AETNA ")).toBe("aetna");
    expect(payerKey(null)).toBeNull();
  });

  it("picks the status-appropriate adjudication timestamp", () => {
    const grouped = groupPayerHistory([
      { payerName: "Aetna", payerId: null, status: "paid", cptCodes: [{ code: "1" }], paidAt, deniedAt },
      { payerName: "Aetna", payerId: null, status: "denied", cptCodes: [{ code: "2" }], paidAt, deniedAt },
      { payerName: "Aetna", payerId: null, status: "partial", cptCodes: [{ code: "3" }], paidAt, deniedAt: null },
    ]);
    const rows = grouped.get("aetna")!;
    expect(rows.find((r) => r.cptCode === "1")!.adjudicatedAt).toBe(paidAt);
    expect(rows.find((r) => r.cptCode === "2")!.adjudicatedAt).toBe(deniedAt);
    expect(rows.find((r) => r.cptCode === "3")!.adjudicatedAt).toBe(paidAt);
  });

  it("drops rows missing payer, date, codes, or with unknown statuses", () => {
    const grouped = groupPayerHistory([
      { payerName: null, payerId: null, status: "paid", cptCodes: [{ code: "1" }], paidAt, deniedAt: null },
      { payerName: "Aetna", payerId: null, status: "paid", cptCodes: [{ code: "1" }], paidAt: null, deniedAt: null },
      { payerName: "Aetna", payerId: null, status: "paid", cptCodes: [], paidAt, deniedAt: null },
      { payerName: "Aetna", payerId: null, status: "voided", cptCodes: [{ code: "1" }], paidAt, deniedAt: null },
    ]);
    expect(grouped.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Narrative extraction
// ---------------------------------------------------------------------------

describe("narrative extraction", () => {
  it("flattens note blocks and free-form narrative into one blob", () => {
    const text = noteToNarrativeText({
      narrative: "Free text tail.",
      blocks: [
        { type: "assessment", heading: "Assessment", body: "Chronic low back pain, worsening." },
        { type: "plan", heading: "Plan", body: "" },
      ],
    });
    expect(text).toBe("Chronic low back pain, worsening.\n\nFree text tail.");
  });

  it("prefers the newest finalized note over a newer draft", () => {
    const narrative = pickEncounterNarrative([
      { status: "draft", narrative: "draft text", blocks: null, updatedAt: new Date("2026-06-02") },
      { status: "finalized", narrative: "final text", blocks: null, updatedAt: new Date("2026-06-01") },
    ]);
    expect(narrative).toBe("final text");
  });

  it("falls back to the newest draft, then to empty", () => {
    expect(
      pickEncounterNarrative([
        { status: "draft", narrative: "old", blocks: null, updatedAt: new Date("2026-06-01") },
        { status: "draft", narrative: "new", blocks: null, updatedAt: new Date("2026-06-02") },
      ]),
    ).toBe("new");
    expect(pickEncounterNarrative([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Context-aware evidence highlighting
// ---------------------------------------------------------------------------

function finding(partial: Partial<RootCauseFinding>): RootCauseFinding {
  return {
    category: "modifier_deficiency",
    denialCategory: "modifier",
    drivingFeature: "modifierGap",
    contribution: 2.7,
    summary: "",
    remediation: "",
    action: { kind: "append_modifier", targetCode: "99214", modifier: "25" },
    relatedCodes: [],
    ...partial,
  };
}

describe("collectHighlightTerms", () => {
  it("includes Modifier-25 evidence phrases when a modifier finding exists", () => {
    const terms = collectHighlightTerms([finding({})], ["99214", "96372"]);
    expect(terms).toContain("separately identifiable");
  });

  it("includes LCD documentation keywords for the claim's CPTs", () => {
    const terms = collectHighlightTerms([], ["70553"]);
    expect(terms).toContain("treatment failure");
    expect(terms).toContain("red flag");
    // No modifier finding → no Mod-25 phrases.
    expect(terms).not.toContain("separately identifiable");
  });

  it("includes the missing keywords from augment_documentation actions", () => {
    const terms = collectHighlightTerms(
      [
        finding({
          category: "medical_necessity_deficit",
          action: { kind: "augment_documentation", targetCode: "70553", requiredKeywords: ["Papilledema"] },
        }),
      ],
      [],
    );
    expect(terms).toContain("papilledema");
  });
});

describe("splitNarrativeForEvidence", () => {
  it("marks sentences containing a highlight term, case-insensitively", () => {
    const sentences = splitNarrativeForEvidence(
      "Patient seen for follow-up. A separately identifiable evaluation was performed for new wrist pain! Plan unchanged.",
      ["separately identifiable"],
    );
    expect(sentences.map((s) => s.highlight)).toEqual([false, true, false]);
    expect(sentences[1].matchedTerms).toEqual(["separately identifiable"]);
  });

  it("splits on newlines too and skips blanks", () => {
    const sentences = splitNarrativeForEvidence("Line one\n\nLine two with red flag", ["red flag"]);
    expect(sentences).toHaveLength(2);
    expect(sentences[1].highlight).toBe(true);
  });

  it("returns no sentences for an empty narrative", () => {
    expect(splitNarrativeForEvidence("", ["x"])).toEqual([]);
  });
});
