#!/usr/bin/env tsx
/**
 * load-synthetic-patient.ts — EMR-773 quickstart helper.
 *
 * POSTs a FHIR Bundle to the local HAPI FHIR server. Used by the 30-minute
 * quickstart to seed the lakehouse with a synthetic patient before the
 * agent demo.
 *
 * Usage:
 *   pnpm tsx scripts/load-synthetic-patient.ts examples/synthetic-patients/patient-001.json
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FHIR_BASE = process.env.FHIR_BASE ?? "http://localhost:8080/fhir";

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: load-synthetic-patient.ts <bundle.json>");
    process.exit(2);
  }
  const path = resolve(process.cwd(), arg);
  const bundle = JSON.parse(readFileSync(path, "utf8")) as unknown;

  const res = await fetch(FHIR_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/fhir+json",
      Accept: "application/fhir+json",
    },
    body: JSON.stringify(bundle),
  });

  if (!res.ok) {
    console.error(`FHIR server returned ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }
  const body = (await res.json()) as { resourceType?: string; type?: string; entry?: unknown[] };
  console.log(
    `ingested ${body.type ?? body.resourceType ?? "bundle"} with ${body.entry?.length ?? 0} entries`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
