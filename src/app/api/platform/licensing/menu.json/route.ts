import { NextResponse } from "next/server";
import { renderMenuJson } from "@/lib/platform/licensing-menu";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  return NextResponse.json(renderMenuJson());
}
