import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth/require-role";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const type = req.nextUrl.searchParams.get("type");
  const version = req.nextUrl.searchParams.get("version");

  if (!type || !version)
    return NextResponse.json({ error: "type and version required" }, { status: 400 });

  const consent = await prisma.consent.findFirst({
    where: {
      userId: session.user.id,
      type: type as any,
      version,
    },
  });

  return NextResponse.json({ accepted: !!consent });
}
