import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizedAdminMember } from "@/lib/admin-access";
import { MEMBER_AUTH_FIELDS_OMIT } from "@/lib/member-fields";

// 管理画面でまとめて使うデータを返す API です。

export async function GET() {
  if (!(await getAuthorizedAdminMember())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [members, events, attendanceRecords, links] = await Promise.all([
    prisma.member.findMany({ omit: MEMBER_AUTH_FIELDS_OMIT, orderBy: { createdAt: "asc" } }),
    prisma.attendanceEvent.findMany({ orderBy: { scheduledAt: "desc" } }),
    prisma.attendanceRecord.findMany({
      include: { member: { omit: MEMBER_AUTH_FIELDS_OMIT }, event: true },
      orderBy: { submittedAt: "desc" },
      take: 50,
    }),
    prisma.inputToken.findMany({
      include: { member: { omit: MEMBER_AUTH_FIELDS_OMIT }, event: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return NextResponse.json({
    members,
    events,
    attendanceRecords,
    links,
  });
}
