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
  type Citation,
} from "@/lib/domain/chatcb";
import { fetchPubMedCitations } from "@/lib/agents/research/pubmed-citation-service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/agents/chat-cb
 *
 * Conversational ChatCB endpoint. Streams an SSE response with the AI answer
 * followed by a final `citations` event carrying structured knowledge-base and
 * PubMed matches. If a standard JSON request (carrying `message`) is sent, it
 * returns a static JSON payload containing the complete answer and sources array.
 *
 * Request body: { question: string } or { message: string }
 *
 * Stream events:
 *   data: {"type":"delta","text":"..."}        — partial answer text
 *   data: {"type":"citations","items":[...]}   — Citation[]
 *   data: {"type":"done"}
 *   data: {"type":"error","message":"..."}
 */

interface DeltaEvent {
  type: "delta";
  text: string;
}
interface CitationsEvent {
  type: "citations";
  items: Citation[];
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

  let body: { question?: unknown; message?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawQuestion = body.question ?? body.message;
  const question =
    typeof rawQuestion === "string" && rawQuestion.trim().length > 0
      ? rawQuestion.trim().slice(0, 400)
      : null;

  if (!question) {
    return new Response(JSON.stringify({ error: "missing_question" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isSSE = body.question !== undefined;

  // Search the local knowledge base + fetch live PubMed citations in parallel
  const kbMatches = searchKnowledgeBase(question).slice(0, 5);
  const pubmedResult = await fetchPubMedCitations(question, { maxResults: 5 }).catch(
    (err) => {
      logger.error({ event: "agent.chat-cb.pubmed_failed", question, err });
      return { query: question, totalResults: 0, citations: [] as Citation[], searchTime: 0 };
    }
  );

  const kbCitations: Citation[] = kbMatches.map((m, i) => ({
    id: `kb-${i}`,
    title: `${m.cannabinoid} and ${m.condition}`,
    authors: "Cannabis Knowledge Base",
    journal: "Leafjourney Research Index",
    year: 2025,
    evidenceLevel: m.evidenceLevel,
    studyType: "review" as const,
    summary: m.summary,
  }));

  const citations: Citation[] = [
    ...pubmedResult.citations,
    ...kbCitations,
  ].slice(0, 8);

  const kbContext =
    kbMatches.length > 0
      ? "\n\nRelevant knowledge base entries:\n" +
        kbMatches
          .map(
            (m) =>
              `- ${m.cannabinoid} for ${m.condition} (${m.evidenceLevel}, ${m.studyCount} studies): ${m.summary}`
          )
          .join("\n")
      : "";

  const pubmedContext =
    pubmedResult.citations.length > 0
      ? "\n\nLive PubMed results (cite by PMID when relevant):\n" +
        pubmedResult.citations
          .map(
            (c) =>
              `- [PMID ${c.pmid}] ${c.title} — ${c.journal} ${c.year} (${c.evidenceLevel}): ${c.summary}`
          )
          .join("\n")
      : "";

  const systemPrompt = buildChatCBSystemPrompt();
  const userPrompt = `${systemPrompt}${kbContext}${pubmedContext}\n\nClinician question: ${question}`;

  const model = resolveModelClient();

  // If the request doesn't want SSE, return a unified JSON payload
  if (!isSSE) {
    try {
      const answer = await model.complete(userPrompt, {
        maxTokens: 600,
        temperature: 0.4,
      });

      const sources = citations.map((c) => (c.pmid ? `PMID ${c.pmid}` : c.title));

      return new Response(
        JSON.stringify({
          content: answer,
          sources,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (err) {
      const msg = isModelError(err)
        ? err.friendly
        : err instanceof Error
          ? err.message
          : "AI generation failed.";
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });

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

        // Emit merged citations after the main answer so the client can append them.
        if (citations.length > 0) {
          emit({ type: "citations", items: citations });
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

