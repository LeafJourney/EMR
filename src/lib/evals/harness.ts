// Agent eval harness (EMR-758).
//
// Fills the `/scripts/evals` gap referenced by the guardrail eval rows. An
// eval case is a named assertion over an agent/safety surface; the runner
// collects pass/fail, and BOTH a CI test (src/lib/evals/evals.test.ts) and a
// standalone runner (scripts/evals/run.ts) consume the same registry.
//
// The seed suites are deterministic — they run against pure logic / the
// StubModelClient, so CI needs no API key. Live model-quality evals can be
// layered on later by gating cases on AGENT_MODEL_CLIENT=openrouter.

export interface EvalCase {
  /** Grouping label (e.g. "guardrails", "phi-redaction"). */
  suite: string;
  /** Stable, unique-within-suite case id. */
  name: string;
  /** Throw (e.g. via assertEval) to fail the case. */
  run: () => void | Promise<void>;
}

export interface EvalResult {
  suite: string;
  name: string;
  ok: boolean;
  error?: string;
}

export function assertEval(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runEvals(cases: EvalCase[]): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (const c of cases) {
    try {
      await c.run();
      results.push({ suite: c.suite, name: c.name, ok: true });
    } catch (err) {
      results.push({
        suite: c.suite,
        name: c.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

export function summarize(results: EvalResult[]): {
  total: number;
  passed: number;
  failed: number;
} {
  const passed = results.filter((r) => r.ok).length;
  return { total: results.length, passed, failed: results.length - passed };
}
