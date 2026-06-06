import { describe, expect, it } from "vitest";
import {
  type DecisionRule,
  resolveDefaultDecision,
} from "./approval-defaults-logic";

const rule = (p: Partial<DecisionRule>): DecisionRule => ({
  scopeType: "agent",
  scopeKey: "intake",
  decision: "approve",
  enabled: true,
  ...p,
});

describe("resolveDefaultDecision (EMR-960)", () => {
  it("returns null when no rule matches", () => {
    expect(resolveDefaultDecision([], { agentName: "intake" })).toBeNull();
    expect(
      resolveDefaultDecision([rule({ scopeKey: "scribe" })], { agentName: "intake" }),
    ).toBeNull();
  });

  it("matches an agent rule by agent name", () => {
    const got = resolveDefaultDecision([rule({ decision: "reject" })], {
      agentName: "intake",
    });
    expect(got?.decision).toBe("reject");
  });

  it("matches a workflow rule by workflow name", () => {
    const got = resolveDefaultDecision(
      [rule({ scopeType: "workflow", scopeKey: "supply-reorder", decision: "approve" })],
      { workflowName: "supply-reorder" },
    );
    expect(got?.decision).toBe("approve");
  });

  it("prefers a workflow rule over an agent rule (more specific intent)", () => {
    const rules = [
      rule({ scopeType: "agent", scopeKey: "supplyReorderAgent", decision: "reject" }),
      rule({ scopeType: "workflow", scopeKey: "supply-reorder", decision: "approve" }),
    ];
    const got = resolveDefaultDecision(rules, {
      agentName: "supplyReorderAgent",
      workflowName: "supply-reorder",
    });
    expect(got?.decision).toBe("approve");
    expect(got?.rule.scopeType).toBe("workflow");
  });

  it("ignores disabled rules", () => {
    expect(
      resolveDefaultDecision([rule({ enabled: false, decision: "reject" })], {
        agentName: "intake",
      }),
    ).toBeNull();
  });
});
