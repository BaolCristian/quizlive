import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth/require-role";
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/hub/token-crypto";
import { getHubOAuthConfig } from "@/lib/hub/oauth-config";

export async function DELETE() {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;
  const session = gate.session;
  const link = await prisma.hubLink.findUnique({ where: { userId: session.user.id } });
  if (!link) return NextResponse.json({ ok: true });

  try {
    const cfg = await getHubOAuthConfig();
    const token = decryptToken(link.accessTokenCiphertext, process.env.NEXTAUTH_SECRET ?? "");
    await fetch(`${cfg.hubUrl}/api/hub/oauth/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }).toString(),
    });
  } catch {
    /* best-effort */
  }
  await prisma.hubLink.update({
    where: { id: link.id },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
