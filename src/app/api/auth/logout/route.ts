import { NextResponse } from "next/server";

export async function GET() {
  const response = NextResponse.redirect(
    new URL("/savint/login", process.env.AUTH_URL || "https://www.friulware.it/savint")
  );

  // Clear all possible session cookie name variations
  const cookieNames = [
    "__Secure-authjs.session-token",
    "authjs.session-token",
    "__Secure-authjs.callback-url",
    "authjs.callback-url",
    "__Secure-authjs.csrf-token",
    "authjs.csrf-token",
  ];

  for (const name of cookieNames) {
    response.cookies.set(name, "", {
      expires: new Date(0),
      path: "/",
      secure: false,
      httpOnly: false,
    });
    // Also clear with secure flag
    response.cookies.set(name, "", {
      expires: new Date(0),
      path: "/",
      secure: true,
      httpOnly: true,
    });
  }

  return response;
}
