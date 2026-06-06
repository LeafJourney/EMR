import { describe, expect, it } from "vitest";
import {
  type ConfigStatus,
  CONFIG_TRANSITIONS,
  ConfigTransitionError,
  assertConfigTransition,
  canTransition,
} from "./practice-config-status";

const ALL: ConfigStatus[] = ["draft", "published", "archived"];

describe("practice-config status state machine (EMR-436)", () => {
  it("allows the documented forward transitions", () => {
    expect(canTransition("draft", "published")).toBe(true);
    expect(canTransition("draft", "archived")).toBe(true);
    expect(canTransition("published", "archived")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    // Re-publish / re-draft / mutate a terminal archive are all illegal.
    expect(canTransition("published", "published")).toBe(false);
    expect(canTransition("published", "draft")).toBe(false);
    expect(canTransition("draft", "draft")).toBe(false);
    for (const to of ALL) {
      expect(canTransition("archived", to)).toBe(false);
    }
  });

  it("treats archived as terminal", () => {
    expect(CONFIG_TRANSITIONS.archived).toHaveLength(0);
  });

  it("assertConfigTransition throws ConfigTransitionError on illegal moves", () => {
    expect(() => assertConfigTransition("draft", "published")).not.toThrow();
    let caught: unknown;
    try {
      assertConfigTransition("archived", "published");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConfigTransitionError);
    expect((caught as ConfigTransitionError).from).toBe("archived");
    expect((caught as ConfigTransitionError).to).toBe("published");
  });

  it("covers every (from,to) pair deterministically", () => {
    // Guards against an accidental edit widening the matrix.
    const legal = new Set<string>();
    for (const from of ALL) {
      for (const to of CONFIG_TRANSITIONS[from]) legal.add(`${from}->${to}`);
    }
    expect([...legal].sort()).toEqual([
      "draft->archived",
      "draft->published",
      "published->archived",
    ]);
  });
});
