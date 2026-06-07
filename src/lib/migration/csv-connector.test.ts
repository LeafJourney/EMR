import { describe, expect, it } from "vitest";
import {
  fieldMappingsForCategory,
  mapRow,
  mapRowsForCategory,
  parseCsv,
} from "./csv-connector";

describe("parseCsv (EMR-457)", () => {
  it("parses headers and header-keyed rows", () => {
    const { headers, rows } = parseCsv("first,last\nAda,Lovelace\nAlan,Turing\n");
    expect(headers).toEqual(["first", "last"]);
    expect(rows).toEqual([
      { first: "Ada", last: "Lovelace" },
      { first: "Alan", last: "Turing" },
    ]);
  });

  it("handles quoted fields with commas, newlines, and escaped quotes", () => {
    const csv = 'name,note\n"Smith, Jr.","line1\nline2"\n"O""Brien","ok"\n';
    const { rows } = parseCsv(csv);
    expect(rows[0]).toEqual({ name: "Smith, Jr.", note: "line1\nline2" });
    expect(rows[1]).toEqual({ name: 'O"Brien', note: "ok" });
  });

  it("accepts CRLF line endings and ignores a blank trailing line", () => {
    const { rows } = parseCsv("a,b\r\n1,2\r\n");
    expect(rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("pads short rows and keeps extra cells under _extra_ keys", () => {
    const { rows } = parseCsv("a,b\n1\n1,2,3\n");
    expect(rows[0]).toEqual({ a: "1", b: "" });
    expect(rows[1]).toEqual({ a: "1", b: "2", _extra_2: "3" });
  });

  it("returns empty for blank input", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("mapRow / mapRowsForCategory (EMR-457)", () => {
  it("passes rows through unchanged when there are no mappings", () => {
    expect(mapRow({ a: "1", b: "2" }, {})).toEqual({ a: "1", b: "2" });
  });

  it("renames mapped columns and emits only mapped fields", () => {
    const out = mapRow(
      { FNAME: "Ada", LNAME: "Lovelace", junk: "x" },
      { FNAME: "firstName", LNAME: "lastName" },
    );
    expect(out).toEqual({ firstName: "Ada", lastName: "Lovelace" });
  });

  it("fills a mapped-but-absent source column with empty string", () => {
    expect(mapRow({ FNAME: "Ada" }, { LNAME: "lastName" })).toEqual({
      lastName: "",
    });
  });

  it("maps a batch of rows", () => {
    const out = mapRowsForCategory(
      [{ FNAME: "Ada" }, { FNAME: "Alan" }],
      { FNAME: "firstName" },
    );
    expect(out).toEqual([{ firstName: "Ada" }, { firstName: "Alan" }]);
  });
});

describe("fieldMappingsForCategory (EMR-457)", () => {
  const categories = [
    { slug: "demographics", fieldMappings: { FNAME: "firstName", bad: 5 } },
    { slug: "medications", enabled: true },
  ];

  it("extracts string-valued mappings for the matching category", () => {
    expect(fieldMappingsForCategory(categories, "demographics")).toEqual({
      FNAME: "firstName",
    });
  });

  it("returns {} for an unknown category or non-array input", () => {
    expect(fieldMappingsForCategory(categories, "labs")).toEqual({});
    expect(fieldMappingsForCategory("nope", "demographics")).toEqual({});
    expect(fieldMappingsForCategory(categories, "medications")).toEqual({});
  });
});
