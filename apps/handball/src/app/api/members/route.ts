import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizedAdminMember } from "@/lib/admin-access";
import { buildAppUrl } from "@/lib/request-utils";

// 管理画面の部員一覧取得と新規登録を扱います。

export async function GET() {
  if (!(await getAuthorizedAdminMember())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const members = await prisma.member.findMany({
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ members });
}

export async function POST(request: NextRequest) {
  if (!(await getAuthorizedAdminMember())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redirectUrl = buildAppUrl(request, "/admin");
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "reset-attendance-rate") {
    await prisma.member.updateMany({
      data: {
        attendanceRateStartAt: new Date(),
      },
    });

    redirectUrl.searchParams.set("ok", "attendance-rate-reset");
    return NextResponse.redirect(redirectUrl, 303);
  }

  redirectUrl.searchParams.set("error", "この操作は利用できません");
  return NextResponse.redirect(redirectUrl, 303);
}
