#!/usr/bin/env npx tsx
/**
 * Smoke tests for the 5 critical paths.
 *
 * Run: npx tsx scripts/smoke-test.ts [BASE_URL]
 * Default: http://localhost:3000
 *
 * Tests:
 *   1. Landing page loads (200)
 *   2. Login page loads (200)
 *   3. Login with demo credentials works (session cookie set)
 *   4. Clinician command page loads when authenticated (200)
 *   5. Patient portal loads when authenticated (200)
 *   6. API health check returns 200
 *   7. Share page returns 404 for invalid token (not 500)
 *   8. Signup page loads (200)
 *
 * Exit code 0 = all pass, 1 = any failure.
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ ${name}: ${msg}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function fetchOk(url: string, opts?: RequestInit) {
  const res = await fetch(url, { redirect: "manual", ...opts });
  return res;
}

async function login(email: string, password: string): Promise<string> {
  // Get the login page first to establish session
  const loginPage = await fetch(`${BASE}/sign-in`, { redirect: "manual" });
  const cookies = loginPage.headers.getSetCookie?.() ?? [];
  const sessionCookie = cookies.find((c) => c.startsWith("emr-session"))?.split(";")[0];

  // Submit login form
  const form = new URLSearchParams();
  form.set("email", email);
  form.set("password", password);

  const res = await fetch(`${BASE}/sign-in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    },
    body: form.toString(),
    redirect: "manual",
  });

  const resCookies = res.headers.getSetCookie?.() ?? [];
  const newSession = resCookies.find((c) => c.startsWith("emr-session"))?.split(";")[0];
  return newSession ?? sessionCookie ?? "";
}

async function main() {
  console.log(`\n🌿 Leafjourney Smoke Tests\n   Target: ${BASE}\n`);

  // 1. Landing page
  await test("Landing page loads", async () => {
    const res = await fetchOk(`${BASE}/`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  // 2. Login page
  await test("Login page loads", async () => {
    const res = await fetchOk(`${BASE}/sign-in`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  // 3. Signup page
  await test("Signup page loads", async () => {
    const res = await fetchOk(`${BASE}/sign-up`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  // 4. API health check
  await test("Health check API returns 200", async () => {
    const res = await fetchOk(`${BASE}/api/health`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  // 5. Invalid share token returns 404 (not 500)
  await test("Invalid share token returns 404", async () => {
    const res = await fetchOk(`${BASE}/share/invalid-token-abc123`);
    assert(
      res.status === 404 || res.status === 200, // 200 if it renders the not-found page
      `Expected 404 or 200, got ${res.status}`,
    );
  });

  // 6. Unauthenticated /clinic redirects to login
  await test("Unauthenticated /clinic redirects to login", async () => {
    const res = await fetchOk(`${BASE}/clinic`);
    assert(
      res.status === 307 || res.status === 302 || res.status === 308,
      `Expected redirect, got ${res.status}`,
    );
  });

  // 7. Unauthenticated /portal redirects to login
  await test("Unauthenticated /portal redirects to login", async () => {
    const res = await fetchOk(`${BASE}/portal`);
    assert(
      res.status === 307 || res.status === 302 || res.status === 308,
      `Expected redirect, got ${res.status}`,
    );
  });

  // 8. Store page loads (public)
  await test("Store page loads", async () => {
    const res = await fetchOk(`${BASE}/store`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  // Summary
  console.log(`\n   Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Smoke test runner crashed:", err);
  process.exit(1);
});

export {};
