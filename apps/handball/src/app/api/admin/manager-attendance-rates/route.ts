import { NextResponse } from "next/server";
import { getAuthorizedAdminMember } from "@/lib/admin-access";
import { shouldCountForAttendanceRate } from "@/lib/attendance-rate";
import { prisma } from "@/lib/prisma";

type AttendanceRateResult = {
  memberId: string;
  attendanceRate: number | null;
  attendCount: number;
  validAttendanceCount: number;
};

export async function GET() {
  const adminMember = await getAuthorizedAdminMember();
  if (!adminMember) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const members = await prisma.member.findMany({
    select: {
      id: true,
      attendanceRateStartAt: true,
      attendances: {
        select: {
          status: true,
          event: {
            select: {
              eventType: true,
              scheduledAt: true,
            },
          },
        },
      },
    },
  });

  const results: AttendanceRateResult[] = members.map((member) => {
    const validAttendances = member.attendances.filter((record) =>
      shouldCountForAttendanceRate(record.event.eventType, record.event.scheduledAt, member.attendanceRateStartAt)
    );

    const attendCount = validAttendances.filter(
      (record) => record.status === "ATTEND" || record.status === "LATE"
    ).length;

    const attendanceRate =
      validAttendances.length === 0 ? null : (attendCount / validAttendances.length) * 100;

    return {
      memberId: member.id,
      attendanceRate,
      attendCount,
      validAttendanceCount: validAttendances.length,
    };
  });

  return NextResponse.json({ results });
}
