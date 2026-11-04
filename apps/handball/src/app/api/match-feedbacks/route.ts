import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionMember } from "@/lib/member-session";
import { buildAppUrl } from "@/lib/request-utils";

// 試合の振り返りを投稿・更新する
export async function POST(request: NextRequest) {
  const member = await getSessionMember();
  const formData = await request.formData();
  const redirectTo = String(formData.get("redirectTo") || "/match-feedbacks");
  const redirectUrl = buildAppUrl(request, redirectTo);
  const intent = String(formData.get("intent") || "save");

  if (!member) {
    redirectUrl.searchParams.set("error", "unauthorized");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const attendanceEventId = String(formData.get("attendanceEventId") || formData.get("matchId") || "");
  const feedback = String(formData.get("feedback") || "");

  if (!attendanceEventId || (intent !== "delete" && !feedback.trim())) {
    redirectUrl.searchParams.set("error", "invalid-input");
    return NextResponse.redirect(redirectUrl, 303);
  }

  try {
    // MATCHイベントが存在するか確認
    const event = await prisma.attendanceEvent.findFirst({
      where: {
        id: attendanceEventId,
        eventType: "MATCH",
      },
    });

    if (!event) {
      redirectUrl.searchParams.set("error", "match-event-not-found");
      return NextResponse.redirect(redirectUrl, 303);
    }

    if (intent === "delete") {
      await prisma.matchFeedback.deleteMany({
        where: {
          attendanceEventId,
          memberId: member.id,
        },
      });
      redirectUrl.searchParams.set("ok", "deleted");
      return NextResponse.redirect(redirectUrl, 303);
    }

    const existed = await prisma.matchFeedback.findUnique({
      where: {
        attendanceEventId_memberId: {
          attendanceEventId,
          memberId: member.id,
        },
      },
      select: { id: true },
    });

    // upsert で更新または作成
    await prisma.matchFeedback.upsert({
      where: {
        attendanceEventId_memberId: {
          attendanceEventId,
          memberId: member.id,
        },
      },
      update: {
        feedback: feedback.trim(),
        updatedAt: new Date(),
      },
      create: {
        attendanceEventId,
        memberId: member.id,
        feedback: feedback.trim(),
      },
    });

    redirectUrl.searchParams.set("ok", existed ? "updated" : "created");
    return NextResponse.redirect(redirectUrl, 303);
  } catch (error) {
    console.error("Error saving match feedback:", error);
    redirectUrl.searchParams.set("error", "save-failed");
    return NextResponse.redirect(redirectUrl, 303);
  }
}
