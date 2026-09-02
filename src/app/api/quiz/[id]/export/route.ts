import { NextRequest } from "next/server";
import { requireTeacher } from "@/lib/auth/require-role";
import { prisma } from "@/lib/db/client";
import { buildQlz } from "@/lib/hub/qlz-builder";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({
    where: {
      id,
      OR: [
        { authorId: session.user.id },
        { shares: { some: { sharedWithId: session.user.id } } },
      ],
    },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!quiz) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { buffer: zipBuffer } = await buildQlz(quiz);

  const sanitizedTitle = quiz.title
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);

  return new Response(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${sanitizedTitle}.qlz"`,
    },
  });
}
