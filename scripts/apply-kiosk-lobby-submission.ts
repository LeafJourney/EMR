// EMR-915 — idempotent apply of the KioskLobbySubmission migration to the
// drift-managed dev DB. Uses DIRECT_URL (not the pooled URL) and CREATE ...
// IF NOT EXISTS so re-runs are safe. After this, run:
//   npx prisma generate
//   npx prisma migrate resolve --applied 20260531120000_kiosk_lobby_submission
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL is required to apply the migration");

  const sql = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/20260531120000_kiosk_lobby_submission/migration.sql",
    ),
    "utf8",
  );

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    console.log("applied KioskLobbySubmission migration (idempotent)");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
