import { withPhiRedaction } from "@/lib/orchestration/redacting-model-client";
import type { ModelClient } from "@/lib/orchestration/types";
import { assertEval, type EvalCase } from "../harness";

// Safety — patient PHI must never reach the external model. These run against
// a capture client (the redaction wrapper is what we're exercising), so they
// need no API key.
function capturePrompt(): { client: ModelClient; sent: () => string } {
  let last = "";
  const client: ModelClient = {
    async complete(prompt: string) {
      last = prompt;
      return "ok";
    },
  };
  return { client, sent: () => last };
}

export const phiRedactionEvalCases: EvalCase[] = [
  {
    suite: "phi-redaction",
    name: "structured PHI scrubbed before the model sees it",
    run: async () => {
      const cap = capturePrompt();
      await withPhiRedaction(cap.client).complete(
        "Call patient at 415-555-1234, SSN 123-45-6789, email a@b.com",
      );
      const sent = cap.sent();
      assertEval(
        !/415-555-1234|123-45-6789|a@b\.com/.test(sent),
        `raw PHI leaked into the prompt: ${sent}`,
      );
      assertEval(
        /\[PHONE\]/.test(sent) && /\[SSN\]/.test(sent) && /\[EMAIL\]/.test(sent),
        `redaction tokens missing: ${sent}`,
      );
    },
  },
  {
    suite: "phi-redaction",
    name: "patient name scrubbed via redactNames",
    run: async () => {
      const cap = capturePrompt();
      await withPhiRedaction(cap.client).complete(
        "Patient Jane Doe reports improvement",
        { redactNames: ["Jane Doe"] },
      );
      assertEval(
        !cap.sent().includes("Jane Doe"),
        `patient name leaked: ${cap.sent()}`,
      );
    },
  },
  {
    suite: "phi-redaction",
    name: "clean clinical content is preserved",
    run: async () => {
      const cap = capturePrompt();
      const clinical = "Patient has chronic low back pain, on gabapentin 300mg";
      await withPhiRedaction(cap.client).complete(clinical);
      assertEval(
        cap.sent() === clinical,
        `clinical content was altered: ${cap.sent()}`,
      );
    },
  },
];
