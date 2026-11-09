import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionMember } from "@/lib/member-session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const member = await getSessionMember();
  if (!member) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const sheet = await prisma.tableTennisScoreSheet.findUnique({
    where: { id },
    include: { entries: { orderBy: { setNumber: "asc" } } },
  });

  if (!sheet) {
    return NextResponse.json({ error: "試合結果が見つかりません" }, { status: 404 });
  }

  return NextResponse.json({ sheet });
}