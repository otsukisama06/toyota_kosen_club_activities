import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sheet = await prisma.kyudoScoreSheet.findUnique({
    where: { id },
    include: { entries: { orderBy: { setNumber: "asc" } } },
  });

  if (!sheet) {
    return NextResponse.json({ error: "試合結果が見つかりません" }, { status: 404 });
  }

  return NextResponse.json({ sheet });
}