import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const gameSession = await prisma.session.findUnique({ where: { id } });
  if (!gameSession || gameSession.hostId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (gameSession.status === "FINISHED")
    return NextResponse.json({ error: "Already finished" }, { status: 400 });

  const updated = await prisma.session.update({
    where: { id },
    data: { status: "FINISHED", endedAt: new Date() },
  });

  return NextResponse.json(updated);
}
