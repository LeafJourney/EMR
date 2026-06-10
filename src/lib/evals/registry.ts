import type { EvalCase } from "./harness";
import { guardrailEvalCases } from "./cases/guardrails";
import { phiRedactionEvalCases } from "./cases/phi-redaction";
import { fleetEvalCases } from "./cases/fleet";

/**
 * Every registered eval case. Adding coverage for a new agent/surface = a new
 * `cases/*.ts` file exporting `EvalCase[]` and one line here.
 */
export const ALL_EVAL_CASES: EvalCase[] = [
  ...guardrailEvalCases,
  ...phiRedactionEvalCases,
  ...fleetEvalCases,
];
