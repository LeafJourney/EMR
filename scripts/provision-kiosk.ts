/**
 * Provision a front-desk check-in kiosk login for a clinic.
 *
 *   npx tsx --conditions=react-server scripts/provision-kiosk.ts <organizationId> [email]
 *
 * Creates (or re-uses) a User and grants it a Membership with role=kiosk in the
 * given organization. In production the kiosk also needs a matching Clerk
 * account (same email); locally, the dev_user_email cookie path is enough to
 * sign in as the kiosk. Idempotent.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function ensureKioskEnumValue(): Promise<void> {
  // Enum-value additions need the direct (non-pooler) connection and run
  // outside a transaction. Safe + idempotent.
  const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const ddl = new PrismaClient({ datasources: { db: { url: directUrl } } });
  try {
    await ddl.$executeRawUnsafe(`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'kiosk'`);
  } finally {
    await ddl.$disconnect();
  }
}

async function main() {
  const organizationId = process.argv[2];
  const email = process.argv[3] ?? "kiosk@demo.health";
  if (!organizationId) {
    console.error("Usage: provision-kiosk.ts <organizationId> [email]");
    process.exit(1);
  }

  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) {
    console.error(`No organization ${organizationId}`);
    process.exit(1);
  }

  await ensureKioskEnumValue();

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, firstName: "Front Desk", lastName: "Kiosk", passwordHash: "" },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: { userId: user.id, organizationId, role: "kiosk" },
    },
    update: {},
    create: { userId: user.id, organizationId, role: "kiosk" },
  });

  console.log(`✓ Kiosk login ready: ${email} → ${org.name} (${organizationId})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
