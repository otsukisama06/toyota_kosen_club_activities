import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionMember } from "@/lib/member-session";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const member = await getSessionMember();

  if (!member) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existingSheet = await prisma.tableTennisScoreSheet.findUnique({
      where: { id },
      select: { memberId: true },
    });

    if (!existingSheet) {
      return NextResponse.json({ error: "試合結果が見つかりません" }, { status: 404 });
    }

    if (member.id !== existingSheet.memberId) {
      return NextResponse.json({ error: "削除権限がありません" }, { status: 403 });
    }

    // セット記録は onDelete: Cascade で一緒に削除されます。
    await prisma.tableTennisScoreSheet.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting score:", error);
    return NextResponse.json({ error: "エラーが発生しました" }, { status: 500 });
  }
}
