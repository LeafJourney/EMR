// EMR-724 — SaaS billing & AI brokering: usage roll-up (pure).
//
// Projects a window of LlmUsage rows into the totals + per-bucket + per-model
// breakdown the per-org cost dashboard renders. Pure (no I/O) so the
// aggregation is unit-testable without a database — the DB reader
// (llm-usage.ts) supplies the rows.

export interface LlmUsageRow {
  agentBucket: string;
  agentName: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costMicroCents: number | null;
  ok: boolean;
}

export interface LlmUsageGroup {
  key: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  tokensTotal: number;
  costMicroCents: number;
}

export interface LlmUsageSummary {
  totals: {
    calls: number;
    ok: number;
    failed: number;
    tokensIn: number;
    tokensOut: number;
    tokensTotal: number;
    costMicroCents: number;
  };
  byBucket: LlmUsageGroup[];
  byModel: LlmUsageGroup[];
}

function accumulate(
  map: Map<string, LlmUsageGroup>,
  key: string,
  row: LlmUsageRow,
): void {
  let g = map.get(key);
  if (!g) {
    g = {
      key,
      calls: 0,
      tokensIn: 0,
      tokensOut: 0,
      tokensTotal: 0,
      costMicroCents: 0,
    };
    map.set(key, g);
  }
  g.calls += 1;
  g.tokensIn += row.tokensIn;
  g.tokensOut += row.tokensOut;
  g.tokensTotal += row.tokensIn + row.tokensOut;
  g.costMicroCents += row.costMicroCents ?? 0;
}

const byTokensDesc = (a: LlmUsageGroup, b: LlmUsageGroup) =>
  b.tokensTotal - a.tokensTotal || a.key.localeCompare(b.key);

/** Roll a window of usage rows into totals + per-bucket + per-model groups. */
export function summarizeLlmUsage(rows: LlmUsageRow[]): LlmUsageSummary {
  const buckets = new Map<string, LlmUsageGroup>();
  const models = new Map<string, LlmUsageGroup>();

  let ok = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let costMicroCents = 0;

  for (const row of rows) {
    if (row.ok) ok += 1;
    tokensIn += row.tokensIn;
    tokensOut += row.tokensOut;
    costMicroCents += row.costMicroCents ?? 0;
    accumulate(buckets, row.agentBucket, row);
    accumulate(models, row.model, row);
  }

  return {
    totals: {
      calls: rows.length,
      ok,
      failed: rows.length - ok,
      tokensIn,
      tokensOut,
      tokensTotal: tokensIn + tokensOut,
      costMicroCents,
    },
    byBucket: [...buckets.values()].sort(byTokensDesc),
    byModel: [...models.values()].sort(byTokensDesc),
  };
}
