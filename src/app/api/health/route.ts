import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Render injects RENDER_GIT_COMMIT at build time. Other hosts use different
// names; we read the first that's set so the field works locally and on
// Vercel/Render/Fly without ceremony. Keeping the response shape additive
// so the existing smoke test (which asserts ok / db / service) is untouched.
function deployedCommit(): string | null {
  return (
    process.env.RENDER_GIT_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    process.env.COMMIT_SHA ||
    null
  );
}

export async function GET() {
  const commit = deployedCommit();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "web", db: "ok", commit });
  } catch (err) {
    return NextResponse.json(
      { ok: false, service: "web", db: "down", commit, error: String(err) },
      { status: 503 }
    );
  }
}
