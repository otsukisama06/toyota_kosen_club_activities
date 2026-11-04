import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionMember } from "@/lib/member-session";

// ログインユーザーの振り返り一覧を取得する
export async function GET(request: NextRequest) {
  const member = await getSessionMember();
  if (!member) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const feedbacks = await prisma.matchFeedback.findMany({
      where: { memberId: member.id },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            scheduledAt: true,
            matchOpponent: true,
            matchDetail: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(feedbacks, { status: 200 });
  } catch (error) {
    console.error("Error fetching member match feedbacks:", error);
    return NextResponse.json(
      { error: "Failed to fetch feedbacks" },
      { status: 500 }
    );
  }
}
