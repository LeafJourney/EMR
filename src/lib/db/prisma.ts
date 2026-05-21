import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Prisma client singleton. In dev, Next's HMR will otherwise create many
// connections on every reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const connectionString = `${process.env.DATABASE_URL}`;
const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
