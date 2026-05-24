import type { DataClass } from "../shared/types";

/**
 * Minimum-necessary filter. Every concrete resource the platform serves
 * is described as a record with field → data-class mapping. When the
 * policy gateway approves a subset of data classes, this helper strips
 * fields whose data class isn't in the cleared set.
 *
 * The contract is intentionally generic so callers can use plain
 * objects without forcing the platform to invent a FHIR-shaped wrapper.
 */

export type FieldDataClassMap = Record<string, DataClass>;

/** Strip fields whose data class isn't permitted. Returns a new object. */
export function filterFields<T extends Record<string, unknown>>(
  resource: T,
  fieldClasses: FieldDataClassMap,
  allowed: readonly DataClass[],
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(resource) as (keyof T & string)[]) {
    const cls = fieldClasses[key];
    if (!cls) continue;
    if (allowed.includes(cls)) {
      out[key] = resource[key];
    }
  }
  return out;
}

/**
 * Reduce a list of requested field names to the ones the cleared data
 * classes cover. Returns the field names in their original order so
 * downstream consumers can produce stable output / cache keys.
 */
export function allowedFieldList(
  requested: readonly string[],
  fieldClasses: FieldDataClassMap,
  allowed: readonly DataClass[],
): readonly string[] {
  return requested.filter((f) => {
    const cls = fieldClasses[f];
    return cls !== undefined && allowed.includes(cls);
  });
}
