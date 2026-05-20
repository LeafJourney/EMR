import type { DataClass } from "../shared/types";
import type { ContextFragment, TimeWindow } from "./types";
import { withinWindow } from "./fhir-source";

/**
 * Retrieves document / note chunks scored against a query. The
 * production implementation calls pgvector or Qdrant; MVP ships an
 * in-memory implementation that scores by lowercase term overlap so
 * tests stay deterministic.
 */
export interface VectorSource {
  search(input: {
    patientId: string;
    query: string;
    dataClasses: readonly DataClass[];
    window?: TimeWindow;
    specialty?: string;
    limit?: number;
  }): Promise<readonly ContextFragment[]>;
}

export interface SeededDocumentChunk extends ContextFragment {
  patientId: string;
  specialty?: string;
}

export class InMemoryVectorSource implements VectorSource {
  private readonly chunks: SeededDocumentChunk[] = [];

  seed(chunks: readonly SeededDocumentChunk[]): void {
    this.chunks.length = 0;
    this.chunks.push(...chunks);
  }

  async search(input: {
    patientId: string;
    query: string;
    dataClasses: readonly DataClass[];
    window?: TimeWindow;
    specialty?: string;
    limit?: number;
  }): Promise<readonly ContextFragment[]> {
    const terms = tokenize(input.query);
    const scored: { score: number; frag: ContextFragment }[] = [];
    for (const c of this.chunks) {
      if (c.patientId !== input.patientId) continue;
      if (!input.dataClasses.includes(c.dataClass)) continue;
      if (input.specialty && c.specialty && c.specialty !== input.specialty) continue;
      if (!withinWindow(c.citation.recordedAt, input.window)) continue;
      const score = overlapScore(terms, tokenize(c.text));
      if (score === 0 && terms.length > 0) continue;
      const { patientId: _pid, specialty: _sp, ...frag } = c;
      void _pid;
      void _sp;
      scored.push({ score, frag: { ...frag, score } });
    }
    scored.sort((a, b) => b.score - a.score);
    const limit = input.limit ?? 10;
    return scored.slice(0, limit).map((s) => s.frag);
  }
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);
}

function overlapScore(query: readonly string[], doc: readonly string[]): number {
  if (query.length === 0) return 0;
  const docSet = new Set(doc);
  let hits = 0;
  for (const t of query) if (docSet.has(t)) hits++;
  return hits / query.length;
}
