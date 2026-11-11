import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSuperAdminNickname } from "@/lib/admin-access";
import { CLUB_SWITCH_DESTINATION_PATHS, CURRENT_CLUB, verifyClubSwitchToken } from "@/lib/club-switch";
import { setMemberSession } from "@/lib/member-session";
import { buildAppUrl } from "@/lib/request-utils";

// 相手の部活アプリから切り替えてきたスーパーアドミンを、このアプリの admin アカウントでログインさせます。
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const authUrl = buildAppUrl(request, "/auth");

  const destination = verifyClubSwitchToken(token);
  if (!destination) {
    authUrl.searchParams.set("error", "部活の切り替えリンクが無効か期限切れです。もう一度切り替えボタンを押してください");
    return NextResponse.redirect(authUrl, 303);
  }

  const admin = await prisma.member.findUnique({
    where: { nickname: getSuperAdminNickname() },
    select: { id: true },
  });
  if (!admin) {
    authUrl.searchParams.set("error", `${CURRENT_CLUB.label}アプリに admin アカウントが登録されていません`);
    return NextResponse.redirect(authUrl, 303);
  }

  await setMemberSession(admin.id, request);
  return NextResponse.redirect(buildAppUrl(request, CLUB_SWITCH_DESTINATION_PATHS[destination]), 303);
}
