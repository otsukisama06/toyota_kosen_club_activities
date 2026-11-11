import { NextRequest, NextResponse } from "next/server";
import { getSessionMember } from "@/lib/member-session";
import { isSuperAdminNickname } from "@/lib/admin-access";
import { buildAppUrl } from "@/lib/request-utils";
import { sendTestAttendanceLineNotification } from "@/lib/attendance-reminder-scheduler";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const redirectTo = String(formData.get("redirectTo") || "/super-admin/mail");
  const redirectUrl = buildAppUrl(request, redirectTo);

  const member = await getSessionMember();
  if (!member) {
    const authUrl = buildAppUrl(request, "/auth");
    authUrl.searchParams.set("error", "ログインしてください");
    return NextResponse.redirect(authUrl, 303);
  }

  if (!isSuperAdminNickname(member.nickname)) {
    redirectUrl.searchParams.set("error", "admin ユーザーのみ実行できます");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const result = await sendTestAttendanceLineNotification();
  if (!result.sent) {
    redirectUrl.searchParams.set("error", result.error || "LINE への送信に失敗しました");
    return NextResponse.redirect(redirectUrl, 303);
  }

  redirectUrl.searchParams.set("ok", "test-line-sent");
  return NextResponse.redirect(redirectUrl, 303);
}
