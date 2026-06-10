# Agent evals (`/scripts/evals`)

The canonical, runnable catalog of **agent safety + contract invariants** — the
home the guardrail eval rows already point at ("Model-quality evals live in
/scripts/evals").

- **Logic + cases:** `src/lib/evals/` (so the `@/` alias and the CI gate work).
- **Runner:** `scripts/evals/run.ts` → `npm run eval`.
- **CI gate:** `src/lib/evals/evals.test.ts` (vitest only globs `src/**`, so the
  gate lives there; it runs the same `ALL_EVAL_CASES` registry).

## Run

```bash
npm run eval        # human-readable scorecard, non-zero exit on any failure
npm test            # the gate runs as part of the normal vitest suite
```

## Seed suites (deterministic — no API key)

| Suite | What it asserts |
|-------|-----------------|
| `guardrails` | refusal/defer routing for every curated `DIFFERENTIATION_EVAL_ROWS` case (suicidal ideation → 988/911, PHI-lookup refusal, consumer dosing, …) |
| `phi-redaction` | structured PHI + names are scrubbed before a prompt leaves for the model; clean clinical text is preserved |
| `fleet-inert` | "ship inert" holds — new practices off, existing grandfathered, explicit override wins |

## Add a case

1. Add (or extend) a file under `src/lib/evals/cases/` that exports
   `EvalCase[]`. An `EvalCase` is `{ suite, name, run }` where `run()` throws
   (use `assertEval`) on failure.
2. Spread it into `ALL_EVAL_CASES` in `src/lib/evals/registry.ts`.

## Live model-quality evals (later)

The seed suites are deterministic so CI needs no credentials. To assert real
output quality, add cases that call an agent with `AGENT_MODEL_CLIENT=openrouter`
+ `OPENROUTER_API_KEY` set, and gate them on that env so CI stays hermetic.
