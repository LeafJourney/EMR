// Standalone agent-eval runner — `npm run eval`.
//
// Deterministic by default: the seed suites run against pure logic / the
// StubModelClient, so no API key is required. Live model-quality evals can be
// added later (gate those cases on AGENT_MODEL_CLIENT=openrouter).
//
// The CI gate lives at src/lib/evals/evals.test.ts; this script is for running
// the same registry locally with a human-readable scorecard.

import { runEvals, summarize } from "../../src/lib/evals/harness";
import { ALL_EVAL_CASES } from "../../src/lib/evals/registry";

async function main(): Promise<void> {
  const results = await runEvals(ALL_EVAL_CASES);

  let lastSuite = "";
  for (const r of results) {
    if (r.suite !== lastSuite) {
      console.log(`\n# ${r.suite}`);
      lastSuite = r.suite;
    }
    console.log(
      `  ${r.ok ? "✓" : "✗"} ${r.name}${r.error ? `\n      ${r.error}` : ""}`,
    );
  }

  const { total, passed, failed } = summarize(results);
  console.log(`\n${passed}/${total} passed${failed ? `, ${failed} failed` : ""}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
