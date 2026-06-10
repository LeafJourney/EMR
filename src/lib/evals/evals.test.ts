import { describe, it, expect } from "vitest";
import { runEvals, summarize } from "./harness";
import { ALL_EVAL_CASES } from "./registry";

// CI gate for the agent eval harness. vitest only globs src/**, so this lives
// here (not under scripts/) to actually run in CI; `npm run eval` runs the
// same registry standalone.
describe("agent eval harness", () => {
  it("all registered eval cases pass", async () => {
    const results = await runEvals(ALL_EVAL_CASES);
    const failures = results.filter((r) => !r.ok);
    expect(
      failures,
      `\n${failures.map((f) => `  ${f.suite}/${f.name}: ${f.error}`).join("\n")}`,
    ).toHaveLength(0);
  });

  it("has a non-trivial number of cases registered", async () => {
    const { total } = summarize(await runEvals(ALL_EVAL_CASES));
    expect(total).toBeGreaterThan(5);
  });
});
