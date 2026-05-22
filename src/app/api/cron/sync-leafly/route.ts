import { NextResponse } from "next/server";
import { syncLeaflyCatalog } from "@/lib/integrations/sync-service";

export async function GET(request: Request) {
  // Simple auth check for Vercel Cron or custom cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncLeaflyCatalog();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
