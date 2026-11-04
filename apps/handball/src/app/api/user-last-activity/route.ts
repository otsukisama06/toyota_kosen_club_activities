import { getSessionMember } from "@/lib/member-session";
import { prisma } from "@/lib/prisma";

// GET: 最新のアクティビティ時刻を取得
export async function GET() {
  try {
    const member = await getSessionMember();

    if (!member) {
      return Response.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }

    // データベースから最新のアクティビティ時刻を取得
    const memberData = await prisma.member.findUnique({
      where: { id: member.id },
      select: { lastActivityAt: true },
    });

    return Response.json({
      lastActivityAt: memberData?.lastActivityAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("Failed to fetch last activity:", error);
    return Response.json(
      { error: "アクティビティ時刻の取得に失敗しました" },
      { status: 500 }
    );
  }
}

// POST: アクティビティ時刻を更新
export async function POST() {
  try {
    const member = await getSessionMember();

    if (!member) {
      return Response.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }

    // データベースにアクティビティ時刻を保存
    const updatedMember = await prisma.member.update({
      where: { id: member.id },
      data: { lastActivityAt: new Date() },
      select: { lastActivityAt: true },
    });

    return Response.json({
      success: true,
      lastActivityAt: updatedMember.lastActivityAt?.toISOString(),
    });
  } catch (error) {
    console.error("Failed to update last activity:", error);
    return Response.json(
      { error: "アクティビティ時刻の更新に失敗しました" },
      { status: 500 }
    );
  }
}