import { NextRequest, NextResponse } from "next/server";
import { InputType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthorizedAdminMember, isSuperAdminNickname, isValidSuperAdminLoginPassword } from "@/lib/admin-access";
import { buildAppUrl } from "@/lib/request-utils";

// 予定系データと試合スコア系データを一括削除します。
export async function POST(request: NextRequest) {
  const adminMember = await getAuthorizedAdminMember();
  if (!adminMember) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const confirmText = String(formData.get("confirmText") || "");
  const executionPassword = String(formData.get("executionPassword") || "");
  const redirectTo = String(formData.get("redirectTo") || "/admin");
  const redirectUrl = buildAppUrl(request, redirectTo);

  if (intent !== "delete-all-schedules-and-match-scores") {
    redirectUrl.searchParams.set("error", "操作が不正です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (confirmText !== "全削除") {
    redirectUrl.searchParams.set("error", "確認キーワードが一致しません（全削除と入力してください）");
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (!isSuperAdminNickname(adminMember.nickname)) {
    redirectUrl.searchParams.set("error", "この操作は admin ユーザーのみ実行できます");
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (!isValidSuperAdminLoginPassword(executionPassword)) {
    redirectUrl.searchParams.set("error", "実行パスワードが違います");
    return NextResponse.redirect(redirectUrl, 303);
  }

  await prisma.$transaction(async (tx) => {
    await tx.matchRecord.deleteMany({});
    await tx.attendanceEvent.deleteMany({});
    await tx.practiceMenu.deleteMany({});
    await tx.inputToken.deleteMany({
      where: { type: InputType.ATTENDANCE },
    });
  });

  redirectUrl.searchParams.set("ok", "all-schedules-and-match-scores-deleted");
  return NextResponse.redirect(redirectUrl, 303);
}
