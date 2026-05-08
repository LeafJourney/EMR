#!/usr/bin/env node
// Capture a Clerk session for the Playwright MCP server.
//
// Opens a headed Chromium, lets the operator sign in by hand, then
// writes the resulting cookies + localStorage to `.auth/clerk.json`.
// Subsequent MCP launches load that file via --storage-state so the
// agent starts already-authenticated and click paths past `/sign-in`
// actually resolve.
//
// Usage:
//   npm run mcp:auth                     # defaults to localhost:3000/sign-in
//   AUTH_URL=https://staging.example.com/sign-in npm run mcp:auth
//
// The dev server should already be running. Re-run this whenever the
// Clerk session expires (look for 401s in the agent's snapshots).

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import readline from "node:readline";

const startUrl = process.env.AUTH_URL ?? "http://localhost:3000/sign-in";
const outputPath = resolve(".auth/clerk.json");

mkdirSync(dirname(outputPath), { recursive: true });

console.log(`\nOpening Chromium → ${startUrl}`);
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

try {
  await page.goto(startUrl, { waitUntil: "domcontentloaded" });
} catch (err) {
  console.error(
    `\nCouldn't reach ${startUrl}. Is the dev server running (npm run dev)?\n` +
      `${err instanceof Error ? err.message : String(err)}\n`,
  );
  await browser.close();
  process.exit(1);
}

console.log(
  [
    "",
    "─────────────────────────────────────────────────────────────",
    " Sign in to Clerk in the Chromium window that just opened.",
    " When you've landed past the auth gate (e.g. /portal or /clinic),",
    " come back here and press Enter to capture the session.",
    "─────────────────────────────────────────────────────────────",
    "",
  ].join("\n"),
);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await new Promise((r) => rl.question("Press Enter when signed in › ", r));
rl.close();

await context.storageState({ path: outputPath });
console.log(`\n✓ Saved auth state → ${outputPath}`);
console.log(
  "  Restart Claude Code (or reload your MCP client) so the playwright\n" +
    "  server picks the file up via --storage-state.\n",
);

await browser.close();
process.exit(0);
