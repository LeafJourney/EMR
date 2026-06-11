import { describe, expect, it } from "vitest";
import {
  buildCsv,
  escapeCsvCell,
  tableToPrintableHtml,
} from "./table-export";

describe("escapeCsvCell", () => {
  it("passes plain strings and numbers through unchanged", () => {
    expect(escapeCsvCell("Maya Reyes")).toBe("Maya Reyes");
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(0)).toBe("0");
  });

  it("renders null/undefined/empty as an empty cell", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
    expect(escapeCsvCell("")).toBe("");
  });

  it("quotes cells containing commas, quotes, or newlines", () => {
    expect(escapeCsvCell("Reyes, Maya")).toBe('"Reyes, Maya"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises spreadsheet formula injection", () => {
    expect(escapeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(escapeCsvCell("+1")).toBe("'+1");
    expect(escapeCsvCell("-1")).toBe("'-1");
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");
  });

  it("quotes a formula-injection cell that also contains a comma", () => {
    // guard prefix applied first, then RFC-4180 quoting
    expect(escapeCsvCell("=1,2")).toBe('"\'=1,2"');
  });
});

describe("buildCsv", () => {
  it("joins a header row + body rows with CRLF and escapes cells", () => {
    const csv = buildCsv(
      ["Patient", "Billed", "Note"],
      [
        ["Maya Reyes", 240, "ok"],
        ["Reyes, Sam", 99.5, 'has "quote"'],
      ],
    );
    expect(csv).toBe(
      'Patient,Billed,Note\r\n' +
        'Maya Reyes,240,ok\r\n' +
        '"Reyes, Sam",99.5,"has ""quote"""',
    );
  });

  it("handles an empty body", () => {
    expect(buildCsv(["A", "B"], [])).toBe("A,B");
  });
});

describe("tableToPrintableHtml", () => {
  it("includes the title, headers, and HTML-escaped cell values", () => {
    const html = tableToPrintableHtml(
      "Claims",
      ["Patient", "Status"],
      [["A&B <Co>", "paid"]],
    );
    expect(html).toContain("<title>Claims</title>");
    expect(html).toContain("<th>Patient</th>");
    expect(html).toContain("<th>Status</th>");
    expect(html).toContain("<td>A&amp;B &lt;Co&gt;</td>");
    expect(html).toContain("<td>paid</td>");
  });
});
