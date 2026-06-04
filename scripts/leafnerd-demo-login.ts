/**
 * leafnerd-demo-login.ts — Establish a reliable demo login for the Leafnerd
 * dashboard (/leafnerd) investor demo.
 *
 * Run with:
 *   npx tsx --conditions=react-server -r dotenv/config scripts/leafnerd-demo-login.ts
 *
 * What it does (idempotently):
 *   1. Upserts a local User for "Dr. Lena Reyes" (lena.reyes@leafjourney.com),
 *      with a bcrypt hash of the demo password.
 *   2. Ensures a single Membership with role `leafnerd` linking that user to the
 *      `leafnerd-demo` org (by slug) if it exists, else the first organization.
 *   3. Best-effort Clerk sync (mirrors scripts/sync-clerk-seed.ts): create/update
 *      the Clerk user + password and write back User.clerkId. Never aborts on a
 *      Clerk failure — the dev quick-login path must keep working.
 *
 * Two ways to reach /leafnerd after running this:
 *   A) Dev quick-login (deterministic, no Clerk needed):
 *      http://localhost:3001/api/dev/login?email=lena.reyes@leafjourney.com&redirect=/leafnerd
 *   B) Real sign-in form:
 *      http://localhost:3001/sign-in  →  lena.reyes@leafjourney.com / Longbeach2026!
 */

import { config } from "dotenv";
// Load env so this works standalone AND under the recommended `-r dotenv/config`
// invocation. Next.js gives `.env.local` precedence over `.env`, so we load
// `.env.local` with override:true — otherwise an empty `CLERK_SECRET_KEY=` in
// `.env` (or one preloaded by `-r dotenv/config`) would mask the real key in
// `.env.local` and silently skip the Clerk sync.
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { prisma } from "../src/lib/db/prisma";
import bcrypt from "bcryptjs";

const DEMO_EMAIL = "lena.reyes@leafjourney.com";
const DEMO_FIRST = "Lena";
const DEMO_LAST = "Reyes";
const DEMO_PASSWORD = "Longbeach2026!";
const DEMO_ROLE = "leafnerd" as const;
const PREFERRED_ORG_SLUG = "leafnerd-demo";
const SERVER_BASE = "http://localhost:3001";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ------------------------------------------------------------------
  // 1. Pick the organization: prefer `leafnerd-demo`, else first/default.
  // ------------------------------------------------------------------
  let org = await prisma.organization.findUnique({
    where: { slug: PREFERRED_ORG_SLUG },
  });
  if (!org) {
    org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  }
  if (!org) {
    throw new Error(
      "No organization found in the database. Seed at least one org before running this script."
    );
  }

  // ------------------------------------------------------------------
  // 2. Upsert the local User. (Membership is handled separately below so
  //    the unique [userId, organizationId, role] constraint stays idempotent.)
  // ------------------------------------------------------------------
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      passwordHash,
      firstName: DEMO_FIRST,
      lastName: DEMO_LAST,
    },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      firstName: DEMO_FIRST,
      lastName: DEMO_LAST,
    },
  });

  // ------------------------------------------------------------------
  // 3. Ensure exactly one `leafnerd` Membership for this user + org.
  //    The @@unique([userId, organizationId, role]) constraint makes this
  //    safe to re-run.
  // ------------------------------------------------------------------
  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: user.id,
        organizationId: org.id,
        role: DEMO_ROLE,
      },
    },
    update: {},
    create: {
      userId: user.id,
      organizationId: org.id,
      role: DEMO_ROLE,
    },
  });

  // ------------------------------------------------------------------
  // 4. Best-effort Clerk sync (mirrors scripts/sync-clerk-seed.ts).
  //    Wrapped so any failure (missing key, network) is non-fatal.
  // ------------------------------------------------------------------
  let clerkSynced = false;
  let clerkNote = "";
  try {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      clerkNote = "CLERK_SECRET_KEY missing — skipped (dev quick-login still works).";
      console.warn(`⚠️  ${clerkNote}`);
    } else {
      const { createClerkClient } = await import("@clerk/backend");
      const clerk = createClerkClient({ secretKey: clerkSecretKey });

      const existingUsers = await clerk.users.getUserList({
        emailAddress: [DEMO_EMAIL],
      });

      let clerkId: string;
      if (existingUsers.data.length > 0) {
        clerkId = existingUsers.data[0].id;
        console.log(`  Clerk user ${DEMO_EMAIL} exists — updating password...`);
        await clerk.users.updateUser(clerkId, {
          password: DEMO_PASSWORD,
          firstName: DEMO_FIRST,
          lastName: DEMO_LAST,
        });
      } else {
        console.log(`  Creating Clerk user ${DEMO_EMAIL}...`);
        const newUser = await clerk.users.createUser({
          emailAddress: [DEMO_EMAIL],
          password: DEMO_PASSWORD,
          firstName: DEMO_FIRST,
          lastName: DEMO_LAST,
          skipPasswordChecks: true,
          skipPasswordRequirement: true,
        });
        clerkId = newUser.id;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { clerkId },
      });
      clerkSynced = true;
      clerkNote = `Linked Clerk ID ${clerkId} to local User.`;
      console.log(`    → ${clerkNote}`);
    }
  } catch (err: any) {
    clerkNote = `Clerk sync failed: ${err?.message || err}`;
    console.warn(`⚠️  ${clerkNote}`);
    console.warn("    Dev quick-login path is unaffected and still works.");
  }

  // ------------------------------------------------------------------
  // 5. Summary.
  // ------------------------------------------------------------------
  const devLoginUrl = `${SERVER_BASE}/api/dev/login?email=${encodeURIComponent(
    DEMO_EMAIL
  )}&redirect=/leafnerd`;
  const signInUrl = `${SERVER_BASE}/sign-in`;

  console.log("\n========================================");
  console.log("  Leafnerd demo login — ready");
  console.log("========================================");
  console.log(`  Identity     : Dr. ${DEMO_FIRST} ${DEMO_LAST}`);
  console.log(`  Email        : ${DEMO_EMAIL}`);
  console.log(`  Password     : ${DEMO_PASSWORD}`);
  console.log(`  Role         : ${DEMO_ROLE}`);
  console.log(`  Organization : ${org.name} (slug: ${org.slug})`);
  console.log(`  Clerk synced : ${clerkSynced ? "YES" : "NO"}${clerkNote ? ` — ${clerkNote}` : ""}`);
  console.log("\n  Login URLs:");
  console.log(`  (1) Dev quick-login : ${devLoginUrl}`);
  console.log(`  (2) Real sign-in    : ${signInUrl}  (then enter the email + password)`);
  console.log("========================================\n");
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("ERROR:", e?.message || e);
    await prisma.$disconnect();
    process.exit(1);
  });
