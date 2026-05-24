// EMR-747 — Unit tests for the audit-log JSON diff highlighter.
//
// Pure-function module, so we exercise it directly without mocks. The
// goal is to lock in the per-key classification (added / removed /
// changed / unchanged) and the side-by-side renderer's symmetry —
// `before` rows are empty for added keys and vice versa.

import { describe, it, expect } from "vitest";
import {
  buildAuditDiff,
  diffLineClass,
  summariseDiff,
  type AuditDiffLine,
} from "./audit-diff";

function findLine(lines: AuditDiffLine[], key: string): AuditDiffLine {
  const found = lines.find((l) => l.key === key);
  if (!found) throw new Error(`expected diff line for key "${key}"`);
  return found;
}

describe("buildAuditDiff", () => {
  it("classifies an added key", () => {
    const lines = buildAuditDiff({}, { newKey: "hello" });
    const line = findLine(lines, "newKey");
    expect(line.kind).toBe("added");
    expect(line.before).toBe("");
    expect(line.after).toContain('"newKey"');
    expect(line.after).toContain('"hello"');
  });

  it("classifies a removed key", () => {
    const lines = buildAuditDiff({ goneKey: 42 }, {});
    const line = findLine(lines, "goneKey");
    expect(line.kind).toBe("removed");
    expect(line.before).toContain('"goneKey"');
    expect(line.before).toContain("42");
    expect(line.after).toBe("");
  });

  it("classifies a changed value", () => {
    const lines = buildAuditDiff(
      { status: "draft" },
      { status: "published" },
    );
    const line = findLine(lines, "status");
    expect(line.kind).toBe("changed");
    expect(line.before).toContain("draft");
    expect(line.after).toContain("published");
  });

  it("classifies an unchanged scalar", () => {
    const lines = buildAuditDiff({ keep: 1 }, { keep: 1 });
    const line = findLine(lines, "keep");
    expect(line.kind).toBe("unchanged");
    expect(line.before).toContain("1");
    expect(line.after).toContain("1");
  });

  it("treats deeply-equal objects as unchanged", () => {
    const lines = buildAuditDiff(
      { nested: { a: 1, b: [2, 3] } },
      { nested: { b: [2, 3], a: 1 } }, // same data, different key order
    );
    expect(findLine(lines, "nested").kind).toBe("unchanged");
  });

  it("treats deeply-unequal nested objects as changed", () => {
    const lines = buildAuditDiff(
      { nested: { items: [1, 2, 3] } },
      { nested: { items: [1, 2, 4] } },
    );
    expect(findLine(lines, "nested").kind).toBe("changed");
  });

  it("returns keys in sorted order so the layout is stable", () => {
    const lines = buildAuditDiff(
      { b: 2, a: 1, c: 3 },
      { c: 3, a: 1, b: 2 },
    );
    expect(lines.map((l) => l.key)).toEqual(["a", "b", "c"]);
  });

  it("handles null / undefined inputs as empty objects", () => {
    expect(buildAuditDiff(null, null)).toEqual([]);
    expect(buildAuditDiff(undefined, undefined)).toEqual([]);
    const onlyAfter = buildAuditDiff(null, { x: 1 });
    expect(findLine(onlyAfter, "x").kind).toBe("added");
  });

  it("wraps non-object payloads under a synthetic _value key", () => {
    const lines = buildAuditDiff("old", "new");
    const line = findLine(lines, "_value");
    expect(line.kind).toBe("changed");
    expect(line.before).toContain("old");
    expect(line.after).toContain("new");
  });

  it("indents multi-line values to keep nesting visually aligned", () => {
    const lines = buildAuditDiff({}, { obj: { a: 1, b: 2 } });
    const line = findLine(lines, "obj");
    // The rendered string should contain a newline-indented inner line so
    // the rendered side-by-side pre/code block doesn't collapse onto one
    // line.
    expect(line.after.split("\n").length).toBeGreaterThan(1);
  });
});

describe("summariseDiff", () => {
  it("counts each kind", () => {
    const lines = buildAuditDiff(
      { same: 1, gone: 2, was: "a" },
      { same: 1, was: "b", added: 9 },
    );
    expect(summariseDiff(lines)).toEqual({
      added: 1,
      removed: 1,
      changed: 1,
      unchanged: 1,
    });
  });
});

describe("diffLineClass", () => {
  it("returns a non-empty class for every kind/side combination", () => {
    for (const kind of ["added", "removed", "changed", "unchanged"] as const) {
      for (const side of ["before", "after"] as const) {
        expect(diffLineClass(kind, side).length).toBeGreaterThan(0);
      }
    }
  });

  it("highlights only the after side for added keys", () => {
    expect(diffLineClass("added", "after")).toMatch(/emerald/);
    expect(diffLineClass("added", "before")).not.toMatch(/emerald/);
  });

  it("highlights only the before side for removed keys", () => {
    expect(diffLineClass("removed", "before")).toMatch(/rose/);
    expect(diffLineClass("removed", "after")).not.toMatch(/rose/);
  });

  it("highlights both sides for changed keys", () => {
    expect(diffLineClass("changed", "before")).toMatch(/amber/);
    expect(diffLineClass("changed", "after")).toMatch(/amber/);
  });
});
