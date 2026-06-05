import { describe, it, expect } from "vitest";
import { parseBlocks, tokenizeInline } from "./markdown";

describe("tokenizeInline", () => {
  it("returns a single text token for plain text", () => {
    expect(tokenizeInline("hello world")).toEqual([
      { type: "text", value: "hello world" },
    ]);
  });

  it("parses bold with ** and __", () => {
    expect(tokenizeInline("a **bold** b")).toEqual([
      { type: "text", value: "a " },
      { type: "bold", value: "bold" },
      { type: "text", value: " b" },
    ]);
    expect(tokenizeInline("__strong__")).toEqual([
      { type: "bold", value: "strong" },
    ]);
  });

  it("parses italic with * and _", () => {
    expect(tokenizeInline("*em*")).toEqual([{ type: "italic", value: "em" }]);
    expect(tokenizeInline("_em_")).toEqual([{ type: "italic", value: "em" }]);
  });

  it("treats inline code as literal (no nested emphasis)", () => {
    expect(tokenizeInline("`**not bold**`")).toEqual([
      { type: "code", value: "**not bold**" },
    ]);
  });

  it("parses links", () => {
    expect(tokenizeInline("see [docs](https://x.io)")).toEqual([
      { type: "text", value: "see " },
      { type: "link", value: "docs", href: "https://x.io" },
    ]);
  });

  it("does not treat a lone asterisk as emphasis", () => {
    expect(tokenizeInline("2 * 3 = 6")).toEqual([
      { type: "text", value: "2 * 3 = 6" },
    ]);
  });
});

describe("parseBlocks", () => {
  it("parses headings at multiple levels", () => {
    expect(parseBlocks("# Title")).toEqual([
      { type: "heading", level: 1, text: "Title" },
    ]);
    expect(parseBlocks("### Sub")).toEqual([
      { type: "heading", level: 3, text: "Sub" },
    ]);
  });

  it("parses paragraphs and joins wrapped lines", () => {
    expect(parseBlocks("one\ntwo\n\nthree")).toEqual([
      { type: "paragraph", text: "one two" },
      { type: "paragraph", text: "three" },
    ]);
  });

  it("parses unordered and ordered lists", () => {
    expect(parseBlocks("- a\n- b")).toEqual([
      { type: "list", ordered: false, items: ["a", "b"] },
    ]);
    expect(parseBlocks("1. first\n2. second")).toEqual([
      { type: "list", ordered: true, items: ["first", "second"] },
    ]);
  });

  it("parses GFM tables", () => {
    const md = "| Metric | Value |\n| --- | --- |\n| Active | 128 |\n| Total | 540 |";
    expect(parseBlocks(md)).toEqual([
      {
        type: "table",
        header: ["Metric", "Value"],
        rows: [
          ["Active", "128"],
          ["Total", "540"],
        ],
      },
    ]);
  });

  it("parses fenced code blocks", () => {
    const md = "```ts\nconst x = 1;\n```";
    expect(parseBlocks(md)).toEqual([
      { type: "code", lang: "ts", code: "const x = 1;" },
    ]);
  });

  it("parses blockquotes and horizontal rules", () => {
    expect(parseBlocks("> quoted line")).toEqual([
      { type: "quote", text: "quoted line" },
    ]);
    expect(parseBlocks("---")).toEqual([{ type: "hr" }]);
  });

  it("handles a mixed document", () => {
    const md = [
      "### Cohort snapshot",
      "",
      "Across **128** patients:",
      "",
      "- pain logs rising",
      "- sleep stable",
    ].join("\n");
    expect(parseBlocks(md)).toEqual([
      { type: "heading", level: 3, text: "Cohort snapshot" },
      { type: "paragraph", text: "Across **128** patients:" },
      { type: "list", ordered: false, items: ["pain logs rising", "sleep stable"] },
    ]);
  });
});
