import type { DataClass } from "../shared/types";
import type { ContextFragment, TimeWindow } from "./types";

/**
 * Retrieves structured FHIR resources for a patient. The production
 * implementation talks to the FHIR server (Module 2). For MVP and
 * tests we ship an in-memory source backed by a seeded array of
 * fragments.
 */
export interface FhirSource {
  fetch(input: {
    patientId: string;
    dataClasses: readonly DataClass[];
    window?: TimeWindow;
    specialty?: string;
    limit?: number;
  }): Promise<readonly ContextFragment[]>;
}

export interface SeededResource extends ContextFragment {
  patientId: string;
  specialty?: string;
}

/** In-memory FHIR source. Useful for tests and local dev. */
export class InMemoryFhirSource implements FhirSource {
  private readonly resources: SeededResource[] = [];

  seed(resources: readonly SeededResource[]): void {
    this.resources.length = 0;
    this.resources.push(...resources);
  }

  async fetch(input: {
    patientId: string;
    dataClasses: readonly DataClass[];
    window?: TimeWindow;
    specialty?: string;
    limit?: number;
  }): Promise<readonly ContextFragment[]> {
    const out: ContextFragment[] = [];
    for (const r of this.resources) {
      if (r.patientId !== input.patientId) continue;
      if (!input.dataClasses.includes(r.dataClass)) continue;
      if (input.specialty && r.specialty && r.specialty !== input.specialty) continue;
      if (!withinWindow(r.citation.recordedAt, input.window)) continue;
      const { patientId: _pid, specialty: _sp, ...frag } = r;
      void _pid;
      void _sp;
      out.push(frag);
    }
    const limit = input.limit ?? 20;
    return out.slice(0, limit);
  }
}

export function withinWindow(at: string | undefined, window?: TimeWindow): boolean {
  if (!window) return true;
  if (!at) return true; // undated resources are kept
  if (window.from && at < window.from) return false;
  if (window.to && at > window.to) return false;
  return true;
}
