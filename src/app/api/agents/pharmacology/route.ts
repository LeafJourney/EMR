import {
  isModelError,
  resolveModelClient,
} from "@/lib/orchestration/model-client";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { agentInvocationLimiter } from "@/lib/auth/rate-limit";

/**
 * POST /api/agents/pharmacology
 *
 * Streams a personalized patient-education document for a given diagnosis,
 * producing BOTH the plain-language (3rd-grade) view and the clinical view in
 * parallel. Output is multiplexed onto a single SSE stream so the client can
 * progressively render either tab the user is currently looking at.
 *
 * Request body:
 *   { diagnosis: string, icd10?: string }
 *
 * Response (text/event-stream):
 *   data: {"type":"chunk","view":"plain","field":"intro","delta":"Pain..."}
 *   data: {"type":"chunk","view":"clinical","field":"howItWorks","delta":"..."}
 *   data: {"type":"field_done","view":"plain","field":"intro"}
 *   data: {"type":"view_done","view":"plain"}
 *   data: {"type":"done"}
 *   data: {"type":"error","code":"...","message":"..."}
 */

export const runtime = "nodejs";
export const maxDuration = 60;

type View = "plain" | "clinical";
type Field = "title" | "intro" | "howItWorks" | "tip";

interface ChunkEvent {
  type: "chunk";
  view: View;
  field: Field;
  delta: string;
}
interface FieldDoneEvent {
  type: "field_done";
  view: View;
  field: Field;
}
interface ViewDoneEvent {
  type: "view_done";
  view: View;
}
interface DoneEvent {
  type: "done";
}
interface ErrorEvent {
  type: "error";
  code: string;
  message: string;
}
type StreamEvent =
  | ChunkEvent
  | FieldDoneEvent
  | ViewDoneEvent
  | DoneEvent
  | ErrorEvent;

/**
 * Section markers we instruct the model to emit. Chosen to be unlikely to
 * appear in normal prose so we can split the stream as it arrives.
 */
const MARKERS: Record<Field, string> = {
  title: "§§TITLE§§",
  intro: "§§INTRO§§",
  howItWorks: "§§HOW§§",
  tip: "§§TIP§§",
};

const FIELD_ORDER: Field[] = ["title", "intro", "howItWorks", "tip"];

function buildPrompt(view: View, diagnosis: string, icd10: string): string {
  const shared = `You are writing a patient-education document for a person diagnosed with ${diagnosis} (ICD-10 ${icd10}). The document explains how cannabis-based therapy can help.

Output MUST follow this exact section format. Emit each marker on its own line, immediately followed by the section content. Do NOT include any other prose, headers, or commentary.

${MARKERS.title}
<one short title line>
${MARKERS.intro}
<2-3 sentences introducing the condition>
${MARKERS.howItWorks}
<2-3 sentences explaining how cannabis interacts with this condition>
${MARKERS.tip}
<one short tip>
${MARKERS.tip}
<one short tip>
${MARKERS.tip}
<one short tip>
`;

  if (view === "plain") {
    return `${shared}
TONE: warm, reassuring, written at a 3rd-grade reading level. Use short sentences (under 15 words). Use everyday words. Speak directly to the patient ("you", "your"). Never say "consult your doctor" — we ARE the care team. Never say "as an AI".`;
  }

  return `${shared}
TONE: clinical and precise, suitable for a referring physician. Use correct medical terminology, ICD-10 references where appropriate, and reference the endocannabinoid system (CB1/CB2 receptors) where relevant. Cite mechanism, not lifestyle advice.`;
}

interface FieldRouter {
  push(delta: string): void;
  /** Flush remaining buffer and close the active field. */
  close(): void;
  /** True if any marker was ever encountered. */
  sawMarker(): boolean;
}

/**
 * Streaming parser: feed it raw deltas from the LLM, it dispatches per-field
 * `chunk` and `field_done` events. Markers are stripped; everything else is
 * routed to the field most recently opened.
 */
function makeFieldRouter(
  view: View,
  emit: (event: StreamEvent) => void
): FieldRouter {
  let buffer = "";
  let currentField: Field | null = null;
  let sawMarker = false;
  // Markers are short and stable, so a "look-behind" of the longest marker
  // length prevents us from emitting a partial marker as content.
  const longestMarker = Math.max(...Object.values(MARKERS).map((m) => m.length));

  function closeField() {
    if (currentField !== null) {
      emit({ type: "field_done", view, field: currentField });
      currentField = null;
    }
  }

  function drain(force: boolean) {
    while (true) {
      // Find the earliest marker in the buffer.
      let earliestIdx = -1;
      let earliestField: Field | null = null;
      for (const field of FIELD_ORDER) {
        const idx = buffer.indexOf(MARKERS[field]);
        if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
          earliestIdx = idx;
          earliestField = field;
        }
      }

      if (earliestIdx === -1) {
        // No complete marker in the buffer. Flush everything except the last
        // `longestMarker - 1` chars (which might be the start of a marker we
        // haven't fully received yet). On final flush, drain everything.
        const keepBack = force ? 0 : longestMarker - 1;
        if (buffer.length > keepBack) {
          const flushable = buffer.slice(0, buffer.length - keepBack);
          if (currentField !== null && flushable.length > 0) {
            emit({
              type: "chunk",
              view,
              field: currentField,
              delta: flushable,
            });
          }
          buffer = buffer.slice(buffer.length - keepBack);
        }
        return;
      }

      // Emit anything before the marker into the current field.
      const before = buffer.slice(0, earliestIdx);
      if (currentField !== null && before.length > 0) {
        emit({ type: "chunk", view, field: currentField, delta: before });
      }
      // Close the previous field (we're entering a new one).
      closeField();
      sawMarker = true;
      currentField = earliestField;
      buffer = buffer.slice(earliestIdx + MARKERS[earliestField!].length);
      // Strip the leading newline that follows each marker label.
      buffer = buffer.replace(/^[ \t]*\r?\n/, "");
    }
  }

  return {
    push(delta: string) {
      buffer += delta;
      drain(false);
    },
    close() {
      drain(true);
      closeField();
    },
    sawMarker() {
      return sawMarker;
    },
  };
}

async function pumpView(
  view: View,
  diagnosis: string,
  icd10: string,
  signal: AbortSignal,
  emit: (event: StreamEvent) => void
): Promise<void> {
  const model = resolveModelClient();
  if (!model.stream) {
    throw new Error("Model client does not support streaming.");
  }

  const prompt = buildPrompt(view, diagnosis, icd10);
  const router = makeFieldRouter(view, emit);

  for await (const delta of model.stream(prompt, {
    maxTokens: 800,
    temperature: view === "plain" ? 0.5 : 0.3,
    signal,
  })) {
    if (signal.aborted) return;
    router.push(delta);
  }

  router.close();

  if (!router.sawMarker()) {
    // Model ignored the marker format. Emit a clear notice so the UI can
    // surface the failure rather than silently rendering nothing.
    emit({
      type: "chunk",
      view,
      field: "intro",
      delta: "(The AI returned content in an unexpected format. Try regenerating.)",
    });
    emit({ type: "field_done", view, field: "intro" });
  }

  emit({ type: "view_done", view });
}

export async function POST(request: Request) {
  // Auth + rate limit BEFORE we touch the body — an unauthed caller
  // shouldn't even consume the request stream, let alone reach the
  // upstream LLM that this endpoint fans out to.
  const gate = await requireApiAuth({
    rateLimit: {
      limiter: agentInvocationLimiter,
      bucket: "agent.pharmacology",
    },
  });
  if (gate.error) return gate.error;

  let body: { diagnosis?: unknown; icd10?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid_json" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const diagnosis =
    typeof body.diagnosis === "string" && body.diagnosis.trim().length > 0
      ? body.diagnosis.trim().slice(0, 200)
      : null;
  const icd10 =
    typeof body.icd10 === "string" && body.icd10.trim().length > 0
      ? body.icd10.trim().slice(0, 20)
      : "";

  if (!diagnosis) {
    return new Response(
      JSON.stringify({ error: "missing_diagnosis" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const abort = new AbortController();
  // Cancel both LLM calls when the client disconnects.
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: StreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // Run plain + clinical generations in parallel. SSE multiplexes them.
        await Promise.all([
          pumpView("plain", diagnosis, icd10, abort.signal, emit),
          pumpView("clinical", diagnosis, icd10, abort.signal, emit),
        ]);
        emit({ type: "done" });
      } catch (err) {
        const friendly = isModelError(err)
          ? err.friendly
          : err instanceof Error
            ? err.message
            : "AI generation failed.";
        const code = isModelError(err) ? err.code : "unknown";
        emit({ type: "error", code, message: friendly });
        console.error("[api/agents/pharmacology] stream error:", err);
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
      // Disable buffering on platforms that respect it (Vercel/Render).
      "X-Accel-Buffering": "no",
    },
  });
}
