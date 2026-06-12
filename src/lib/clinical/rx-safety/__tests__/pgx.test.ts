import { describe, it, expect } from "vitest";
import { evaluatePgx, resolveCypPhenotype } from "../pgx";
import type { DraftOrder, PgxVariant } from "../types";

const clopidogrel: DraftOrder = { rxNormCui: "32968", drugName: "clopidogrel" };
const codeine: DraftOrder = { drugName: "codeine" };
const allopurinol: DraftOrder = { rxNormCui: "519", drugName: "allopurinol" };

describe("resolveCypPhenotype", () => {
  it("classifies *2/*3 as poor metabolizer", () => {
    expect(resolveCypPhenotype("CYP2C19", ["*2", "*3"])).toBe(
      "poor_metabolizer"
    );
  });
  it("classifies *1/*2 as intermediate metabolizer", () => {
    expect(resolveCypPhenotype("CYP2C19", ["*1", "*2"])).toBe(
      "intermediate_metabolizer"
    );
  });
  it("classifies *1xN as ultrarapid", () => {
    expect(resolveCypPhenotype("CYP2D6", ["*1xN", "*1"])).toBe(
      "ultrarapid_metabolizer"
    );
  });
});

describe("PGx anchor: Clopidogrel × CYP2C19", () => {
  it("IM/PM → hard_substitution suggesting prasugrel/ticagrelor", () => {
    const variants: PgxVariant[] = [{ gene: "CYP2C19", diplotype: "*2/*3" }];
    const [f] = evaluatePgx(clopidogrel, variants);
    expect(f.kind).toBe("hard_substitution");
    expect(f.recommendation.toLowerCase()).toMatch(/prasugrel|ticagrelor/);
    expect(f.citations).toContain("CPIC Level A");
  });
  it("normal metabolizer → no finding", () => {
    const variants: PgxVariant[] = [{ gene: "CYP2C19", diplotype: "*1/*1" }];
    expect(evaluatePgx(clopidogrel, variants)).toHaveLength(0);
  });
});

describe("PGx anchor: Codeine/Tramadol × CYP2D6 PM", () => {
  it("poor metabolizer → dosing_override (therapeutic failure)", () => {
    const variants: PgxVariant[] = [{ gene: "CYP2D6", diplotype: "*4/*5" }];
    const [f] = evaluatePgx(codeine, variants);
    expect(f.kind).toBe("dosing_override");
    expect(f.rationale.toLowerCase()).toMatch(/failure|no analgesic/);
  });
  it("applies to tramadol too", () => {
    const variants: PgxVariant[] = [{ gene: "CYP2D6", diplotype: "*4/*4" }];
    const [f] = evaluatePgx({ drugName: "tramadol" }, variants);
    expect(f.kind).toBe("dosing_override");
  });
});

describe("PGx anchor: Codeine/Tramadol × CYP2D6 ultrarapid", () => {
  it("ultrarapid → hard_stop with critical respiratory warning", () => {
    const variants: PgxVariant[] = [{ gene: "CYP2D6", diplotype: "*1xN/*1" }];
    const [f] = evaluatePgx(codeine, variants);
    expect(f.kind).toBe("hard_stop");
    expect(f.details?.criticalRespiratoryWarning).toBe(true);
  });
});

describe("PGx anchor: Allopurinol × HLA-B*58:01", () => {
  it("positive carriage → hard_stop suggesting febuxostat", () => {
    const variants: PgxVariant[] = [
      { gene: "HLA-B", alleles: ["*58:01"], phenotype: "positive" },
    ];
    const [f] = evaluatePgx(allopurinol, variants);
    expect(f.kind).toBe("hard_stop");
    expect(f.recommendation.toLowerCase()).toContain("febuxostat");
  });
  it("explicit negative → no finding", () => {
    const variants: PgxVariant[] = [
      { gene: "HLA-B", alleles: ["*58:01"], phenotype: "negative" },
    ];
    expect(evaluatePgx(allopurinol, variants)).toHaveLength(0);
  });
});

describe("no genomic data → silent pass", () => {
  it("empty variants returns no findings (no warning)", () => {
    expect(evaluatePgx(clopidogrel, [])).toEqual([]);
  });
  it("variants for an unrelated gene do not fire", () => {
    const variants: PgxVariant[] = [{ gene: "CYP3A5", diplotype: "*3/*3" }];
    expect(evaluatePgx(clopidogrel, variants)).toEqual([]);
  });
});
