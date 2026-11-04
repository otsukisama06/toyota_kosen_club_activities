import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionMember } from "@/lib/member-session";

type RouteParams = { params: Promise<{ matchId: string }> };

// 試合の全振り返りを取得する
export async function GET(request: NextRequest, { params }: RouteParams) {
  const member = await getSessionMember();
  if (!member) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await params;

  try {
    const feedbacks = await prisma.matchFeedback.findMany({
      where: { attendanceEventId: matchId },
      include: {
        member: {
          select: {
            id: true,
            nickname: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(feedbacks, { status: 200 });
  } catch (error) {
    console.error("Error fetching match feedbacks:", error);
    return NextResponse.json(
      { error: "Failed to fetch feedbacks" },
      { status: 500 }
    );
  }
}
