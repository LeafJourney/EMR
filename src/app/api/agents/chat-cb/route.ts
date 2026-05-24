import { requireApiAuth } from "@/lib/auth/api-gate";
import { agentInvocationLimiter } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/observability/log";
import {
  isModelError,
  resolveModelClient,
} from "@/lib/orchestration/model-client";
import {
  buildChatCBSystemPrompt,
  searchKnowledgeBase,
  EVIDENCE_COLORS,
  STUDY_TYPE_LABELS,
  type CannabisConditionPair,
} from "@/lib/domain/chatcb";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/agents/chat-cb
 *
 * Conversational ChatCB endpoint. Streams an SSE response with the AI answer
 * followed by a final `citations` event carrying structured knowledge-base
 * matches. The client can render the text progressively and append citations
 * once the stream completes.
 *
 * Request body: { question: string }
 *
 * Stream events:
 *   data: {"type":"delta","text":"..."}        — partial answer text
 *   data: {"type":"citations","items":[...]}   — CannabisConditionPair[]
 *   data: {"type":"done"}
 *   data: {"type":"error","message":"..."}
 */

interface DeltaEvent {
  type: "delta";
  text: string;
}
interface CitationsEvent {
  type: "citations";
  items: CannabisConditionPair[];
}
interface DoneEvent {
  type: "done";
}
interface ErrorEvent {
  type: "error";
  message: string;
}
type StreamEvent = DeltaEvent | CitationsEvent | DoneEvent | ErrorEvent;

export async function POST(request: Request) {
  const gate = await requireApiAuth({
    rateLimit: {
      limiter: agentInvocationLimiter,
      bucket: "agent.chat-cb",
    },
  });
  if (gate.error) return gate.error;

  let body: { question?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const question =
    typeof body.question === "string" && body.question.trim().length > 0
      ? body.question.trim().slice(0, 400)
      : null;

  if (!question) {
    return new Response(JSON.stringify({ error: "missing_question" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Search the local knowledge base to inject context and return as citations.
  const kbMatches = searchKnowledgeBase(question).slice(0, 5);

  const kbContext =
    kbMatches.length > 0
      ? `\n\nRelevant knowledge base entries:\n${kbMatches
          .map(
            (m) =>
              `• ${m.cannabinoid} / ${m.condition} [${EVIDENCE_COLORS[m.evidenceLevel].label}] (${m.studyCount} studies): ${m.summary}`,
          )
          .join("\n")}`
      : "";

  const systemPrompt = buildChatCBSystemPrompt();
  const userPrompt = `${systemPrompt}${kbContext}\n\nClinician question: ${question}`;

  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });

  const model = resolveModelClient();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: StreamEvent) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      try {
        if (model.stream) {
          for await (const delta of model.stream(userPrompt, {
            maxTokens: 600,
            temperature: 0.4,
            signal: abort.signal,
          })) {
            if (abort.signal.aborted) break;
            emit({ type: "delta", text: delta });
          }
        } else {
          const full = await model.complete(userPrompt, {
            maxTokens: 600,
            temperature: 0.4,
            signal: abort.signal,
          });
          emit({ type: "delta", text: full });
        }

        // Emit citations after the main answer so the client can append them.
        if (kbMatches.length > 0) {
          emit({ type: "citations", items: kbMatches });
        }
        emit({ type: "done" });
      } catch (err) {
        const msg = isModelError(err)
          ? err.friendly
          : err instanceof Error
            ? err.message
            : "AI generation failed.";
        emit({ type: "error", message: msg });
        logger.error({ event: "agent.chat-cb.stream_failed", err });
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

