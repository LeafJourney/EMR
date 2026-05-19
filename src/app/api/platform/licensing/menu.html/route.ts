import { renderMenuHtml } from "@/lib/platform/licensing-menu";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  return new Response(renderMenuHtml(), {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
