import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth/require-role";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const consentSchema = z.object({
  type: z.enum(["TERMS_ACCEPTANCE", "QUIZ_PUBLISH_DECLARATION"]),
  version: z.string().min(1),
  metadata: z.record(z.string(), z.any()).optional(),
});

export async function POST(req: NextRequest) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const body = await req.json();
  const parsed = consentSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const consent = await prisma.consent.create({
    data: {
      userId: session.user.id,
      type: parsed.data.type,
      version: parsed.data.version,
      metadata: (parsed.data.metadata as any) ?? undefined,
    },
  });

  return NextResponse.json(consent, { status: 201 });
}
