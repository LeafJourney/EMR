/**
 * LeafBridge Lakehouse — search-parameter registry + extractor.
 *
 * A pragmatic, US-Core-aligned subset of the FHIR search-parameter matrix. For
 * each resource type we declare the parameters the engine indexes, and a pure
 * extractor that flattens a resource's R4 JSON into a flat list of
 * `SearchToken`s. Search then becomes a token-match instead of a deep JSON
 * walk per query.
 *
 * This is intentionally compact (not the full 1,000+ SearchParameter set) — it
 * covers the parameters the Lakehouse Console and FHIR Explorer actually use:
 * the common demographic, terminology, reference, and date filters.
 */
import type { FhirJson, SearchArg, SearchParamType, SearchToken } from "./types";

export interface SearchParamDef {
  name: string;
  type: SearchParamType;
  /** Short human description shown in the console's capability matrix. */
  doc: string;
}

/** Parameters every resource supports (the FHIR "common" set we index). */
const COMMON_PARAMS: SearchParamDef[] = [
  { name: "_id", type: "token", doc: "Logical resource id" },
  { name: "_lastUpdated", type: "date", doc: "When the resource version was last changed" },
];

/** Per-resource-type indexed search parameters. */
export const SEARCH_PARAMS: Record<string, SearchParamDef[]> = {
  Patient: [
    { name: "name", type: "string", doc: "Any part of the patient's name" },
    { name: "family", type: "string", doc: "Family (last) name" },
    { name: "given", type: "string", doc: "Given (first) name" },
    { name: "gender", type: "token", doc: "Administrative gender" },
    { name: "birthdate", type: "date", doc: "Date of birth" },
    { name: "identifier", type: "token", doc: "A patient identifier (MRN, etc.)" },
  ],
  Encounter: [
    { name: "patient", type: "reference", doc: "The patient present at the encounter" },
    { name: "status", type: "token", doc: "planned | arrived | in-progress | finished" },
    { name: "class", type: "token", doc: "Encounter class (AMB, IMP, …)" },
    { name: "type", type: "token", doc: "Specific type of encounter" },
    { name: "date", type: "date", doc: "Encounter period start" },
  ],
  Observation: [
    { name: "patient", type: "reference", doc: "The subject of the observation" },
    { name: "code", type: "token", doc: "The observation code (LOINC)" },
    { name: "category", type: "token", doc: "vital-signs | laboratory | survey | …" },
    { name: "status", type: "token", doc: "registered | preliminary | final | …" },
    { name: "date", type: "date", doc: "Obtained date/time" },
  ],
  Condition: [
    { name: "patient", type: "reference", doc: "Who has the condition" },
    { name: "code", type: "token", doc: "Condition code (SNOMED / ICD-10)" },
    { name: "clinical-status", type: "token", doc: "active | recurrence | resolved | …" },
    { name: "category", type: "token", doc: "problem-list-item | encounter-diagnosis" },
    { name: "onset-date", type: "date", doc: "Date the condition began" },
  ],
  MedicationRequest: [
    { name: "patient", type: "reference", doc: "Who the prescription is for" },
    { name: "code", type: "token", doc: "Medication code (RxNorm)" },
    { name: "status", type: "token", doc: "active | completed | stopped | …" },
    { name: "intent", type: "token", doc: "proposal | plan | order | …" },
    { name: "authoredon", type: "date", doc: "When the request was authored" },
  ],
  MedicationStatement: [
    { name: "patient", type: "reference", doc: "Who the statement is about" },
    { name: "code", type: "token", doc: "Medication code (RxNorm)" },
    { name: "status", type: "token", doc: "active | completed | stopped | intended" },
    { name: "effective", type: "date", doc: "Date when the statement applies" },
  ],
  DiagnosticReport: [
    { name: "patient", type: "reference", doc: "The subject of the report" },
    { name: "code", type: "token", doc: "The report code (LOINC panel)" },
    { name: "status", type: "token", doc: "registered | partial | final | …" },
    { name: "date", type: "date", doc: "Clinically relevant date" },
  ],
  DocumentReference: [
    { name: "patient", type: "reference", doc: "Who the document is about" },
    { name: "type", type: "token", doc: "Kind of document (LOINC)" },
    { name: "status", type: "token", doc: "current | superseded | …" },
    { name: "date", type: "date", doc: "When the document was created" },
  ],
};

/** All indexed parameters (common + type-specific) for a resource type. */
export function paramsForType(resourceType: string): SearchParamDef[] {
  return [...COMMON_PARAMS, ...(SEARCH_PARAMS[resourceType] ?? [])];
}

// ---------------------------------------------------------------------------
// Extraction helpers — pure, defensive readers over loose FHIR JSON.
// ---------------------------------------------------------------------------

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

/** Reference string, e.g. "Patient/123" → bare id "123" (and the full ref). */
function refTokens(name: string, ref: unknown): SearchToken[] {
  const r = str(asObj(ref)?.reference) ?? str(ref);
  if (!r) return [];
  const bareId = r.includes("/") ? r.slice(r.lastIndexOf("/") + 1) : r;
  const out: SearchToken[] = [{ name, type: "reference", value: r.toLowerCase() }];
  if (bareId && bareId !== r) out.push({ name, type: "reference", value: bareId.toLowerCase() });
  return out;
}

/** All codings inside a CodeableConcept → token rows (system + code + text). */
function conceptTokens(name: string, concept: unknown): SearchToken[] {
  const c = asObj(concept);
  if (!c) return [];
  const out: SearchToken[] = [];
  for (const coding of asArr(c.coding)) {
    const co = asObj(coding);
    const code = str(co?.code);
    if (code) out.push({ name, type: "token", value: code.toLowerCase(), system: str(co?.system) });
  }
  const text = str(c.text);
  if (text) out.push({ name, type: "string", value: text.toLowerCase() });
  return out;
}

/** Extract a date (date | dateTime | Period.start | instant) as ISO-ish text. */
function dateValue(v: unknown): string | undefined {
  if (typeof v === "string" && v) return v;
  const p = asObj(v);
  if (p) return str(p.start) ?? str(p.dateTime) ?? str(p.value);
  return undefined;
}

/**
 * Flatten a resource into its indexable search tokens. Always emits the common
 * `_id` / `_lastUpdated` tokens, then the type-specific set.
 */
export function extractSearchTokens(resource: FhirJson): SearchToken[] {
  const tokens: SearchToken[] = [];
  const push = (t: SearchToken | undefined) => {
    if (t && t.value) tokens.push(t);
  };

  const id = str(resource.id);
  if (id) push({ name: "_id", type: "token", value: id.toLowerCase() });
  const lu = str(resource.meta?.lastUpdated);
  if (lu) push({ name: "_lastUpdated", type: "date", value: lu });

  switch (resource.resourceType) {
    case "Patient": {
      for (const nm of asArr(resource.name)) {
        const n = asObj(nm);
        const family = str(n?.family);
        const given = asArr(n?.given).map(str).filter(Boolean) as string[];
        if (family) push({ name: "family", type: "string", value: family.toLowerCase() });
        for (const g of given) push({ name: "given", type: "string", value: g.toLowerCase() });
        // FHIR string search on `name` matches the start of ANY name part, so
        // index the full string plus each individual word as its own token.
        const full = [...given, family].filter(Boolean).join(" ");
        if (full) push({ name: "name", type: "string", value: full.toLowerCase() });
        for (const part of [family, ...given]) {
          if (part) push({ name: "name", type: "string", value: part.toLowerCase() });
        }
      }
      push({ name: "gender", type: "token", value: (str(resource.gender) ?? "").toLowerCase() });
      const bd = str(resource.birthDate);
      if (bd) push({ name: "birthdate", type: "date", value: bd });
      for (const idf of asArr(resource.identifier)) {
        const v = str(asObj(idf)?.value);
        if (v) push({ name: "identifier", type: "token", value: v.toLowerCase(), system: str(asObj(idf)?.system) });
      }
      break;
    }
    case "Encounter": {
      tokens.push(...refTokens("patient", resource.subject));
      push({ name: "status", type: "token", value: (str(resource.status) ?? "").toLowerCase() });
      const cls = asObj(resource.class);
      const clsCode = str(cls?.code) ?? str(resource.class);
      if (clsCode) push({ name: "class", type: "token", value: clsCode.toLowerCase(), system: str(cls?.system) });
      for (const t of asArr(resource.type)) tokens.push(...conceptTokens("type", t));
      const d = dateValue(resource.period);
      if (d) push({ name: "date", type: "date", value: d });
      break;
    }
    case "Observation": {
      tokens.push(...refTokens("patient", resource.subject));
      tokens.push(...conceptTokens("code", resource.code));
      for (const cat of asArr(resource.category)) tokens.push(...conceptTokens("category", cat));
      push({ name: "status", type: "token", value: (str(resource.status) ?? "").toLowerCase() });
      const d = dateValue(resource.effectiveDateTime ?? resource.effectivePeriod ?? resource.issued);
      if (d) push({ name: "date", type: "date", value: d });
      break;
    }
    case "Condition": {
      tokens.push(...refTokens("patient", resource.subject));
      tokens.push(...conceptTokens("code", resource.code));
      tokens.push(...conceptTokens("clinical-status", resource.clinicalStatus));
      for (const cat of asArr(resource.category)) tokens.push(...conceptTokens("category", cat));
      const d = dateValue(resource.onsetDateTime ?? resource.onsetPeriod);
      if (d) push({ name: "onset-date", type: "date", value: d });
      break;
    }
    case "MedicationRequest": {
      tokens.push(...refTokens("patient", resource.subject));
      tokens.push(...conceptTokens("code", resource.medicationCodeableConcept));
      push({ name: "status", type: "token", value: (str(resource.status) ?? "").toLowerCase() });
      push({ name: "intent", type: "token", value: (str(resource.intent) ?? "").toLowerCase() });
      const d = dateValue(resource.authoredOn);
      if (d) push({ name: "authoredon", type: "date", value: d });
      break;
    }
    case "MedicationStatement": {
      tokens.push(...refTokens("patient", resource.subject));
      tokens.push(...conceptTokens("code", resource.medicationCodeableConcept));
      push({ name: "status", type: "token", value: (str(resource.status) ?? "").toLowerCase() });
      const d = dateValue(resource.effectiveDateTime ?? resource.effectivePeriod);
      if (d) push({ name: "effective", type: "date", value: d });
      break;
    }
    case "DiagnosticReport": {
      tokens.push(...refTokens("patient", resource.subject));
      tokens.push(...conceptTokens("code", resource.code));
      push({ name: "status", type: "token", value: (str(resource.status) ?? "").toLowerCase() });
      const d = dateValue(resource.effectiveDateTime ?? resource.issued);
      if (d) push({ name: "date", type: "date", value: d });
      break;
    }
    case "DocumentReference": {
      tokens.push(...refTokens("patient", resource.subject));
      tokens.push(...conceptTokens("type", resource.type));
      push({ name: "status", type: "token", value: (str(resource.status) ?? "").toLowerCase() });
      const d = dateValue(resource.date);
      if (d) push({ name: "date", type: "date", value: d });
      break;
    }
    default:
      // Unknown type: only the common tokens are indexed.
      break;
  }
  return tokens.filter((t) => t.value);
}

// ---------------------------------------------------------------------------
// Matching — given parsed `SearchArg`s, decide whether a token set matches.
// ---------------------------------------------------------------------------

/** Parse a date-prefix argument (eq/ge/le/gt/lt) per FHIR date search. */
function parseDatePrefix(raw: string): { op: string; val: string } {
  const m = /^(eq|ne|ge|le|gt|lt|sa|eb)(.*)$/.exec(raw);
  if (m) return { op: m[1], val: m[2] };
  return { op: "eq", val: raw };
}

/** Compare two ISO-ish date strings lexically (works for YYYY-MM-DD[THH…]). */
function dateCmp(a: string, b: string): number {
  // Truncate to the shorter common precision so "2024" matches "2024-03-01".
  const n = Math.min(a.length, b.length);
  return a.slice(0, n) < b.slice(0, n) ? -1 : a.slice(0, n) > b.slice(0, n) ? 1 : 0;
}

function matchesToken(arg: SearchArg, tokens: SearchToken[]): boolean {
  const candidates = tokens.filter((t) => t.name === arg.name);
  if (candidates.length === 0) return false;
  // token search supports "system|code", "|code", or bare "code".
  const [sysPart, codePart] = arg.value.includes("|") ? arg.value.split("|") : [undefined, arg.value];
  const wantCode = (codePart ?? "").toLowerCase();
  const wantSys = sysPart ? sysPart : undefined;
  return candidates.some((t) => {
    if (arg.modifier === "not") return false; // handled by caller-level negation
    if (t.type === "date" || t.type === "number") return false;
    const codeOk = wantCode === "" || t.value === wantCode;
    const sysOk = wantSys === undefined || wantSys === "" || (t.system ?? "") === wantSys;
    return codeOk && sysOk;
  });
}

function matchesString(arg: SearchArg, tokens: SearchToken[]): boolean {
  const candidates = tokens.filter((t) => t.name === arg.name);
  if (candidates.length === 0) return false;
  const needle = arg.value.toLowerCase();
  return candidates.some((t) => {
    if (arg.modifier === "exact") return t.value === needle;
    if (arg.modifier === "contains") return t.value.includes(needle);
    return t.value.startsWith(needle); // FHIR default: starts-with, case-insensitive
  });
}

function matchesReference(arg: SearchArg, tokens: SearchToken[]): boolean {
  const candidates = tokens.filter((t) => t.name === arg.name);
  if (candidates.length === 0) return false;
  const want = arg.value.toLowerCase();
  const bare = want.includes("/") ? want.slice(want.lastIndexOf("/") + 1) : want;
  return candidates.some((t) => t.value === want || t.value === bare);
}

function matchesDate(arg: SearchArg, tokens: SearchToken[]): boolean {
  const candidates = tokens.filter((t) => t.name === arg.name);
  if (candidates.length === 0) return false;
  const { op, val } = parseDatePrefix(arg.value);
  return candidates.some((t) => {
    const c = dateCmp(t.value, val);
    switch (op) {
      case "eq": return c === 0;
      case "ne": return c !== 0;
      case "gt": case "sa": return c > 0;
      case "lt": case "eb": return c < 0;
      case "ge": return c >= 0;
      case "le": return c <= 0;
      default: return c === 0;
    }
  });
}

/**
 * Does a resource's token set satisfy one search argument? Resolves the
 * parameter's declared type from the registry to pick the right matcher.
 */
export function tokenSetMatchesArg(resourceType: string, arg: SearchArg, tokens: SearchToken[]): boolean {
  const def = paramsForType(resourceType).find((p) => p.name === arg.name);
  // Unknown params are ignored (treated as a non-constraint), matching lenient
  // FHIR server behavior rather than erroring the whole search.
  if (!def) return true;
  let result: boolean;
  switch (def.type) {
    case "string": result = matchesString(arg, tokens); break;
    case "reference": result = matchesReference(arg, tokens); break;
    case "date": result = matchesDate(arg, tokens); break;
    case "token": case "number": default: result = matchesToken(arg, tokens); break;
  }
  return arg.modifier === "not" ? !result : result;
}

/** Parse a flat query map (`{ name: "jane", "birthdate": "ge1980" }`) → args. */
export function parseSearchArgs(query: Record<string, string | string[] | undefined>): SearchArg[] {
  const args: SearchArg[] = [];
  for (const [key, raw] of Object.entries(query)) {
    if (raw == null) continue;
    // Skip result-control params; they aren't filters.
    const base = key.split(":")[0];
    if (["_count", "_sort", "_include", "_summary", "_offset", "_total"].includes(base)) continue;
    const [name, modifier] = key.split(":");
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (value === "") continue;
      args.push({ name, modifier, value });
    }
  }
  return args;
}
