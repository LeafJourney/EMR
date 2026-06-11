import { describe, it, expect } from "vitest";
import { extractSearchTokens, parseSearchArgs, tokenSetMatchesArg } from "./search-params";
import type { FhirJson } from "./types";

const patient: FhirJson = {
  resourceType: "Patient",
  id: "p1",
  identifier: [{ system: "urn:mrn", value: "MRN-7" }],
  name: [{ family: "Reyes", given: ["Lena", "Marie"] }],
  gender: "female",
  birthDate: "1980-05-01",
};

describe("extractSearchTokens", () => {
  it("indexes name parts, gender, birthdate, identifier", () => {
    const tokens = extractSearchTokens(patient);
    const names = tokens.filter((t) => t.name === "name").map((t) => t.value);
    expect(names).toContain("reyes");
    expect(names).toContain("lena");
    expect(tokens.find((t) => t.name === "gender")?.value).toBe("female");
    expect(tokens.find((t) => t.name === "identifier")?.value).toBe("mrn-7");
  });
});

describe("tokenSetMatchesArg", () => {
  const tokens = extractSearchTokens(patient);

  it("string starts-with by default, exact with modifier", () => {
    const [startsWith] = parseSearchArgs({ family: "rey" });
    expect(tokenSetMatchesArg("Patient", startsWith, tokens)).toBe(true);
    const [exact] = parseSearchArgs({ "family:exact": "rey" });
    expect(tokenSetMatchesArg("Patient", exact, tokens)).toBe(false);
  });

  it("token system|code matching", () => {
    const [withSys] = parseSearchArgs({ identifier: "urn:mrn|MRN-7" });
    expect(tokenSetMatchesArg("Patient", withSys, tokens)).toBe(true);
    const [wrongSys] = parseSearchArgs({ identifier: "urn:other|MRN-7" });
    expect(tokenSetMatchesArg("Patient", wrongSys, tokens)).toBe(false);
  });

  it(":not modifier negates", () => {
    const [not] = parseSearchArgs({ "gender:not": "male" });
    expect(tokenSetMatchesArg("Patient", not, tokens)).toBe(true);
  });

  it("unknown params are non-constraints (lenient)", () => {
    const [unknown] = parseSearchArgs({ "made-up": "x" });
    expect(tokenSetMatchesArg("Patient", unknown, tokens)).toBe(true);
  });

  it("date prefixes compare at shared precision", () => {
    const [ge] = parseSearchArgs({ birthdate: "ge1980" });
    expect(tokenSetMatchesArg("Patient", ge, tokens)).toBe(true);
    const [lt] = parseSearchArgs({ birthdate: "lt1980-01-01" });
    expect(tokenSetMatchesArg("Patient", lt, tokens)).toBe(false);
  });
});

describe("parseSearchArgs", () => {
  it("skips result-control params and empty values", () => {
    const args = parseSearchArgs({ name: "lena", _count: "10", _sort: "name", empty: "" });
    expect(args.map((a) => a.name)).toEqual(["name"]);
  });
});
