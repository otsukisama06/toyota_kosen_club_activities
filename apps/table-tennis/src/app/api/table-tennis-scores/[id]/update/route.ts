import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionMember } from "@/lib/member-session";
import { parseJstDateTimeInputToUtc } from "@/lib/date-format";

type IncomingEntry = {
  setNumber?: unknown;
  ourScore?: unknown;
  theirScore?: unknown;
  winner?: unknown;
  comment?: unknown;
};

function toInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const member = await getSessionMember();

  if (!member) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { id: sheetId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "入力値が不正です" }, { status: 400 });
  }

  const { opponent, matchDate, comment, entries } = body as {
    opponent?: unknown;
    matchDate?: unknown;
    comment?: unknown;
    entries?: unknown;
  };

  const parsedMatchDate = parseJstDateTimeInputToUtc(String(matchDate ?? ""));
  if (Number.isNaN(parsedMatchDate.getTime())) {
    return NextResponse.json({ error: "試合日時が不正です" }, { status: 400 });
  }

  if (!Array.isArray(entries)) {
    return NextResponse.json({ error: "セットの入力が不正です" }, { status: 400 });
  }

  const normalizedEntries = [];
  const seenSetNumbers = new Set<number>();
  for (const rawEntry of entries as IncomingEntry[]) {
    const setNumber = toInt(rawEntry?.setNumber);
    const ourScore = toInt(rawEntry?.ourScore);
    const theirScore = toInt(rawEntry?.theirScore);
    if (setNumber === null || ourScore === null || theirScore === null || setNumber < 1 || ourScore < 0 || theirScore < 0) {
      return NextResponse.json({ error: "セットの入力が不正です" }, { status: 400 });
    }
    if (seenSetNumbers.has(setNumber)) {
      return NextResponse.json({ error: "セット番号が重複しています" }, { status: 400 });
    }
    seenSetNumbers.add(setNumber);
    normalizedEntries.push({
      scoreSheetId: sheetId,
      setNumber,
      ourScore,
      theirScore,
      winner: typeof rawEntry.winner === "string" && rawEntry.winner ? rawEntry.winner : null,
      comment: typeof rawEntry.comment === "string" && rawEntry.comment ? rawEntry.comment : null,
    });
  }

  try {
    const existingSheet = await prisma.tableTennisScoreSheet.findUnique({
      where: { id: sheetId },
      select: { memberId: true },
    });

    if (!existingSheet) {
      return NextResponse.json({ error: "試合結果が見つかりません" }, { status: 404 });
    }

    if (member.id !== existingSheet.memberId) {
      return NextResponse.json({ error: "編集権限がありません" }, { status: 403 });
    }

    // 途中で失敗しても既存のセット記録が消えないよう、1つのトランザクションで更新します。
    await prisma.$transaction([
      prisma.matchScoreEntry.deleteMany({ where: { scoreSheetId: sheetId } }),
      prisma.matchScoreEntry.createMany({ data: normalizedEntries }),
      prisma.tableTennisScoreSheet.update({
        where: { id: sheetId },
        data: {
          opponent: String(opponent ?? ""),
          matchDate: parsedMatchDate,
          comment: typeof comment === "string" && comment ? comment : null,
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating score:", error);
    return NextResponse.json({ error: "エラーが発生しました" }, { status: 500 });
  }
}
