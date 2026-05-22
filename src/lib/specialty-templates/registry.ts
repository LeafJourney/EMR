/**
 * Specialty Template Registry — EMR-408 / EMR-431 / EMR-433
 *
 * Single source of truth for the specialty manifests that the Practice
 * Onboarding Controller (EMR-409+) uses to seed a draft PracticeConfiguration
 * and that published practices reference for runtime rendering.
 *
 * Architecture invariants (HARD constraints):
 *   - LeafJourney is specialty-adaptive, NOT cannabis-first. The registry
 *     never branches on `slug === 'cannabis-medicine'`. Cannabis behaviour
 *     is a manifest configuration — not a controller code path.
 *   - Adding a new specialty MUST be a manifest file drop under ./manifests/.
 *     This file should not need to change for new specialties OR new versions
 *     of existing specialties.
 *   - Pain Management (non-cannabis) is the v1 acceptance gate: its manifest
 *     MUST list "cannabis-medicine" in default_disabled_modalities (not just
 *     omit it from enabled). The registry trusts the manifest.
 *
 * Boot behaviour (EMR-433 + EMR-431):
 *   At module-init time the registry enumerates ./manifests/ via readdirSync,
 *   dynamic-loads every `*.ts` file (flat layout) and every `{slug}/v*.ts`
 *   file (versioned layout) via `createRequire`, validates each with
 *   SpecialtyManifestSchema, and indexes by `slug@version`. It throws if ANY
 *   manifest is invalid OR if the same `(slug, version)` is registered twice.
 *
 *   Files matching `/test-fixture-/` are skipped UNLESS NODE_ENV === 'test',
 *   so the test fixture specialty does not pollute production listings.
 *
 * Versioning model (EMR-431):
 *   - Each manifest carries a semver `version`. Editing a template ships as a
 *     NEW manifest at a new version — the previous version remains accessible
 *     so any published config that recorded `(slug, version)` continues to
 *     render against the manifest it was published with.
 *   - Manifests can opt out of NEW onboarding by setting `deprecated: true`.
 *     Deprecated manifests do NOT appear in `listActiveSpecialtyTemplates()`
 *     and `applyTemplateDefaults` throws "DEPRECATED_TEMPLATE" against them.
 *     Exact-version lookups still resolve so existing configs keep rendering.
 */



import {
  validateManifest,
  type AgentDescriptor,
  type SpecialtyManifest,
} from "@/lib/specialty-templates/manifest-schema";

// TODO(EMR-409): integrate once the practice-config types branch lands.
type PracticeConfigurationSeed = {
  selectedSpecialty: string;
  selectedSpecialtyVersion: string;
  careModel: string;
  enabledModalities: string[];
  disabledModalities: string[];
  workflowTemplateIds: string[];
  chartingTemplateIds: string[];
  physicianShellTemplateId: string | null;
  patientShellTemplateId: string | null;
};

type RegistryEntry = SpecialtyManifest & {
  /**
   * Legacy `active` flag from EMR-408. EMR-431 prefers the schema-level
   * `deprecated` field, but `active: false` on the raw object remains an
   * opt-out from listActive.
   */
  active: boolean;
  /** Source path the manifest was loaded from — for error messages. */
  source: string;
};

const TEST_FIXTURE_PATTERN = /test-fixture-/;

/**
 * Composite key. Public callers should use `getSpecialtyTemplate(slug, version)`
 * rather than constructing this themselves.
 */
function versionKey(slug: string, version: string): string {
  return `${slug}@${version}`;
}

/**
 * Compare two semver strings. Negative when a < b, positive when a > b, zero
 * when equal. Supports MAJOR.MINOR.PATCH with optional `-prerelease`.
 */
function compareSemver(a: string, b: string): number {
  const [aCore, aPre] = a.split("-", 2);
  const [bCore, bPre] = b.split("-", 2);

  const aParts = aCore.split(".").map((n) => Number.parseInt(n, 10));
  const bParts = bCore.split(".").map((n) => Number.parseInt(n, 10));

  for (let i = 0; i < 3; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }

  // Per semver: a version with a pre-release tag is LOWER than the same
  // version without one. So 1.0.0 > 1.0.0-rc.1.
  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;
  if (aPre && bPre) return aPre.localeCompare(bPre);
  return 0;
}

/** Registry indexed by `slug@version`. The authoritative store. */
const REGISTRY: Map<string, RegistryEntry> = new Map();

/**
 * Latest non-deprecated version per slug. When every version of a slug is
 * deprecated, the slug has NO entry here.
 */
const LATEST_BY_SLUG: Map<string, string> = new Map();

/**
 * Pull the manifest object out of a freshly-loaded module record. Manifests
 * are exported as `export default <object>`, but we accept any non-null
 * object export to remain forgiving of CJS/ESM interop.
 */
function extractManifest(mod: unknown): unknown {
  if (mod === null || typeof mod !== "object") return mod;
  const m = mod as Record<string, unknown>;
  if ("default" in m && m.default && typeof m.default === "object") {
    return m.default;
  }
  return mod;
}

/**
 * Discover and load every manifest file under ./manifests/. Returns an
 * iterable of `{ key, raw }` where `key` is a stable identifier for error
 * messages and `raw` is the manifest object.
 *
 * Two runtime paths are supported:
 *   1. Webpack/Next.js — uses `require.context` so manifests are discovered
 *      at build time and statically baked into the bundle.
 *   2. Node/Vitest — uses `fs.readdirSync` + `createRequire`. This mirrors
 *      the original EMR-433 loader and is the path Vitest hits because
 *      `require.context` is a Webpack-only API.
 *
 * We prefer (1) when present (production, `next dev`, `next build`) and
 * fall back to (2) otherwise. The fallback is also used when `require` is
 * an ESM bridge that doesn't expose `.context` (the symptom that breaks
 * Vitest with "require.context is not a function").
 */
function discoverManifestSources(): Array<{ key: string; raw: unknown }> {
  const out: Array<{ key: string; raw: unknown }> = [];

  // Path 1: Vitest (Vite runtime).
  // Use Vite's `import.meta.glob` with `eager: true` so manifests are
  // discovered and transformed through vite-node, not Node's native require.
  // This is the only path that works on Node 20 in CI, since Node <22 cannot
  // strip TypeScript syntax when requiring `.ts` files directly.
  if (process.env.VITEST) {
    // @ts-ignore - import.meta.glob is a Vite-only API
    const modules = import.meta.glob("./manifests/**/*.ts", { eager: true }) as Record<string, unknown>;
    for (const [key, mod] of Object.entries(modules)) {
      if (key.endsWith(".d.ts") || key.endsWith(".test.ts")) continue;
      out.push({ key, raw: extractManifest(mod) });
    }
    return out;
  }

  // Path 2: Webpack / Next.js
  // We MUST use the exact literal `require.context` for Webpack to statically analyze it.
  // @ts-ignore - require.context is a Webpack specific API
  const requireCtx = require.context("./manifests", true, /\.ts$/);
  for (const key of requireCtx.keys()) {
    if (key.endsWith(".d.ts") || key.endsWith(".test.ts")) continue;
    out.push({ key, raw: extractManifest(requireCtx(key)) });
  }

  return out;
}

function loadManifests(): void {
  REGISTRY.clear();
  LATEST_BY_SLUG.clear();

  const includeTestFixtures = process.env.NODE_ENV === "test";

  const sources = discoverManifestSources();

  // First pass: validate + index every discovered manifest.
  for (const { key, raw: rawSource } of sources) {
    const basename = key.slice(key.lastIndexOf("/") + 1);
    if (!includeTestFixtures && TEST_FIXTURE_PATTERN.test(basename)) {
      continue;
    }

    let raw: unknown;
    try {
      raw = rawSource;
    } catch (err) {
      throw new Error(
        `[specialty-templates] failed to load manifest "${key}": ` +
          `${(err as Error).message}`,
      );
    }

    const result = validateManifest(raw);
    if (!result.ok) {
      throw new Error(
        `[specialty-templates] invalid manifest in "${key}":\n  ` +
          result.errors.join("\n  "),
      );
    }
    const manifest = result.manifest;

    // Honour the legacy `active: false` opt-out from EMR-408.
    const active =
      typeof raw === "object" &&
      raw !== null &&
      "active" in raw &&
      (raw as { active?: unknown }).active === false
        ? false
        : true;

    const versionedKey = versionKey(manifest.slug, manifest.version);
    if (REGISTRY.has(versionedKey)) {
      throw new Error(
        `[specialty-templates] duplicate manifest "${versionedKey}" — registered ` +
          `twice. Each (slug, version) pair must be unique. Source: ${key}`,
      );
    }
    REGISTRY.set(versionedKey, { ...manifest, active, source: key });
  }

  // Second pass: compute the latest non-deprecated version per slug.
  for (const entry of REGISTRY.values()) {
    if (entry.deprecated === true) continue;
    if (entry.active === false) continue;

    const current = LATEST_BY_SLUG.get(entry.slug);
    if (!current || compareSemver(entry.version, current) > 0) {
      LATEST_BY_SLUG.set(entry.slug, entry.version);
    }
  }
}

// Module-init: throws if any manifest is invalid. Intentional fail-loud.
loadManifests();

/**
 * Strip registry-internal flags before returning a manifest to a caller.
 */
function publicShape(entry: RegistryEntry): SpecialtyManifest {
  const { active: _active, source: _source, ...manifest } = entry;
  return manifest as SpecialtyManifest;
}

/**
 * All registered manifests where `active !== false` AND `deprecated !== true`.
 * Returns the LATEST non-deprecated version per slug — exactly one entry per
 * slug, suitable for the onboarding picker UI.
 */
export function listActiveSpecialtyTemplates(): SpecialtyManifest[] {
  const out: SpecialtyManifest[] = [];
  for (const [slug, latestVersion] of LATEST_BY_SLUG.entries()) {
    const entry = REGISTRY.get(versionKey(slug, latestVersion));
    if (!entry) continue;
    if (entry.active === false) continue;
    if (entry.deprecated === true) continue;
    out.push(publicShape(entry));
  }
  return out;
}

/**
 * Look up a manifest.
 *
 *   - `version` omitted → returns the LATEST non-deprecated version, or null.
 *   - `version` provided → returns the EXACT (slug, version) match, even if
 *     deprecated. This is the path published configs use to render against
 *     the manifest they were published with.
 */
export function getSpecialtyTemplate(
  slug: string,
  version?: string,
): SpecialtyManifest | null {
  if (version !== undefined) {
    const entry = REGISTRY.get(versionKey(slug, version));
    return entry ? publicShape(entry) : null;
  }

  const latest = LATEST_BY_SLUG.get(slug);
  if (!latest) return null;
  const entry = REGISTRY.get(versionKey(slug, latest));
  if (!entry) return null;
  if (entry.active === false) return null;
  if (entry.deprecated === true) return null;
  return publicShape(entry);
}

/**
 * Every registered version of `slug`, sorted by semver descending. Includes
 * deprecated versions — admin UIs use this to render the full version history.
 */
export function listAllManifestVersions(slug: string): SpecialtyManifest[] {
  const out: SpecialtyManifest[] = [];
  for (const entry of REGISTRY.values()) {
    if (entry.slug === slug) out.push(publicShape(entry));
  }
  out.sort((a, b) => compareSemver(b.version, a.version));
  return out;
}

/**
 * Default-value seed for a draft PracticeConfiguration. Pure projection.
 *
 *   - `slug` unknown → returns `{}`.
 *   - `slug` resolves only to deprecated manifests → throws
 *     `Error("DEPRECATED_TEMPLATE: ...")`. Deprecated templates may not seed
 *     NEW configs; existing configs still render via exact-version lookup.
 */
export function applyTemplateDefaults(
  slug: string,
): Partial<PracticeConfigurationSeed> {
  const manifest = getSpecialtyTemplate(slug);
  if (!manifest) {
    const anyVersion = listAllManifestVersions(slug);
    if (anyVersion.length > 0) {
      throw new Error(
        `DEPRECATED_TEMPLATE: specialty "${slug}" has no non-deprecated ` +
          `version available for new onboarding. Existing configurations ` +
          `continue to render against their published version.`,
      );
    }
    return {};
  }

  const physicianShellTemplateId =
    manifest.default_mission_control_cards.length > 0
      ? `${manifest.slug}-physician-shell`
      : null;

  const patientShellTemplateId =
    manifest.default_patient_portal_cards.length > 0
      ? `${manifest.slug}-patient-shell`
      : null;

  return {
    selectedSpecialty: manifest.slug,
    selectedSpecialtyVersion: manifest.version,
    careModel: manifest.default_care_model,
    enabledModalities: [...manifest.default_enabled_modalities],
    disabledModalities: [...manifest.default_disabled_modalities],
    workflowTemplateIds: [...manifest.default_workflows],
    chartingTemplateIds: [...manifest.default_charting_templates],
    physicianShellTemplateId,
    patientShellTemplateId,
  };
}

/**
 * Test-only: re-run boot validation. Useful when toggling NODE_ENV mid-test.
 */
export function __reloadForTests(): void {
  loadManifests();
}

/**
 * EMR-778 — Effective agent set for a practice.
 *
 * Merges the Specialty Template's `agents[]` default with the practice's
 * `agent_enable_overrides`, then drops every modality-gated agent whose
 * modality is not in `enabledModalities`.
 *
 * Mirror semantics: identical to the upstream `<ModalityGate>` rule from
 * EMR-411. An agent with `modality: "cannabis-medicine"` is hidden for any
 * practice that has not enabled the `cannabis-medicine` modality, even if
 * the practice explicitly overrides the agent to `enabled`.
 *
 * Pure function — keeps the modality lookup at the caller so this stays
 * trivially testable.
 */
export function resolveEffectiveAgents(input: {
  slug: string;
  version?: string;
  enabledModalities: ReadonlySet<string> | readonly string[];
  practiceOverrides?: Record<string, "enabled" | "disabled"> | undefined;
}): AgentDescriptor[] {
  const manifest = getSpecialtyTemplate(input.slug, input.version);
  if (!manifest?.agents || manifest.agents.length === 0) return [];

  const enabled =
    input.enabledModalities instanceof Set
      ? (input.enabledModalities as ReadonlySet<string>)
      : new Set(input.enabledModalities as readonly string[]);
  const overrides = input.practiceOverrides ?? {};

  return manifest.agents.filter((agent) => {
    const override = overrides[agent.id];
    if (override === "disabled") return false;
    // Modality gate ALWAYS wins, even against explicit `enabled` override.
    if (agent.modality && !enabled.has(agent.modality)) return false;
    return true;
  });
}

/**
 * Test-only (EMR-431): register an additional manifest at runtime so
 * versioning behaviour can be exercised without committing fixture manifests
 * under ./manifests/. Returns a teardown function.
 */
export function __registerManifestForTests(raw: unknown): () => void {
  const result = validateManifest(raw);
  if (!result.ok) {
    throw new Error(
      `[specialty-templates] __registerManifestForTests: invalid manifest:\n  ` +
        result.errors.join("\n  "),
    );
  }
  const manifest = result.manifest;
  const key = versionKey(manifest.slug, manifest.version);
  if (REGISTRY.has(key)) {
    throw new Error(
      `[specialty-templates] __registerManifestForTests: duplicate "${key}"`,
    );
  }

  const active =
    typeof raw === "object" &&
    raw !== null &&
    "active" in raw &&
    (raw as { active?: unknown }).active === false
      ? false
      : true;

  REGISTRY.set(key, { ...manifest, active, source: "__test__" });

  const previousLatest = LATEST_BY_SLUG.get(manifest.slug);
  if (manifest.deprecated !== true && active !== false) {
    if (!previousLatest || compareSemver(manifest.version, previousLatest) > 0) {
      LATEST_BY_SLUG.set(manifest.slug, manifest.version);
    }
  }

  return () => {
    REGISTRY.delete(key);
    LATEST_BY_SLUG.delete(manifest.slug);
    for (const entry of REGISTRY.values()) {
      if (entry.slug !== manifest.slug) continue;
      if (entry.deprecated === true) continue;
      if (entry.active === false) continue;
      const current = LATEST_BY_SLUG.get(entry.slug);
      if (!current || compareSemver(entry.version, current) > 0) {
        LATEST_BY_SLUG.set(entry.slug, entry.version);
      }
    }
  };
}
