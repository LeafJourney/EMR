#!/usr/bin/env node
// Parse Playwright failures out of a GitHub Actions log archive.
//
// Inputs:  argv[2] = directory containing the unzipped run logs.
// Output:  JSON array of { file, title, error } on stdout — the shape
//          scripts/triage-staging-failure.ts (FailedTest) expects.
//
// Why a JS file (not TS): the triage workflow runs this BEFORE
// installing dev deps, and node can execute .js directly without tsx.
// Kept tiny + dependency-free for the same reason.

"use strict";
const fs = require("node:fs");
const path = require("node:path");

const logDir = process.argv[2];
if (!logDir) {
  process.stderr.write("usage: parse-playwright-failures.js <log-dir>\n");
  process.exit(2);
}

if (!fs.existsSync(logDir)) {
  process.stdout.write("[]\n");
  process.exit(0);
}

// Walk every text file inside the unzipped log bundle. Playwright logs
// live under "<job-name>/<step-number>_Run Playwright tests.txt".
function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walk(full));
    } else if (ent.isFile() && /\.txt$/i.test(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

// Playwright's GitHub reporter prints a per-failure block that looks
// roughly like:
//
//   1) [chromium] › e2e/link-integrity.spec.ts:111:9 › Link integrity — find-and-fix pass 6 › crawl /leafmart
//
//      Error: Test timeout of 30000ms exceeded.
//
//      <stack...>
//
// We pull (file, title, first non-empty error line) out of each block.
// Strict-but-tolerant: anything we don't recognize is skipped.
const HEADER_RE =
  /^\d+\)\s+(?:\[[^\]]+\]\s*›\s*)?(.+?\.spec\.ts):\d+:\d+\s*›\s*(.+?)\s*$/;

function parseFailures(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = HEADER_RE.exec(stripTimestamp(lines[i]));
    if (!m) continue;
    const file = m[1].trim();
    const title = m[2].trim();
    // Walk forward up to 25 lines looking for the first "Error:" line.
    let error = "";
    for (let j = i + 1; j < Math.min(i + 25, lines.length); j++) {
      const raw = stripTimestamp(lines[j]).trim();
      if (!raw) continue;
      if (/^\d+\)\s+/.test(raw)) break; // next failure block
      if (/^Error:/i.test(raw) || /timeout|exceeded/i.test(raw)) {
        error = raw;
        break;
      }
      if (!error && raw.length > 0) error = raw; // first non-empty as fallback
    }
    out.push({ file, title, error });
  }
  return out;
}

// GitHub Actions prefixes every log line with an ISO timestamp.
function stripTimestamp(line) {
  return line.replace(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?/,
    "",
  );
}

// Aggregate across every log file and dedupe by (file + title).
const seen = new Set();
const failures = [];
for (const f of walk(logDir)) {
  let text;
  try {
    text = fs.readFileSync(f, "utf8");
  } catch {
    continue;
  }
  for (const fail of parseFailures(text)) {
    const key = `${fail.file}::${fail.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    failures.push(fail);
  }
}

process.stdout.write(JSON.stringify(failures, null, 2));
process.stdout.write("\n");
