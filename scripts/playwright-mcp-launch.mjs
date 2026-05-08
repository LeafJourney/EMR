#!/usr/bin/env node
// Playwright MCP launcher.
//
// Wraps `npx @playwright/mcp` so the storage-state flag is only added
// when an auth bundle has actually been captured. That keeps the MCP
// server bootable on a fresh checkout (otherwise Playwright errors out
// on a missing storage-state file before the agent can do anything).
//
// Run `npm run mcp:auth` once to populate `.auth/clerk.json`; the next
// time this launcher fires it'll pick the file up automatically.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authPath = resolve(projectRoot, ".auth/clerk.json");

const args = [
  "-y",
  "@playwright/mcp@latest",
  "--browser",
  "chromium",
  "--isolated",
  "--viewport-size",
  "1280,800",
];

if (existsSync(authPath)) {
  args.push("--storage-state", authPath);
  process.stderr.write(`[playwright-mcp] using auth state: ${authPath}\n`);
} else {
  process.stderr.write(
    `[playwright-mcp] no auth state at ${authPath} — running unauthenticated. ` +
      `Run \`npm run mcp:auth\` to capture a Clerk session.\n`,
  );
}

const child = spawn("npx", args, {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
