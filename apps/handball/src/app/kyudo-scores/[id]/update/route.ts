import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionMember } from "@/lib/member-session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const member = await getSessionMember();
  
  if (!member) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { id } = await params;
  const formData = await request.formData();
  
  const sheetId = formData.get("sheetId") as string;
  const action = formData.get("action") as string;
  const opponent = formData.get("opponent") as string;
  const matchDate = formData.get("matchDate") as string;
  const comment = formData.get("comment") as string;

  try {
    // 既存のシートを取得
    const existingSheet = await prisma.kyudoScoreSheet.findUnique({
      where: { id: sheetId },
      include: { entries: true },
    });

    if (!existingSheet) {
      return NextResponse.redirect(new URL("/kyudo-scores", request.url));
    }

    if (member.id !== existingSheet.memberId) {
      return NextResponse.redirect(new URL("/kyudo-scores", request.url));
    }

    // 削除アクションの場合
    if (action === "delete") {
      await prisma.matchScoreEntry.deleteMany({
        where: { scoreSheetId: sheetId },
      });
      await prisma.kyudoScoreSheet.delete({
        where: { id: sheetId },
      });
      return NextResponse.redirect(new URL("/kyudo-scores", request.url));
    }

    // 更新アクションの場合
    // 既存のエントリを削除
    await prisma.matchScoreEntry.deleteMany({
      where: { scoreSheetId: sheetId },
    });

    // 新しいエントリを生成
    const entryKeys = Object.keys(formData).filter(k => k.startsWith("entry_") && k.endsWith("_setNumber"));
    const setNumbers = entryKeys.map(k => parseInt(formData.get(k) as string)).sort((a, b) => a - b);

    const createPromises = setNumbers.map((setNumber) => {
      const ourScoreStr = formData.get(`entry_${setNumber}_ourScore`) as string;
      const theirScoreStr = formData.get(`entry_${setNumber}_theirScore`) as string;
      const entryComment = formData.get(`entry_${setNumber}_comment`) as string;

      const ourScore = parseInt(ourScoreStr) || 0;
      const theirScore = parseInt(theirScoreStr) || 0;
      const winner = ourScore > theirScore ? "OUR" : ourScore < theirScore ? "OPPONENT" : "";

      return prisma.matchScoreEntry.create({
        data: {
          scoreSheetId: sheetId,
          setNumber,
          ourScore,
          theirScore,
          winner,
          comment: entryComment || null,
        },
      });
    });

    // シートとエントリを同時に作成
    const [sheet] = await Promise.all([
      prisma.kyudoScoreSheet.update({
        where: { id: sheetId },
        data: {
          opponent,
          matchDate: new Date(matchDate),
          comment,
        },
      }),
      ...createPromises,
    ]);

    return NextResponse.redirect(new URL("/kyudo-scores", request.url));
  } catch (error) {
    console.error("Error updating score:", error);
    return NextResponse.redirect(new URL("/kyudo-scores", request.url));
  }
}