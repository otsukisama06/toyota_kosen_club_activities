import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildAppUrl } from "@/lib/request-utils";
import { getSessionMember } from "@/lib/member-session";

// 練習メニューの一覧取得と登録を行います。

export async function GET() {
  const member = await getSessionMember();
  if (!member) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const practiceMenus = await prisma.practiceMenu.findMany({
    include: { createdBy: { select: { nickname: true } } },
    orderBy: { practiceDate: "desc" },
    take: 50,
  });

  return NextResponse.json({ practiceMenus });
}

export async function POST(request: NextRequest) {
  const redirectUrl = buildAppUrl(request, "/");
  redirectUrl.searchParams.set("error", "練習メニュー入力は廃止しました");
  return NextResponse.redirect(redirectUrl, 303);
}
