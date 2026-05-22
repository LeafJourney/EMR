// SAFE: dead-export-allowed reason="SOAP acceptance fixture for EMR-700"

import fs from "node:fs";
import path from "node:path";

const FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures", "clinical");

export type ClinicalFixtureId =
  | "maya-reyes-pain-mgmt-v1"
  | "maya-reyes-pain-mgmt-v1-no-cannabis";

export function loadClinicalFixture(id: ClinicalFixtureId): string {
  const file = path.join(FIXTURE_DIR, `${id}.md`);
  return fs.readFileSync(file, "utf8");
}

export const MAYA_REYES_FIXTURE_IDS: readonly ClinicalFixtureId[] = [
  "maya-reyes-pain-mgmt-v1",
  "maya-reyes-pain-mgmt-v1-no-cannabis",
] as const;
