import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { dispatch } from "@/lib/orchestration/dispatch";
import { cfoAgent } from "@/lib/agents/cfo-agent";
import { createLightContext } from "@/lib/orchestration/context";

// ---------------------------------------------------------------------------
// POST /api/cfo/generate — fire the CFO agent for every org (or a single one).
//
// Body: {
//   organizationId?: string  // omit to run for all orgs (cron-friendly)
//   period?: "weekly" | "monthly" | "quarterly" | "annual" | "daily"
//   inline?: boolean         // true: run synchronously, false: dispatch event
// }
//
// Authenticated by Bearer token = process.env.CRON_SECRET (matches the rest
// of the cron-style routes on this app).
// ---------------------------------------------------------------------------

const bodySchema = z.object({
  organizationId: z.string().optional(),
  period: z.enum(["weekly", "monthly", "quarterly", "annual", "daily"]).optional(),
  inline: z.boolean().optional(),
});

// Auth: cron-style shared-secret in the Authorization header. Production
// requires a match against CRON_SECRET — fail closed even if the env var
// itself is missing (the previous version returned `true` when CRON_SECRET
// was unset, which silently opened the endpoint in any env where the var
// hadn't been provisioned). Non-production logs and falls through so dev
// tooling can hit the route without the env var.
function authorized(req: Request): { ok: true } | { ok: false; reason: string } {
  const expected = process.env.CRON_SECRET ?? "";
  const header = req.headers.get("authorization") ?? "";
  const wanted = expected ? `Bearer ${expected}` : null;

  if (process.env.NODE_ENV === "production") {
    if (!wanted) return { ok: false, reason: "cron_secret_not_configured" };
    if (header !== wanted) return { ok: false, reason: "bad_authorization" };
    return { ok: true };
  }

  // Non-prod: accept but warn so missing CRON_SECRET in staging is visible.
  if (!wanted || header !== wanted) {
    // eslint-disable-next-line no-console
    console.warn("[cfo/generate] non-prod call without valid CRON_SECRET");
  }
  return { ok: true };
}

const ORG_FANOUT_CAP = 250;

export async function POST(req: Request) {
  const auth = authorized(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", reason: auth.reason },
      { status: 401 },
    );
  }

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });

  const { organizationId, period = "weekly", inline = false } = parsed.data;

  let orgIds: string[] = [];
  if (organizationId) {
    orgIds = [organizationId];
  } else {
    // Cap the cron fan-out — a multi-hundred-org tenant base would
    // otherwise dispatch the CFO agent across every row in one tick,
    // which is both an LLM cost spike and an N-way DB hammer. Above
    // this cap, ops needs to shard the cron by tenant slice.
    const orgs = await prisma.organization.findMany({
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: ORG_FANOUT_CAP,
    });
    orgIds = orgs.map((o) => o.id);
    if (orgIds.length === ORG_FANOUT_CAP) {
      // eslint-disable-next-line no-console
      console.warn(
        `[cfo/generate] org fan-out hit cap (${ORG_FANOUT_CAP}); shard the cron`,
      );
    }
  }

  if (inline) {
    const results = await Promise.all(
      orgIds.map(async (id) => {
        try {
          const ctx = createLightContext({ organizationId: id });
          const out = await cfoAgent.run({ organizationId: id, period }, ctx);
          return { organizationId: id, ok: true, briefingId: out.reportIds.briefing };
        } catch (err) {
          return { organizationId: id, ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      }),
    );
    return NextResponse.json({ ok: true, mode: "inline", results });
  }

  const dispatched = await Promise.all(
    orgIds.map((id) => dispatch({ name: "cfo.report.generate", organizationId: id, period })),
  );
  return NextResponse.json({
    ok: true,
    mode: "queued",
    organizations: orgIds.length,
    jobIds: dispatched.flat(),
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST to trigger the CFO agent." });
}
