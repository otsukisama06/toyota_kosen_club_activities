import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionMember } from "@/lib/member-session";
import { parseJstDateTimeInputToUtc } from "@/lib/date-format";

export async function POST(request: NextRequest) {
  const member = await getSessionMember();
  if (!member) {
    return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  }

  const formData = await request.formData();
  const opponent = String(formData.get("opponent") || "");
  const matchDateStr = String(formData.get("matchDate") || "");
  const comment = String(formData.get("comment") || "");

  if (!opponent || !matchDateStr) {
    return NextResponse.json({ error: "対戦相手と試合日時は必須です" }, { status: 400 });
  }

  // datetime-local値をJST として UTC Date に変換
  const matchDate = parseJstDateTimeInputToUtc(matchDateStr);
  if (isNaN(matchDate.getTime())) {
    return NextResponse.json({ error: "試合日時が無効です" }, { status: 400 });
  }

   // 5セットのスコアを取得
   const entries = [];
   for (let i = 1; i <= 5; i++) {
     const ourScore = parseInt(String(formData.get(`set_${i}_ourScore`) || "0"));
     const theirScore = parseInt(String(formData.get(`set_${i}_theirScore`) || "0"));
     const winner = String(formData.get(`set_${i}_winner`) || "");
     const setComment = String(formData.get(`set_${i}_comment`) || "");

     entries.push({
       setNumber: i,
       ourScore,
       theirScore,
       winner: winner || null,
       comment: setComment || null,
     });
   }

  const scoreSheet = await prisma.kyudoScoreSheet.create({
    data: {
      memberId: member.id,
      opponent,
      matchDate,
      comment: comment || null,
      entries: {
        create: entries,
      },
    },
    include: {
      entries: { orderBy: { setNumber: "asc" } },
    },
  });

  return NextResponse.json(scoreSheet);
}