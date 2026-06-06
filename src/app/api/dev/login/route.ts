import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Dev login is not allowed in production." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email") || "kiosk@demo.health";
  const redirectPath = searchParams.get("redirect") || "/kiosk";

  const origin = request.nextUrl.origin;
  const redirectUrl = new URL(redirectPath, origin);

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set("dev_user_email", email, { path: "/" });
  
  return response;
}
