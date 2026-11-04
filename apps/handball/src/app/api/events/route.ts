import { NextRequest, NextResponse } from "next/server";
import { AttendanceEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthorizedAdminMember } from "@/lib/admin-access";
import { parseJstDateTimeToUtc } from "@/lib/date-format";
import { buildRedirectUrl } from "@/lib/request-utils";
import { attendanceEventSchema } from "@/lib/form-schemas";

// 出席イベントの参照と作成を行う API です。

export async function GET() {
  if (!(await getAuthorizedAdminMember())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await prisma.attendanceEvent.findMany({
    orderBy: { scheduledAt: "desc" },
  });

  return NextResponse.json({ events });
}

export async function POST(request: NextRequest) {
  if (!(await getAuthorizedAdminMember())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const parsed = attendanceEventSchema.safeParse({
    eventType: formData.get("eventType"),
    eventDate: formData.get("eventDate"),
    eventTime: formData.get("eventTime"),
    eventEndTime: formData.get("eventEndTime") || undefined,
    matchOpponent: formData.get("matchOpponent") || undefined,
    matchDetail: formData.get("matchDetail") || undefined,
    note: formData.get("note") || undefined,
  });

  const redirectTo = String(formData.get("redirectTo") || "/admin");
  const redirectUrl = buildRedirectUrl(request, redirectTo);

  if (!parsed.success) {
    redirectUrl.searchParams.set("error", parsed.error.issues[0]?.message || "入力値が不正です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const scheduledAt = parseJstDateTimeToUtc(parsed.data.eventDate, parsed.data.eventTime);
  if (Number.isNaN(scheduledAt.getTime())) {
    redirectUrl.searchParams.set("error", "日時が不正です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const endAt = parsed.data.eventEndTime
    ? parseJstDateTimeToUtc(parsed.data.eventDate, parsed.data.eventEndTime)
    : null;
  if (endAt && Number.isNaN(endAt.getTime())) {
    redirectUrl.searchParams.set("error", "終了時刻が不正です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const title = parsed.data.eventType === AttendanceEventType.MATCH
    ? `試合${parsed.data.matchOpponent ? `: ${parsed.data.matchOpponent}` : ""}`
    : `練習 ${parsed.data.eventDate}`;

  await prisma.attendanceEvent.create({
    data: {
      eventType: parsed.data.eventType,
      title,
      scheduledAt,
      endAt,
      matchOpponent: parsed.data.eventType === AttendanceEventType.MATCH ? parsed.data.matchOpponent || null : null,
      matchDetail: parsed.data.eventType === AttendanceEventType.MATCH ? parsed.data.matchDetail || null : null,
      note: parsed.data.note,
    },
  });

  redirectUrl.searchParams.set("ok", "event");
  return NextResponse.redirect(redirectUrl, 303);
}
