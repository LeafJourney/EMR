import { describe, expect, it } from "vitest";
import {
  rankAutocomplete,
  scoreOption,
  AUTOCOMPLETE_DEFAULT_LIMIT,
  type AutocompleteOption,
} from "./autocomplete-match";

const opt = (
  label: string,
  extra: Partial<AutocompleteOption> = {},
): AutocompleteOption => ({ value: label, label, ...extra });

const labels = (rows: AutocompleteOption[]) => rows.map((r) => r.label);

describe("scoreOption", () => {
  it("returns 0 for an empty query (no ranking signal)", () => {
    expect(scoreOption(opt("Anything"), "")).toBe(0);
    expect(scoreOption(opt("Anything"), "   ")).toBe(0);
  });

  it("returns -1 when the query does not match", () => {
    expect(scoreOption(opt("Aetna"), "cigna")).toBe(-1);
  });

  it("ranks exact ▸ prefix ▸ word-start ▸ substring", () => {
    const exact = scoreOption(opt("pain"), "pain");
    const prefix = scoreOption(opt("painful"), "pain");
    const wordStart = scoreOption(opt("Low back pain"), "back");
    const substring = scoreOption(opt("complaint"), "plai");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(0);
  });

  it("matches against keywords but ranks them below a label hit", () => {
    const labelHit = scoreOption(opt("Aetna"), "aet");
    const keywordHit = scoreOption(
      opt("Anthem", { keywords: ["BCBS", "blue cross"] }),
      "bcbs",
    );
    expect(keywordHit).toBeGreaterThan(0);
    expect(labelHit).toBeGreaterThan(keywordHit);
  });

  it("treats word boundaries in codes/paths (M54.5, low-back, A/R)", () => {
    expect(scoreOption(opt("M54.5 Low back pain"), "54")).toBeGreaterThan(0);
    expect(scoreOption(opt("low-back"), "back")).toBeGreaterThan(0);
    expect(scoreOption(opt("A/R aging"), "aging")).toBeGreaterThan(0);
  });

  it("ANDs multi-word queries — every token must appear", () => {
    expect(scoreOption(opt("Low back pain"), "low pain")).toBeGreaterThan(0);
    expect(scoreOption(opt("Low back pain"), "low knee")).toBe(-1);
  });
});

describe("rankAutocomplete", () => {
  const payers = [
    opt("Aetna"),
    opt("Anthem BCBS", { keywords: ["blue cross", "blue shield"] }),
    opt("Cigna"),
    opt("Humana"),
    opt("UnitedHealthcare", { keywords: ["UHC"] }),
  ];

  it("returns the first N options verbatim for an empty query", () => {
    const out = rankAutocomplete(payers, "", 3);
    expect(labels(out)).toEqual(["Aetna", "Anthem BCBS", "Cigna"]);
  });

  it("defaults to the MASTER-prompt limit of 7", () => {
    expect(AUTOCOMPLETE_DEFAULT_LIMIT).toBe(7);
    const many = Array.from({ length: 20 }, (_, i) => opt(`Option ${i}`));
    expect(rankAutocomplete(many, "")).toHaveLength(7);
    expect(rankAutocomplete(many, "option")).toHaveLength(7);
  });

  it("filters to matches and caps at the limit", () => {
    // query "an": "Anthem BCBS" (prefix) + "Humana" (substring) match;
    // Aetna / Cigna / UnitedHealthcare have no "an".
    const out = rankAutocomplete(payers, "an", 10);
    expect(labels(out)).toEqual(["Anthem BCBS", "Humana"]);
  });

  it("orders a prefix match ahead of a substring match", () => {
    // "Aging" is a label prefix of "ag"; "Repackaging" only contains it
    // mid-word — prefix must win.
    const out = rankAutocomplete([opt("Repackaging"), opt("Aging")], "ag");
    expect(out[0].label).toBe("Aging");
  });

  it("breaks score ties by shorter label, then alphabetically", () => {
    const out = rankAutocomplete(
      [opt("Painkiller log"), opt("Pain"), opt("Painful")],
      "pain",
    );
    // exact "Pain" first; remaining two are both prefix matches -> shorter
    // ("Painful", 7) before longer ("Painkiller log", 14).
    expect(labels(out)).toEqual(["Pain", "Painful", "Painkiller log"]);
  });

  it("never throws on an empty option list", () => {
    expect(rankAutocomplete([], "anything")).toEqual([]);
    expect(rankAutocomplete([], "")).toEqual([]);
  });

  it("treats limit 0 as an empty result", () => {
    expect(rankAutocomplete(payers, "a", 0)).toEqual([]);
  });
});
