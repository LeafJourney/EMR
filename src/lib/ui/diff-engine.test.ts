import { describe, expect, it } from "vitest";

import {
  diffJson,
  diffText,
  diffWords,
  hunksForTextDiff,
  summarizeJsonDiff,
  summarizeTextDiff,
} from "./diff-engine";

describe("diffText", () => {
  it("returns all eq when inputs match", () => {
    const out = diffText("a\nb\nc", "a\nb\nc");
    expect(out.map((l) => l.kind)).toEqual(["eq", "eq", "eq"]);
    expect(out.map((l) => l.leftLine)).toEqual([1, 2, 3]);
    expect(out.map((l) => l.rightLine)).toEqual([1, 2, 3]);
  });

  it("treats empty left as all-add", () => {
    const out = diffText("", "x\ny");
    // The empty string splits to a single empty token, but the empty-left
    // fast path treats every right-side line as an add.
    expect(out.every((l) => l.kind === "add")).toBe(true);
    expect(out.map((l) => l.text)).toEqual(["x", "y"]);
  });

  it("treats empty right as all-del", () => {
    const out = diffText("x\ny", "");
    expect(out.every((l) => l.kind === "del")).toBe(true);
  });

  it("recovers a minimal LCS script", () => {
    const out = diffText("a\nb\nc\nd", "a\nx\nc\nd");
    const summary = summarizeTextDiff(out);
    expect(summary).toEqual({ added: 1, removed: 1, unchanged: 3 });
    const kinds = out.map((l) => l.kind);
    expect(kinds).toContain("del");
    expect(kinds).toContain("add");
    // The middle pair is the change; the bookends survive.
    const eqTexts = out.filter((l) => l.kind === "eq").map((l) => l.text);
    expect(eqTexts).toEqual(["a", "c", "d"]);
  });

  it("emits line numbers on add and del rows", () => {
    const out = diffText("a\nold\nb", "a\nnew\nb");
    const del = out.find((l) => l.kind === "del");
    const add = out.find((l) => l.kind === "add");
    expect(del?.leftLine).toBe(2);
    expect(del?.rightLine).toBeUndefined();
    expect(add?.rightLine).toBe(2);
    expect(add?.leftLine).toBeUndefined();
  });
});

describe("diffWords", () => {
  it("highlights only the differing tokens", () => {
    const { left, right } = diffWords("the quick fox", "the slow fox");
    // Left should mark "quick" as a deletion; right should mark "slow"
    // as an addition; "the " and " fox" are eq runs on both sides.
    expect(left.some((s) => s.kind === "del" && s.text.includes("quick"))).toBe(true);
    expect(right.some((s) => s.kind === "add" && s.text.includes("slow"))).toBe(true);
  });

  it("returns eq-only when strings match", () => {
    const { left, right } = diffWords("same", "same");
    expect(left.every((s) => s.kind === "eq")).toBe(true);
    expect(right.every((s) => s.kind === "eq")).toBe(true);
  });
});

describe("diffJson", () => {
  it("returns no entries when values are deep-equal", () => {
    const left = { a: 1, b: { c: [1, 2] } };
    const right = { a: 1, b: { c: [1, 2] } };
    expect(diffJson(left, right)).toEqual([]);
  });

  it("walks nested objects and reports per-leaf changes", () => {
    const entries = diffJson(
      { a: 1, b: { c: 2, d: 3 } },
      { a: 1, b: { c: 9, e: 4 } },
    );
    const paths = entries.map((e) => `${e.kind}:${e.path}`);
    expect(paths).toContain("change:b.c");
    expect(paths).toContain("del:b.d");
    expect(paths).toContain("add:b.e");
  });

  it("handles array positional diffs", () => {
    const entries = diffJson([1, 2, 3], [1, 99, 3, 4]);
    const summary = summarizeJsonDiff(entries);
    expect(summary).toEqual({ added: 1, removed: 0, changed: 1 });
    expect(entries.find((e) => e.path === "[1]")).toBeDefined();
    expect(entries.find((e) => e.path === "[3]" && e.kind === "add")).toBeDefined();
  });

  it("nests array indices inside paths", () => {
    const entries = diffJson(
      { users: [{ email: "a" }] },
      { users: [{ email: "b" }] },
    );
    expect(entries).toEqual([
      { path: "users[0].email", kind: "change", left: "a", right: "b" },
    ]);
  });

  it("emits a single change record for primitive vs object", () => {
    const entries = diffJson({ a: 1 }, { a: { nested: true } });
    expect(entries).toEqual([
      { path: "a", kind: "change", left: 1, right: { nested: true } },
    ]);
  });

  it("treats null/undefined as removed/added", () => {
    const entries = diffJson({ a: 1 }, { b: 2 });
    const paths = entries.map((e) => `${e.kind}:${e.path}`);
    expect(paths).toEqual(expect.arrayContaining(["del:a", "add:b"]));
  });
});

describe("hunksForTextDiff", () => {
  it("collapses long unchanged runs into a fold", () => {
    const eqs = Array.from({ length: 12 }, (_, i) => `line${i}`).join("\n");
    const lines = diffText(`change\n${eqs}\nchange`, `CHANGE\n${eqs}\nCHANGE`);
    const hunks = hunksForTextDiff(lines, 3);
    // Expect at least one fold somewhere in the middle.
    expect(hunks.some((h) => h.kind === "fold")).toBe(true);
    // Total preserved line count == input line count.
    const total = hunks.reduce((acc, h) => acc + h.lines.length, 0);
    expect(total).toBe(lines.length);
  });

  it("returns a single `lines` hunk when nothing folds", () => {
    const out = diffText("a\nb", "a\nB");
    const hunks = hunksForTextDiff(out, 3);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.kind).toBe("lines");
  });

  it("returns an empty array on empty input", () => {
    expect(hunksForTextDiff([], 3)).toEqual([]);
  });
});
