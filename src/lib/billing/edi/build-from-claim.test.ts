import { describe, expect, it } from "vitest";
import { deriveDiagnosisPointers } from "./build-from-claim";

// EDI-2: service lines must carry the diagnosis pointers for the diagnoses
// THEY actually treat, not always [1]. deriveDiagnosisPointers maps a line's
// linked ICD-10 codes to 1-based indices into the claim's ordered dx list.

describe("deriveDiagnosisPointers (EDI-2)", () => {
  const dx = ["F12.20", "G89.29", "M54.50"];

  it("maps linked codes to their 1-based claim pointers", () => {
    expect(deriveDiagnosisPointers(["G89.29", "M54.50"], dx)).toEqual([2, 3]);
  });

  it("preserves the line's code order, not the claim's", () => {
    expect(deriveDiagnosisPointers(["M54.50", "F12.20"], dx)).toEqual([3, 1]);
  });

  it("drops codes the claim doesn't carry", () => {
    expect(deriveDiagnosisPointers(["G89.29", "Z99.99"], dx)).toEqual([2]);
  });

  it("caps the composite at 4 pointers (X12 SV107 limit)", () => {
    const five = ["a", "b", "c", "d", "e"];
    expect(deriveDiagnosisPointers(five, five)).toEqual([1, 2, 3, 4]);
  });

  it("falls back to [1] when the line has no resolvable linkage", () => {
    expect(deriveDiagnosisPointers(undefined, dx)).toEqual([1]);
    expect(deriveDiagnosisPointers([], dx)).toEqual([1]);
    expect(deriveDiagnosisPointers(["Z99.99"], dx)).toEqual([1]); // none match → fallback
  });

  it("emits no pointers when the claim has no diagnoses (avoids invalid SV107)", () => {
    expect(deriveDiagnosisPointers(["F12.20"], [])).toEqual([]);
    expect(deriveDiagnosisPointers(undefined, [])).toEqual([]);
  });
});
