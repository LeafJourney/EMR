// EMR-776 — Synthetic patient bundle loader.
//
// Reads hand-authored FHIR R4 Bundles from `examples/synthetic-patients/`
// and writes them to stdout (or a future destination — see TODO below)
// in a deterministic, idempotent shape. The intent is that this script
// is the single entry point for loading exemplar fixtures so test setup
// and demo provisioning share one code path.
//
// Status: v1 is read-and-validate only — we don't yet have a stable
// FHIR-to-Prisma mapping for Patient/Condition/MedicationRequest in the
// LeafBridge schema. Once those models land, this script grows a
// `--target prisma` mode that writes rows tagged with
// `bundle:<bundle-id>` so teardown can target a single bundle.
//
// Run via:
//   pnpm tsx scripts/load-synthetic.ts               # both bundles, dry run
//   pnpm tsx scripts/load-synthetic.ts --file <path> # one bundle

import { readFile, readdir } from "node:fs/promises";
import { resolve, basename } from "node:path";

const EXAMPLES_DIR = resolve(process.cwd(), "examples/synthetic-patients");

type FhirBundle = {
  resourceType: "Bundle";
  id: string;
  type: string;
  entry: Array<{ fullUrl?: string; resource?: { resourceType?: string; id?: string } }>;
};

function isFhirBundle(value: unknown): value is FhirBundle {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.resourceType === "Bundle" &&
    typeof v.id === "string" &&
    Array.isArray(v.entry)
  );
}

async function loadBundle(absPath: string): Promise<FhirBundle> {
  const raw = await readFile(absPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isFhirBundle(parsed)) {
    throw new Error(`Not a FHIR Bundle: ${absPath}`);
  }
  return parsed;
}

function summarizeBundle(bundle: FhirBundle): string {
  const counts = new Map<string, number>();
  for (const entry of bundle.entry) {
    const rt = entry.resource?.resourceType ?? "(unknown)";
    counts.set(rt, (counts.get(rt) ?? 0) + 1);
  }
  const parts = Array.from(counts.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([rt, n]) => `${rt}=${n}`);
  return `${bundle.id} (${bundle.entry.length} entries: ${parts.join(", ")})`;
}

async function discoverBundles(): Promise<string[]> {
  const entries = await readdir(EXAMPLES_DIR);
  return entries
    .filter((name) => name.endsWith(".json"))
    .map((name) => resolve(EXAMPLES_DIR, name))
    .sort();
}

function parseArgs(argv: string[]): { files: string[] } {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--file" && argv[i + 1]) {
      out.push(resolve(argv[i + 1]!));
      i += 1;
    }
  }
  return { files: out };
}

async function main(): Promise<void> {
  const { files } = parseArgs(process.argv.slice(2));
  const targets = files.length > 0 ? files : await discoverBundles();

  if (targets.length === 0) {
    console.log("No bundles found in examples/synthetic-patients/.");
    return;
  }

  console.log(`Loading ${targets.length} synthetic bundle(s):`);
  for (const path of targets) {
    try {
      const bundle = await loadBundle(path);
      console.log(`  ✓ ${basename(path)}: ${summarizeBundle(bundle)}`);
      // TODO(EMR-776 follow-up): when the LeafBridge FHIR-shaped Prisma
      // models land, write `bundle.entry` into Postgres with a tag of
      // `bundle:${bundle.id}`. Today this is a validate-only pass so the
      // exemplars are syntactically guaranteed correct in CI.
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${basename(path)}: ${msg}`);
      process.exitCode = 1;
    }
  }
}

void main();
