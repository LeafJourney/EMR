import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Dev logout is not allowed in production." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const redirectPath = searchParams.get("redirect") || "/sign-in";

  const origin = request.nextUrl.origin;
  const redirectUrl = new URL(redirectPath, origin);

  const response = NextResponse.redirect(redirectUrl);
  // Delete the dev_user_email cookie by setting it to expire immediately
  response.cookies.delete("dev_user_email");
  
  return response;
}
