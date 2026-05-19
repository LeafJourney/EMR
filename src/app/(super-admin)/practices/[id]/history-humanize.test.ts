// EMR-743 — Unit tests for the History tab humanizer.
//
// No DOM, no Prisma — exercises the pure mapper that turns audit log rows
// into a one-line human summary. Lives next to the module per the
// repo-wide colocation convention.

import { describe, expect, it } from "vitest";
import {
  hasKnownAction,
  humanizeAction,
  summarizeChange,
} from "./history-humanize";

describe("humanizeAction", () => {
  it("maps known controller actions to human labels", () => {
    expect(humanizeAction("controller.config.published")).toBe(
      "Published configuration",
    );
    expect(humanizeAction("controller.config.draft_created")).toBe(
      "Created draft configuration",
    );
    expect(humanizeAction("controller.config.rollback")).toBe(
      "Rolled back configuration",
    );
    expect(humanizeAction("controller.super_admin.grant")).toBe(
      "Granted super-admin",
    );
  });

  it("title-cases the tail when the action is unknown", () => {
    expect(humanizeAction("controller.future_feature.frobbed")).toBe("Frobbed");
    expect(humanizeAction("controller.foo.bar_baz")).toBe("Bar baz");
  });

  it("handles actions without the controller. prefix", () => {
    expect(humanizeAction("custom.something.happened")).toBe("Happened");
  });

  it("returns the raw action if it can't extract a tail", () => {
    expect(humanizeAction("")).toBe("");
  });

  it("reports known-action status", () => {
    expect(hasKnownAction("controller.config.published")).toBe(true);
    expect(hasKnownAction("controller.future_feature.frobbed")).toBe(false);
  });
});

describe("summarizeChange", () => {
  it("returns null for empty before/after", () => {
    expect(summarizeChange(null, null)).toBeNull();
    expect(summarizeChange({}, {})).toBeNull();
    expect(summarizeChange(undefined, undefined)).toBeNull();
  });

  it("renders the `after.keys` envelope from the configs route emitter", () => {
    expect(summarizeChange(null, { keys: ["careModel"] })).toBe(
      "Updated careModel",
    );
    expect(
      summarizeChange(null, { keys: ["careModel", "enabledModalities"] }),
    ).toBe("Updated careModel, enabledModalities");
    expect(summarizeChange(null, { keys: ["a", "b", "c", "d", "e"] })).toBe(
      "Updated 5 fields",
    );
  });

  it("renders single-field scalar diffs as before → after", () => {
    expect(
      summarizeChange({ careModel: "solo" }, { careModel: "group" }),
    ).toBe('careModel: "solo" → "group"');
    expect(summarizeChange({ count: 1 }, { count: 2 })).toBe("count: 1 → 2");
    expect(
      summarizeChange({ active: false }, { active: true }),
    ).toBe("active: false → true");
  });

  it("renders single key add/remove tersely", () => {
    expect(summarizeChange({}, { newKey: "v" })).toBe("Set newKey");
    expect(summarizeChange({ oldKey: "v" }, {})).toBe("Cleared oldKey");
  });

  it("summarises multi-field changes by category counts", () => {
    expect(
      summarizeChange(
        { a: 1, b: 2, c: 3 },
        { a: 99, b: 2, d: 4 }, // a changed, c removed, d added
      ),
    ).toBe("+1 added, 1 changed, -1 removed");
  });

  it("falls back to 'Updated <k>' when a single-field change isn't a scalar", () => {
    expect(
      summarizeChange(
        { modalities: ["a"] },
        { modalities: ["a", "b"] },
      ),
    ).toBe("Updated modalities");
  });

  it("treats deep-equal objects as unchanged", () => {
    expect(
      summarizeChange(
        { nested: { x: 1, y: 2 } },
        { nested: { x: 1, y: 2 } },
      ),
    ).toBeNull();
  });

  it("truncates long string scalars in inline diffs", () => {
    const longBefore = "a".repeat(50);
    const longAfter = "b".repeat(50);
    const out = summarizeChange({ note: longBefore }, { note: longAfter });
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThan(80);
    expect(out).toContain("…");
  });
});
