import { createClerkClient } from "@clerk/backend";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { config } from "dotenv";

// Scoped staff-account seeder (EMR-1108..1112 demo unblock).
//
// `npm run db:seed` rebuilds the entire demo org — too heavy to run against
// production just to add a login. This script ONLY upserts the non-clinical
// staff demo accounts introduced by the Back-Office Operations Audit (#630)
// and syncs them to Clerk. It never deletes anything and touches no patient
// data. Safe to re-run; existing users just get their password reset.
//
//   npm run db:seed-staff
//
// Requires DATABASE_URL (and CLERK_SECRET_KEY for the Clerk half) in the
// environment, same as the full seed.

const ORG_SLUG = "green-path-health";
const DEMO_PASSWORD = "Longbeach2026!";

const STAFF_USERS: Array<{
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  note: string;
}> = [
  {
    email: "frontdesk@demo.health",
    firstName: "Robin",
    lastName: "Vance",
    // Front Desk / Scheduler: demographics + billing only.
    role: Role.front_office,
    note: "Front Desk / Scheduler",
  },
  {
    email: "ma@demo.health",
    firstName: "Sam",
    lastName: "Ortiz",
    // Medical Assistant / Biller: rooming + read-notes-to-code + billing.
    role: Role.back_office,
    note: "Medical Assistant / Biller",
  },
  {
    email: "office@demo.health",
    firstName: "Jordan",
    lastName: "Lee",
    // Office Manager: all ops, read-only chart, NO chart authoring.
    role: Role.operator,
    note: "Office Manager",
  },
];

async function main() {
  config({ path: ".env.local" });
  config({ path: ".env" });

  const prisma = new PrismaClient();
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  const clerk = clerkSecretKey
    ? createClerkClient({ secretKey: clerkSecretKey })
    : null;
  if (!clerk) {
    console.warn(
      "⚠️ CLERK_SECRET_KEY is missing — DB rows will be upserted but no Clerk logins will be created.",
    );
  }

  const org = await prisma.organization.findUnique({
    where: { slug: ORG_SLUG },
  });
  if (!org) {
    throw new Error(
      `Demo organization "${ORG_SLUG}" not found. Run the full \`npm run db:seed\` once before using the scoped staff seeder.`,
    );
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  for (const staff of STAFF_USERS) {
    // 1. DB user row (mirrors prisma/seed.ts §Non-clinical staff).
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      update: { passwordHash },
      create: {
        email: staff.email,
        passwordHash,
        firstName: staff.firstName,
        lastName: staff.lastName,
        memberships: {
          create: { organizationId: org.id, role: staff.role },
        },
      },
    });

    // 2. Membership backstop — the upsert's update path doesn't create one,
    // and post-sign-in resolves the landing page from this row.
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, organizationId: org.id },
    });
    if (!membership) {
      await prisma.membership.create({
        data: { userId: user.id, organizationId: org.id, role: staff.role },
      });
      console.log(`  ${staff.email}: membership created (${staff.role})`);
    } else if (membership.role !== staff.role) {
      console.log(
        `  ${staff.email}: membership exists with role ${membership.role} (expected ${staff.role}) — left unchanged`,
      );
    }
    console.log(`✓ DB user ready: ${staff.email} (${staff.note})`);

    // 3. Clerk login + link (mirrors scripts/sync-clerk-seed.ts).
    if (!clerk) continue;
    try {
      const existing = await clerk.users.getUserList({
        emailAddress: [staff.email],
      });
      let clerkId: string;
      if (existing.data.length > 0) {
        clerkId = existing.data[0].id;
        await clerk.users.updateUser(clerkId, { password: DEMO_PASSWORD });
        console.log(`  ${staff.email}: Clerk user exists — password reset`);
      } else {
        const created = await clerk.users.createUser({
          emailAddress: [staff.email],
          password: DEMO_PASSWORD,
          skipPasswordChecks: true,
          skipPasswordRequirement: true,
        });
        clerkId = created.id;
        console.log(`  ${staff.email}: Clerk user created`);
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { clerkId },
      });
      console.log(`  ${staff.email}: Clerk ID linked`);
    } catch (err) {
      console.error(
        `  ❌ Clerk sync failed for ${staff.email}:`,
        err instanceof Error ? err.message : err,
      );
      process.exitCode = 1;
    }
  }

  await prisma.$disconnect();
  console.log("Staff account seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
