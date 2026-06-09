import { createClerkClient } from "@clerk/backend";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

async function syncClerkUsers() {
  config({ path: ".env.local" });
  config({ path: ".env" });

  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    console.warn("⚠️ CLERK_SECRET_KEY is missing. Skipping Clerk user sync.");
    return;
  }

  const clerk = createClerkClient({ secretKey: clerkSecretKey });
  const prisma = new PrismaClient();

  const SEED_USERS = [
    { email: "owner@demo.health", password: "Longbeach2026!" },
    { email: "clinician@demo.health", password: "Longbeach2026!" },
    { email: "frontdesk@demo.health", password: "Longbeach2026!" },
    { email: "ma@demo.health", password: "Longbeach2026!" },
    { email: "office@demo.health", password: "Longbeach2026!" },
    { email: "patient@demo.health", password: "Longbeach2026!" },
    { email: "james.chen@demo.health", password: "Longbeach2026!" },
    { email: "sarah.thompson@demo.health", password: "Longbeach2026!" },
    { email: "kiosk@demo.health", password: "Longbeach2026!" },
  ];

  console.log("Syncing seeded users to Clerk...");

  
  for (const seed of SEED_USERS) {
    try {
      // 1. Check if user exists in Clerk
      const existingUsers = await clerk.users.getUserList({ emailAddress: [seed.email] });
      
      let clerkId: string;
      
      if (existingUsers.data.length > 0) {
        console.log(`  User ${seed.email} already exists in Clerk. Updating password...`);
        clerkId = existingUsers.data[0].id;
        await clerk.users.updateUser(clerkId, {
          password: seed.password,
        });
      } else {
        console.log(`  Creating user ${seed.email} in Clerk...`);
        const newUser = await clerk.users.createUser({
          emailAddress: [seed.email],
          password: seed.password,
          skipPasswordChecks: true,
          skipPasswordRequirement: true,
        });
        clerkId = newUser.id;
      }
      
      // 2. Link Clerk ID to the Prisma DB User
      const dbUser = await prisma.user.findUnique({
        where: { email: seed.email },
      });
      
      if (dbUser) {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { clerkId: clerkId },
        });
        console.log(`    → Linked Clerk ID ${clerkId} to local DB User.`);
      } else {
        console.log(`    → Warning: User ${seed.email} not found in local DB. Did you run prisma/seed.ts first?`);
      }
      
    } catch (err: any) {
      console.error(`  ❌ Failed to sync ${seed.email}:`, err.message || err);
    }
  }
  
  console.log("Clerk sync complete.");
}

syncClerkUsers()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
