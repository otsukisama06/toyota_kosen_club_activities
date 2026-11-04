import { NextRequest, NextResponse } from "next/server";
import { AttendanceEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthorizedAdminMember } from "@/lib/admin-access";
import { parseJstDateTimeToUtc } from "@/lib/date-format";
import { attendanceEventSchema } from "@/lib/form-schemas";
import { buildRedirectUrl } from "@/lib/request-utils";

function parseEventDates(rawDates: string): string[] {
  return rawDates
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function POST(request: NextRequest) {
  if (!(await getAuthorizedAdminMember())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const redirectTo = String(formData.get("redirectTo") || "/admin/events");
  const redirectUrl = buildRedirectUrl(request, redirectTo);

  const eventDates = parseEventDates(String(formData.get("eventDates") || ""));
  if (eventDates.length === 0) {
    redirectUrl.searchParams.set("error", "日付を1つ以上選択してください");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const parsed = attendanceEventSchema.safeParse({
    eventType: formData.get("eventType"),
    eventDate: eventDates[0],
    eventTime: formData.get("eventTime"),
    eventEndTime: formData.get("eventEndTime") || undefined,
    matchOpponent: formData.get("matchOpponent") || undefined,
    matchDetail: formData.get("matchDetail") || undefined,
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    redirectUrl.searchParams.set("error", parsed.error.issues[0]?.message || "入力値が不正です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const rows = eventDates.map((eventDate) => {
    const scheduledAt = parseJstDateTimeToUtc(eventDate, parsed.data.eventTime);
    const endAt = parsed.data.eventEndTime
      ? parseJstDateTimeToUtc(eventDate, parsed.data.eventEndTime)
      : null;
    const title = parsed.data.eventType === AttendanceEventType.MATCH
      ? `試合${parsed.data.matchOpponent ? `: ${parsed.data.matchOpponent}` : ""}`
      : `練習 ${eventDate}`;

    return {
      eventType: parsed.data.eventType,
      title,
      scheduledAt,
      endAt,
      matchOpponent: parsed.data.eventType === AttendanceEventType.MATCH ? parsed.data.matchOpponent || null : null,
      matchDetail: parsed.data.eventType === AttendanceEventType.MATCH ? parsed.data.matchDetail || null : null,
      note: parsed.data.note || null,
    };
  });

  if (rows.some((row) => Number.isNaN(row.scheduledAt.getTime()) || (row.endAt && Number.isNaN(row.endAt.getTime())))) {
    redirectUrl.searchParams.set("error", "日時が不正です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  await prisma.attendanceEvent.createMany({
    data: rows,
  });

  redirectUrl.searchParams.set("ok", `event-bulk-${rows.length}`);
  return NextResponse.redirect(redirectUrl, 303);
}
