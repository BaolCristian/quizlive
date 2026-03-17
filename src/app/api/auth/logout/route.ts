import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.AUTH_URL || "https://www.savint.it/savint/api/auth";
  const origin = new URL(baseUrl).origin;
  const response = NextResponse.redirect(new URL("/savint/login", origin));

  // Clear session token (and possible chunks .0, .1, .2)
  for (const suffix of ["", ".0", ".1", ".2", ".3"]) {
    response.headers.append(
      "Set-Cookie",
      `__Secure-authjs.session-token${suffix}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`
    );
    response.headers.append(
      "Set-Cookie",
      `authjs.session-token${suffix}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`
    );
  }

  // Clear CSRF token (__Host- prefix)
  response.headers.append(
    "Set-Cookie",
    `__Host-authjs.csrf-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`
  );
  response.headers.append(
    "Set-Cookie",
    `authjs.csrf-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`
  );

  // Clear callback URL cookie
  response.headers.append(
    "Set-Cookie",
    `__Secure-authjs.callback-url=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`
  );
  response.headers.append(
    "Set-Cookie",
    `authjs.callback-url=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`
  );

  // Clear PKCE cookie
  response.headers.append(
    "Set-Cookie",
    `__Secure-authjs.pkce.code_verifier=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`
  );

  return response;
}
