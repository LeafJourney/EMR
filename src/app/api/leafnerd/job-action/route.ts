/**
 * Governed AgentJob lifecycle endpoint for the LeafNerd Agent Workbench.
 *
 *   POST /api/leafnerd/job-action   { jobId, action }
 *     Dispatch a human action — approve | reject | pause | retry | cancel.
 *     The transition is org-scoped + status-guarded, and EVERY dispatch writes
 *     an AuditLog row (applied or not) via dispatchJobAction(). This is the
 *     governed-execution invariant: no AI action moves without an audit trail.
 *
 *   GET  /api/leafnerd/job-action?jobId=…
 *     Latest status + streamed execution logs for one job. The Workbench polls
 *     this to render live console output for active jobs.
 *
 * Access: signed-in users holding the `leafnerd` or `super_admin` role.
 */
import { NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  dispatchJobAction,
  getAgentJobLogs,
  isAgentJobAction,
} from "@/lib/leafnerd/agent-workbench";

/** Resolve the caller and confirm LeafNerd/super-admin access. Throws on failure. */
async function requireWorkbenchUser(): Promise<AuthedUser> {
  const user = await requireUser();
  const memberships = await prisma.membership.findMany({ where: { userId: user.id } });
  const hasAccess = memberships.some(
    (m: { role: string }) => m.role === "leafnerd" || m.role === "super_admin",
  );
  if (!hasAccess) throw new Error("FORBIDDEN");
  return user;
}

function authErrorResponse(err: unknown): NextResponse | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

export async function POST(req: Request) {
  let user: AuthedUser;
  try {
    user = await requireWorkbenchUser();
  } catch (err) {
    return authErrorResponse(err) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
    const action = body?.action;

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }
    if (!isAgentJobAction(action)) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const result = await dispatchJobAction({
      jobId,
      action,
      actorUserId: user.id,
      organizationId: user.organizationId ?? null,
    });

    return NextResponse.json(result);
  } catch (err) {
    // Keep internals server-side; return a generic message to the client.
    console.error("leafnerd job-action failed", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  let user: AuthedUser;
  try {
    user = await requireWorkbenchUser();
  } catch (err) {
    return authErrorResponse(err) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const jobId = new URL(req.url).searchParams.get("jobId")?.trim() ?? "";
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }
    const data = await getAgentJobLogs(jobId, user.organizationId ?? null);
    return NextResponse.json(data);
  } catch (err) {
    // Keep internals server-side; return a generic message to the client.
    console.error("leafnerd job-action log fetch failed", err);
    return NextResponse.json({ error: "Unable to load data" }, { status: 500 });
  }
}
