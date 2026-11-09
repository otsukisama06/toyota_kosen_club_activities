import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { selfAttendanceSubmitSchema } from "@/lib/form-schemas";
import { getSessionMember } from "@/lib/member-session";
import { buildAppUrl } from "@/lib/request-utils";

// メイン画面からの出席送信を保存します。

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const redirectTo = String(formData.get("redirectTo") || "/");
  const redirectUrl = buildAppUrl(request, redirectTo);

  const member = await getSessionMember();
  if (!member) {
    const authUrl = buildAppUrl(request, "/auth");
    authUrl.searchParams.set("error", "ログインしてください");
    return NextResponse.redirect(authUrl, 303);
  }

  const parsed = selfAttendanceSubmitSchema.safeParse({
    eventId: formData.get("eventId"),
    status: formData.get("status"),
    comment: formData.get("comment") || undefined,
  });

  if (!parsed.success) {
    redirectUrl.searchParams.set("error", parsed.error.issues[0]?.message || "入力値が不正です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const targetEvent = await prisma.attendanceEvent.findUnique({
    where: { id: parsed.data.eventId },
    select: { id: true },
  });

  if (!targetEvent) {
    redirectUrl.searchParams.set("error", "対象の予定が見つかりません");
    return NextResponse.redirect(redirectUrl, 303);
  }

  await prisma.attendanceRecord.upsert({
    where: {
      eventId_memberId: {
        eventId: parsed.data.eventId,
        memberId: member.id,
      },
    },
    update: {
      status: parsed.data.status,
      comment: parsed.data.comment,
      submittedAt: new Date(),
    },
    create: {
      eventId: parsed.data.eventId,
      memberId: member.id,
      status: parsed.data.status,
      comment: parsed.data.comment,
    },
  });

  redirectUrl.searchParams.set("ok", "attendance");
  return NextResponse.redirect(redirectUrl, 303);
}
