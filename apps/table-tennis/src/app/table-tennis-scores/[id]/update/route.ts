import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionMember } from "@/lib/member-session";
import { parseJstDateTimeInputToUtc } from "@/lib/date-format";
import { buildAppUrl } from "@/lib/request-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const listUrl = buildAppUrl(request, "/table-tennis-scores");
  const member = await getSessionMember();

  if (!member) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { id: sheetId } = await params;
  const formData = await request.formData();

  const action = String(formData.get("action") || "");
  const opponent = String(formData.get("opponent") || "");
  const matchDate = String(formData.get("matchDate") || "");
  const comment = String(formData.get("comment") || "");

  try {
    const existingSheet = await prisma.tableTennisScoreSheet.findUnique({
      where: { id: sheetId },
      select: { memberId: true },
    });

    if (!existingSheet || member.id !== existingSheet.memberId) {
      listUrl.searchParams.set("error", "編集権限がないか、試合結果が見つかりません");
      return NextResponse.redirect(listUrl, 303);
    }

    if (action === "delete") {
      await prisma.tableTennisScoreSheet.delete({ where: { id: sheetId } });
      return NextResponse.redirect(listUrl, 303);
    }

    const parsedMatchDate = parseJstDateTimeInputToUtc(matchDate);
    if (Number.isNaN(parsedMatchDate.getTime())) {
      listUrl.searchParams.set("error", "試合日時が不正です");
      return NextResponse.redirect(listUrl, 303);
    }

    // FormData は Object.keys では列挙できないため、keys() から送信されたセット番号を集めます。
    const setNumbers = Array.from(
      new Set(
        Array.from(formData.keys())
          .filter((key) => key.startsWith("entry_") && key.endsWith("_setNumber"))
          .map((key) => Number.parseInt(String(formData.get(key)), 10))
          .filter((value) => Number.isInteger(value) && value >= 1),
      ),
    ).sort((a, b) => a - b);

    const entries = setNumbers.map((setNumber) => {
      const ourScore = Number.parseInt(String(formData.get(`entry_${setNumber}_ourScore`) || ""), 10) || 0;
      const theirScore = Number.parseInt(String(formData.get(`entry_${setNumber}_theirScore`) || ""), 10) || 0;
      const entryComment = String(formData.get(`entry_${setNumber}_comment`) || "");
      const winner = ourScore > theirScore ? "OUR" : ourScore < theirScore ? "OPPONENT" : null;

      return {
        scoreSheetId: sheetId,
        setNumber,
        ourScore,
        theirScore,
        winner,
        comment: entryComment || null,
      };
    });

    await prisma.$transaction([
      prisma.matchScoreEntry.deleteMany({ where: { scoreSheetId: sheetId } }),
      prisma.matchScoreEntry.createMany({ data: entries }),
      prisma.tableTennisScoreSheet.update({
        where: { id: sheetId },
        data: {
          opponent,
          matchDate: parsedMatchDate,
          comment: comment || null,
        },
      }),
    ]);

    return NextResponse.redirect(listUrl, 303);
  } catch (error) {
    console.error("Error updating score:", error);
    listUrl.searchParams.set("error", "更新に失敗しました");
    return NextResponse.redirect(listUrl, 303);
  }
}
