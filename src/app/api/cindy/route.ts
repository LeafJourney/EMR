// EMR-309 — Plain HTTP entrypoint for Ask Cindy. The widget itself uses
// a server action; this route exists so external surfaces (a future
// browser extension, a partner site embed) can call Cindy without a
// Next.js server-action context.
//
// Auth (added per docs/security/route-auth.yaml needs_review entry):
// any signed-in user, rate-limited by agentInvocationLimiter so an
// abusive caller can't unbounded-spend on the upstream LLM.

import { NextResponse } from "next/server";
import { askCindy, askCindyInput } from "@/lib/agents/cindy";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { agentInvocationLimiter } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const gate = await requireApiAuth({
    rateLimit: { limiter: agentInvocationLimiter, bucket: "agent.cindy" },
  });
  if (gate.error) return gate.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = askCindyInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await askCindy(parsed.data);
  return NextResponse.json(result);
}
