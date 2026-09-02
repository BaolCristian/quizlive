import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth/require-role";
import { generateQuizTemplate } from "@/lib/excel/template";

export async function GET() {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const buffer = await generateQuizTemplate();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="savint-template.xlsx"',
    },
  });
}
