import { redactPii } from "@/lib/agents/guardrails/note-guardrails";
import { logger } from "@/lib/observability/log";
import type { ModelCallOptions, ModelClient } from "./types";

/**
 * Defense-in-depth PHI redaction wrapper.
 *
 * Applied at the agent-context chokepoint (`createAgentContext`) so EVERY
 * harness agent's prompt is scrubbed before it leaves for the external model —
 * without editing each of the ~120 agents. The clinical fleet routinely
 * interpolates patient data into prompts sent to OpenRouter; this strips the
 * identifiers a model never needs to see.
 *
 * Scope:
 *   - Structured identifiers (phone / SSN / email / MRN / DOB) are redacted
 *     unconditionally — they're pattern-matchable.
 *   - Patient NAMES are free-text, so an agent that includes them passes
 *     `options.redactNames` (e.g. `[patient.firstName, patient.lastName]`).
 *     Threading names through the high-PHI agents is a follow-up; structured
 *     redaction + the BAA free-model gate already remove the worst exposure.
 *
 * Redaction counts are logged (`agents.phi_redacted`) so we can measure how
 * much PHI the fleet is actually emitting.
 */
export function withPhiRedaction(
  client: ModelClient,
  agentName?: string,
): ModelClient {
  const scrub = (prompt: string, options?: ModelCallOptions): string => {
    const { redacted, counts } = redactPii(prompt, options?.redactNames ?? []);
    const total =
      counts.phone +
      counts.ssn +
      counts.email +
      counts.mrn +
      counts.dob +
      counts.name;
    if (total > 0) {
      logger.info({ event: "agents.phi_redacted", agentName, counts });
    }
    return redacted;
  };

  const wrapped: ModelClient = {
    complete(prompt, options) {
      return client.complete(scrub(prompt, options), options);
    },
  };

  if (client.stream) {
    wrapped.stream = async function* (prompt, options) {
      yield* client.stream!(scrub(prompt, options), options);
    };
  }

  return wrapped;
}
