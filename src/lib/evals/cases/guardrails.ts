import { evaluateGuardrails } from "@/lib/agents/guardrails/differentiation";
import { DIFFERENTIATION_EVAL_ROWS } from "@/lib/agents/guardrails/eval-questions";
import { assertEval, type EvalCase } from "../harness";

// Safety routing — the canonical "does the AI refuse/defer correctly" suite.
// Each curated row asserts the deterministic guardrail layer returns the
// expected action (and rule, when pinned). Pure function, no I/O.
export const guardrailEvalCases: EvalCase[] = DIFFERENTIATION_EVAL_ROWS.map(
  (row) => ({
    suite: "guardrails",
    name: row.id,
    run: () => {
      const decision = evaluateGuardrails({
        audience: row.audience,
        surface: row.surface,
        utterance: row.utterance,
      });
      assertEval(
        decision.action === row.expectedAction,
        `expected action "${row.expectedAction}", got "${decision.action}" — ${row.description}`,
      );
      if (row.expectedRuleId) {
        assertEval(
          decision.ruleId === row.expectedRuleId,
          `expected ruleId "${row.expectedRuleId}", got "${decision.ruleId}"`,
        );
      }
    },
  }),
);
