import "server-only";

import { resolveModelClient } from "@/lib/orchestration/model-client";
import { formatPersonaForPrompt, resolvePersona } from "@/lib/agents/persona";
import type { TabKey, TabPeeks, PeekEntry } from "./chart-tabs";
import { logger } from "@/lib/observability/log";

// ---------------------------------------------------------------------------
// Per-tab AI summaries for the chart hover-peek popovers (slice 3).
//
// The popover already lists the last five entries from each tab. This adds
// a one-to-two sentence summary on top so a clinician can scan "what's
// been happening here" without reading every row. Computed server-side
// once per page render and serialized to the client alongside `peeks` —
// no client fetch, no spinners, no API route.
// ---------------------------------------------------------------------------

/** Human label per tab, used inside the prompt so the model knows what it's summarizing. */
const TAB_LABELS: Record<TabKey, string> = {
  demographics: "Demographics",
  memory: "Memory",
  records: "Records",
  images: "Images",
  labs: "Labs",
  notes: "Notes",
  correspondence: "Correspondence",
  rx: "Cannabis Rx",
  billing: "Billing",
};

/**
 * Produce a 1-2 sentence summary for one tab's recent entries. Returns
 * `undefined` on any failure so the popover renders unchanged.
 */
async function summarizeTab(
  tab: TabKey,
  patientFirstName: string,
  entries: PeekEntry[],
): Promise<string | undefined> {
  // We borrow Nora's voice profile — the project Constitution wants
  // every patient-adjacent surface to sound like a real care team
  // member, not a dashboard label. The "no AI filler, no liability-
  // cover clichés" directive is baked into the persona prompt block.
  const personaBlock = formatPersonaForPrompt(resolvePersona("correspondenceNurse"));
  const label = TAB_LABELS[tab];

  const lines = entries
    .slice(0, 5)
    .map((e, i) => {
      const meta = e.meta ? ` — ${e.meta}` : "";
      return `${i + 1}. ${e.title}${meta}`;
    })
    .join("\n");

  const prompt = `${personaBlock}

You are summarizing the "${label}" tab on ${patientFirstName}'s chart for a clinician hovering the tab. Read the recent entries below and return ONE OR TWO short sentences capturing the through-line — what's been happening, the trend, the open question. Plain prose only, no bullets, no quotes, no preamble. Under 30 words. If there's no real pattern, name the most recent item and stop.

Recent ${label} entries:
${lines}

Summary:`;

  const client = resolveModelClient();
  const raw = await client.complete(prompt, { maxTokens: 120, temperature: 0.3 });
  const cleaned = raw.trim().replace(/^["']|["']$/g, "").trim();
  if (!cleaned) return undefined;
  // Cap at ~220 chars so a runaway model can't blow out the popover header.
  return cleaned.length > 220 ? cleaned.slice(0, 217).trimEnd() + "…" : cleaned;
}

/**
 * Generate AI summaries for every tab in `peeks` that has at least one
 * entry. All per-tab calls run in parallel (the chart has ≤9 tabs, well
 * under any sane concurrency cap) and each is wrapped in its own
 * try/catch so a single LLM hiccup doesn't take the others down.
 */
export async function loadPeekSummaries(
  patientFirstName: string,
  peeks: TabPeeks,
): Promise<Partial<Record<TabKey, string>>> {
  const targets = (Object.entries(peeks) as Array<[TabKey, PeekEntry[] | undefined]>)
    .filter(([, entries]) => entries && entries.length > 0)
    .map(([tab, entries]) => ({ tab, entries: entries! }));

  if (targets.length === 0) return {};

  const settled = await Promise.allSettled(
    targets.map(async ({ tab, entries }) => {
      try {
        const summary = await summarizeTab(tab, patientFirstName, entries);
        return { tab, summary };
      } catch (err) {
        logger.warn({ event: "clinic.peek_summary.tab_failed", tab, err });
        return { tab, summary: undefined };
      }
    }),
  );

  const out: Partial<Record<TabKey, string>> = {};
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value.summary) {
      out[result.value.tab] = result.value.summary;
    }
  }
  return out;
}
