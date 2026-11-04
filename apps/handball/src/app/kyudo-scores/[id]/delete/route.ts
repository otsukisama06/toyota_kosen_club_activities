import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionMember } from "@/lib/member-session";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const member = await getSessionMember();
  
  if (!member) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // 既存のシートを取得
    const existingSheet = await prisma.kyudoScoreSheet.findUnique({
      where: { id },
    });

    if (!existingSheet) {
      return NextResponse.json({ success: true });
    }

    if (member.id !== existingSheet.memberId) {
      return NextResponse.json({ success: true });
    }

    // 既存のエントリを削除
    await prisma.matchScoreEntry.deleteMany({
      where: { scoreSheetId: id },
    });

    // シートを削除
    await prisma.kyudoScoreSheet.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting score:", error);
    return NextResponse.json({ error: "エラーが発生しました" }, { status: 500 });
  }
}
