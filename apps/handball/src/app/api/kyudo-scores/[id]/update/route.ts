import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionMember } from "@/lib/member-session";
import { parseJstDateTimeInputToUtc } from "@/lib/date-format";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const member = await getSessionMember();
  
  if (!member) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  
  const { sheetId, opponent, matchDate, comment, entries } = body;

  try {
    // 既存のシートを取得
    const existingSheet = await prisma.kyudoScoreSheet.findUnique({
      where: { id: sheetId },
      include: { entries: true },
    });

    if (!existingSheet) {
      return NextResponse.json({ error: "試合結果が見つかりません" }, { status: 404 });
    }

    if (member.id !== existingSheet.memberId) {
      return NextResponse.json({ error: "編集権限がありません" }, { status: 403 });
    }

    // 既存のエントリを削除
    await prisma.matchScoreEntry.deleteMany({
      where: { scoreSheetId: sheetId },
    });

    // 新しいエントリを生成（winnerフィールドも保存）
    const createPromises = entries.map((entry: any) => {
      return prisma.matchScoreEntry.create({
        data: {
          scoreSheetId: sheetId,
          setNumber: entry.setNumber,
          ourScore: entry.ourScore,
          theirScore: entry.theirScore,
          winner: entry.winner || null,
          comment: entry.comment || null,
        },
      });
    });

    // シートとエントリを同時に作成
    const parsedMatchDate = parseJstDateTimeInputToUtc(matchDate);
    const [sheet] = await Promise.all([
      prisma.kyudoScoreSheet.update({
        where: { id: sheetId },
        data: {
          opponent,
           matchDate: parsedMatchDate,
          comment,
        },
      }),
      ...createPromises,
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating score:", error);
    return NextResponse.json({ error: "エラーが発生しました" }, { status: 500 });
  }
}
