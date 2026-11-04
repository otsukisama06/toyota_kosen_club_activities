import { NextRequest, NextResponse } from "next/server";
import { getSessionMember } from "@/lib/member-session";
import { isSuperAdminNickname } from "@/lib/admin-access";
import { buildAppUrl } from "@/lib/request-utils";
import { sendTestConfirmationEmailToAllMembers } from "@/lib/attendance-reminder-scheduler";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const redirectTo = String(formData.get("redirectTo") || "/admin/super-admin");
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

  const result = await sendTestConfirmationEmailToAllMembers();
  if (result.total === 0) {
    redirectUrl.searchParams.set("error", "送信対象のメールアドレスが見つかりません（またはメール設定が未設定です）");
    return NextResponse.redirect(redirectUrl, 303);
  }

  redirectUrl.searchParams.set("ok", `test-mail-sent-${result.sent}`);
  return NextResponse.redirect(redirectUrl, 303);
}
