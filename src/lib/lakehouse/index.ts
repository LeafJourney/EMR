/**
 * LeafBridge Lakehouse — public engine surface.
 *
 * The app-side, framework-free realization of the lakehouse zones documented in
 * `leafbridge/docs/architecture/lakehouse-zones.md`. Import the engine, ingest
 * FHIR resources, and query the Gold zone (read / vread / history / search /
 * $everything) plus the hash-chained Audit zone and the rollup catalog.
 */
export { LakehouseEngine } from "./engine";
export type { SearchOptions, SearchResult } from "./engine";
export { AuditLog, hash128 } from "./audit";
export { scoreConformance } from "./conformance";
export type { ConformanceCheck, ConformanceResult } from "./conformance";
export {
  SEARCH_PARAMS,
  paramsForType,
  extractSearchTokens,
  parseSearchArgs,
  tokenSetMatchesArg,
} from "./search-params";
export type { SearchParamDef } from "./search-params";
export { searchsetBundle, historyBundle, collectionBundle } from "./bundle";
export type {
  AuditEntry,
  Conformance,
  FhirBundle,
  FhirJson,
  LakehouseCatalog,
  ResourceTypeStat,
  SearchArg,
  SearchParamType,
  SearchToken,
  SourceProvenance,
  StoredResource,
  Zone,
  ZoneStat,
} from "./types";
