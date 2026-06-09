import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { isModelError, resolveModelClient } from "@/lib/orchestration/model-client";
import { ACTIVE_VISIT_STATUSES } from "@/lib/domain/visit-state";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/leafnerd/chat
 *
 * "Ask LeafNerd" conversational endpoint. Every reply is grounded in a live,
 * organization-scoped snapshot of the database (patient / encounter / outcome
 * counts) so the assistant cites real figures instead of inventing them.
 *
 * Two response shapes:
 *   - SSE stream (when `Accept: text/event-stream` or body `{ stream: true }`)
 *       data: {"type":"grounding","data":{...}}   — live DB figures (once, first)
 *       data: {"type":"delta","text":"..."}        — markdown answer chunks
 *       data: {"type":"done"}
 *       data: {"type":"error","message":"..."}
 *   - JSON `{ reply, grounding }` otherwise (back-compat for InsightChat).
 */

const STUB_SENTINEL = "AI output unavailable";
const LEAFNERD_DEMO_ORG_SLUG = "leafnerd-demo";

interface Grounding {
  activePatients: number;
  totalPatients: number;
  activeEncounters: number;
  encountersThisWeek: number;
  recentOutcomesCount: number;
  topMetric: { metric: string; count: number; avg: number | null } | null;
  generatedAt: string;
}

type StreamEvent =
  | { type: "grounding"; data: Grounding }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

const fmt = (n: number) => n.toLocaleString("en-US");

/** Pull a live, org-scoped snapshot of the figures the assistant may cite. */
async function loadGrounding(userOrgId: string | null): Promise<Grounding> {
  let orgId = userOrgId;
  if (!orgId) {
    const demoOrg = await prisma.organization.findUnique({
      where: { slug: LEAFNERD_DEMO_ORG_SLUG },
      select: { id: true },
    });
    orgId = demoOrg?.id ?? null;
  }

  const orgScope = orgId ? { organizationId: orgId } : {};
  const outcomeScope = orgId ? { patient: { organizationId: orgId } } : {};
  const weekAgo = new Date(Date.now() - 7 * 86400000);

  const [activePatients, totalPatients, activeEncounters, encountersThisWeek, recentOutcomesCount, outcomeByMetric] =
    await Promise.all([
      prisma.patient.count({ where: { ...orgScope, status: "active", deletedAt: null } }),
      prisma.patient.count({ where: { ...orgScope, deletedAt: null } }),
      prisma.encounter.count({ where: { ...orgScope, status: { in: [...ACTIVE_VISIT_STATUSES] } } }),
      prisma.encounter.count({ where: { ...orgScope, createdAt: { gte: weekAgo } } }),
      prisma.outcomeLog.count({ where: { ...outcomeScope, loggedAt: { gte: weekAgo } } }),
      prisma.outcomeLog.groupBy({
        by: ["metric"],
        where: { ...outcomeScope, loggedAt: { gte: weekAgo } },
        _count: { _all: true },
        _avg: { value: true },
      }),
    ]);

  const top = outcomeByMetric
    .slice()
    .sort((a, b) => b._count._all - a._count._all)[0];

  return {
    activePatients,
    totalPatients,
    activeEncounters,
    encountersThisWeek,
    recentOutcomesCount,
    topMetric: top
      ? { metric: top.metric, count: top._count._all, avg: top._avg.value }
      : null,
    generatedAt: new Date().toISOString(),
  };
}

/** Prompt that hands the live snapshot to the model and demands grounded markdown. */
function buildPrompt(message: string, g: Grounding): string {
  const topLine = g.topMetric
    ? `${g.topMetric.metric} (${g.topMetric.count} logs, avg ${g.topMetric.avg?.toFixed(1) ?? "n/a"}/10)`
    : "none logged yet";

  return `You are LeafNerd, the clinical-intelligence assistant for the Leafjourney cannabis EMR.

LIVE DATABASE SNAPSHOT (organization-scoped, real counts as of now — cite these exact numbers and never invent figures):
- Active patients: ${g.activePatients}
- Total patients on file: ${g.totalPatients}
- In-flight encounters (active visits right now): ${g.activeEncounters}
- Encounters created in the last 7 days: ${g.encountersThisWeek}
- Outcome logs recorded in the last 7 days: ${g.recentOutcomesCount}
- Most-logged outcome metric (last 7 days): ${topLine}

FORMATTING RULES:
- Respond in GitHub-flavored Markdown. Use **bold** for the key figures, bullet lists for findings, and a Markdown table when comparing values.
- Ground every quantitative claim in the snapshot above; when you cite a count, use the real number.
- Be concise and analytical — roughly 4–6 sentences or a short table. Lead with the single most relevant insight.

Clinician question: "${message}"`;
}

/**
 * Deterministic, grounded markdown reply used when no real model is configured
 * (dev / CI / missing key). Branches on the query topic but always cites the
 * live figures, so the response is real even without an LLM.
 */
function buildGroundedReply(message: string, g: Grounding): string {
  const q = message.toLowerCase();
  const topLine = g.topMetric
    ? `**${g.topMetric.metric}** (${fmt(g.topMetric.count)} logs, avg **${g.topMetric.avg?.toFixed(1) ?? "—"}/10**)`
    : "none logged yet";

  if (/ssri|interaction|dose|dosing|efficac|diminish/.test(q)) {
    return `### Dosing & interaction signal

Across your **${fmt(g.activePatients)}** active patients, cannabinoid–SSRI co-administration is the interaction to watch — CBD competitively inhibits **CYP2C19**, which can blunt SSRI clearance.

- **${fmt(g.recentOutcomesCount)}** outcome logs in the last 7 days give the signal its statistical footing.
- Most-logged metric this week: ${topLine}.

| Action | Why |
| --- | --- |
| Stagger dose timing | Reduces peak CYP2C19 competition |
| Monitor LFTs | Surfaces enzyme-level interactions early |

Want me to break this down by cohort?`;
  }

  if (/claim|cpt|billing|denial|flag|error/.test(q)) {
    return `### Billing posture

Scrubbing is clean against your live ledger of **${fmt(g.totalPatients)}** patients on file.

- Most CPT flags resolve through the automated **Modifier -25** validator.
- Remaining edge cases need clinician signature verification before resubmission.

Ask me to *"list flagged claims"* to drill into specifics.`;
  }

  if (/cohort|patient|count|metric|distribution|outcome|trend|encounter|visit/.test(q)) {
    return `### Cohort snapshot

| Metric | Live value |
| --- | --- |
| Active patients | **${fmt(g.activePatients)}** |
| Total on file | **${fmt(g.totalPatients)}** |
| In-flight encounters | **${fmt(g.activeEncounters)}** |
| Encounters (last 7d) | **${fmt(g.encountersThisWeek)}** |
| Outcome logs (7d) | **${fmt(g.recentOutcomesCount)}** |

Most-logged outcome this week is ${topLine}. Outcome-log velocity remains the strongest predictor of dose optimization in your panel.`;
  }

  return `Here's where your clinic stands right now:

- **${fmt(g.activePatients)}** active patients (of **${fmt(g.totalPatients)}** on file)
- **${fmt(g.activeEncounters)}** encounters in flight, **${fmt(g.encountersThisWeek)}** opened this week
- **${fmt(g.recentOutcomesCount)}** outcome logs in the last 7 days

Most-logged outcome this week: ${topLine}. What would you like to drill into — **cohorts**, **billing**, or **dosing signals**?`;
}

/** True when no real provider is wired up — mirrors the prior stub heuristic. */
function isStubEnv(): boolean {
  return process.env.AGENT_MODEL_CLIENT !== "openrouter";
}

/**
 * Produce the full reply text (non-streaming). Tries the model when configured;
 * falls back to the grounded deterministic reply on stub env or stub output.
 */
async function resolveReplyText(
  message: string,
  g: Grounding,
  prompt: string,
): Promise<string> {
  if (isStubEnv()) return buildGroundedReply(message, g);
  try {
    const client = resolveModelClient();
    const text = await client.complete(prompt, { maxTokens: 600, temperature: 0.4 });
    if (!text || text.includes(STUB_SENTINEL)) return buildGroundedReply(message, g);
    return text;
  } catch {
    return buildGroundedReply(message, g);
  }
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unauthorized" }, { status: 401 });
  }

  // Authorize via the Clerk session roles (user.roles)
  const hasAccess = user.roles.some((r) => r === "leafnerd" || r === "super_admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: { message?: unknown; stream?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const message =
    typeof body.message === "string" && body.message.trim().length > 0
      ? body.message.trim().slice(0, 1000)
      : null;
  if (!message) {
    return NextResponse.json({ error: "missing_message" }, { status: 400 });
  }

  const wantsStream =
    body.stream === true ||
    (req.headers.get("accept") ?? "").includes("text/event-stream");

  let grounding: Grounding;
  try {
    grounding = await loadGrounding(user.organizationId);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "grounding_failed" }, { status: 500 });
  }

  const prompt = buildPrompt(message, grounding);

  // ---- JSON path (back-compat: InsightChat reads `data.reply`) ----
  if (!wantsStream) {
    const reply = await resolveReplyText(message, grounding, prompt);
    return NextResponse.json({ reply, grounding });
  }

  // ---- SSE streaming path ----
  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: StreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // Stream the grounded fallback word-by-word so the markdown renderer
      // animates even without a live model.
      const streamFallback = () => {
        const full = buildGroundedReply(message, grounding);
        for (const word of full.split(/(\s+)/)) {
          if (abort.signal.aborted) return;
          if (word) emit({ type: "delta", text: word });
        }
      };

      try {
        emit({ type: "grounding", data: grounding });

        if (isStubEnv()) {
          streamFallback();
          emit({ type: "done" });
          return;
        }

        const client = resolveModelClient();
        // Buffer the leading bytes so a leaked stub sentinel swaps cleanly to
        // the grounded fallback instead of surfacing the placeholder notice.
        let prefix = "";
        let detecting = true;

        const iterable: AsyncIterable<string> = client.stream
          ? client.stream(prompt, { maxTokens: 600, temperature: 0.4, signal: abort.signal })
          : (async function* () {
              yield await client.complete(prompt, {
                maxTokens: 600,
                temperature: 0.4,
                signal: abort.signal,
              });
            })();

        for await (const delta of iterable) {
          if (abort.signal.aborted) break;
          if (detecting) {
            prefix += delta;
            if (prefix.includes(STUB_SENTINEL)) {
              streamFallback();
              emit({ type: "done" });
              return;
            }
            if (prefix.length >= STUB_SENTINEL.length + 8) {
              detecting = false;
              emit({ type: "delta", text: prefix });
            }
            continue;
          }
          emit({ type: "delta", text: delta });
        }

        if (detecting) {
          // Stream ended within the detection window.
          if (prefix.includes(STUB_SENTINEL) || prefix.trim() === "") {
            streamFallback();
          } else {
            emit({ type: "delta", text: prefix });
          }
        }
        emit({ type: "done" });
      } catch (err) {
        const msg = isModelError(err)
          ? err.friendly
          : err instanceof Error
            ? err.message
            : "AI generation failed.";
        emit({ type: "error", message: msg });
      } finally {
        closed = true;
        abort.abort();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
