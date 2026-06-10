"use server";

// AI setup-review — reviews the (non-PHI) practice setup metadata and returns
// concrete, human-approved recommendations. Reuses the configured model client
// (resolveModelClient). When no model is configured it resolves to the stub,
// whose "AI output unavailable" notice we detect and report as ai:false so the
// UI falls back to the rule-based preview — we never fabricate AI output.

import { getCurrentUser } from "@/lib/auth/session";
import {
  resolveModelClient,
  isModelError,
} from "@/lib/orchestration/model-client";

export type AiReviewResult =
  | { ok: true; ai: boolean; suggestions: string[] }
  | { ok: false; message: string };

export async function runAiSetupReview(input: {
  organizationId: string;
  practiceName: string;
  specialty: string | null;
  careModel: string | null;
  readinessScore: number;
  missingChecklist: string[];
  reviewFlags: string[];
}): Promise<AiReviewResult> {
  const user = await getCurrentUser();
  if (
    !user ||
    (!user.roles.includes("super_admin") &&
      !user.roles.includes("implementation_admin"))
  ) {
    return { ok: false, message: "Not authorized." };
  }

  const prompt = [
    "You are an onboarding specialist reviewing a medical-practice setup on Leafjourney (an EMR).",
    "Based ONLY on the setup metadata below, give 3-6 short, concrete, actionable recommendations to get this practice ready to activate.",
    "These are SUGGESTIONS for a human admin — do not assume anything not stated, and never invent patient or clinical data.",
    "Return ONE recommendation per line. No numbering, no preamble, no closing remarks.",
    "",
    `Practice: ${input.practiceName}`,
    `Specialty: ${input.specialty ?? "not selected"}`,
    `Care model: ${input.careModel ?? "not set"}`,
    `Setup readiness: ${input.readinessScore}%`,
    `Incomplete setup steps: ${input.missingChecklist.join("; ") || "none"}`,
    `Flags needing attention: ${input.reviewFlags.join("; ") || "none"}`,
  ].join("\n");

  const client = resolveModelClient(input.organizationId, "practice-setup-review");
  try {
    const out = await client.complete(prompt, { maxTokens: 400, temperature: 0.2 });
    if (/AI output unavailable in this environment/i.test(out)) {
      return { ok: true, ai: false, suggestions: [] }; // stub — not configured
    }
    const suggestions = out
      .split("\n")
      .map((l) => l.replace(/^\s*[-*•\d.]+\s*/, "").trim())
      .filter((l) => l.length > 0)
      .slice(0, 6);
    return { ok: true, ai: suggestions.length > 0, suggestions };
  } catch (e) {
    const message = isModelError(e)
      ? e.friendly
      : "AI review is temporarily unavailable.";
    return { ok: false, message };
  }
}
