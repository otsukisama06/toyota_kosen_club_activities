import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { passwordResetConfirmSchema } from "@/lib/form-schemas";
import { clearChallengeCookie, consumeAuthCode, getPendingChallenge } from "@/lib/auth-challenge";
import { clearMemberSession } from "@/lib/member-session";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { buildAppUrl } from "@/lib/request-utils";

// 確認コードを照合して新しいパスワードを保存します。既存のログイン状態はすべて無効になります。
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const confirmUrl = buildAppUrl(request, "/auth/password-reset/confirm");

  const parsed = passwordResetConfirmSchema.safeParse({
    code: formData.get("code"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });
  if (!parsed.success) {
    confirmUrl.searchParams.set("error", parsed.error.issues[0]?.message || "入力値が不正です");
    return NextResponse.redirect(confirmUrl, 303);
  }

  const passwordError = validatePasswordStrength(parsed.data.password);
  if (passwordError) {
    confirmUrl.searchParams.set("error", passwordError);
    return NextResponse.redirect(confirmUrl, 303);
  }

  const challenge = await getPendingChallenge(["PASSWORD_RESET"]);
  if (!challenge || !challenge.memberId) {
    confirmUrl.searchParams.set("error", "確認コードが正しくないか、有効期限が切れています");
    return NextResponse.redirect(confirmUrl, 303);
  }

  if (!(await consumeAuthCode(challenge.id, parsed.data.code))) {
    confirmUrl.searchParams.set("error", "確認コードが正しくないか、有効期限が切れています");
    return NextResponse.redirect(confirmUrl, 303);
  }

  await prisma.member.update({
    where: { id: challenge.memberId },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      passwordUpdatedAt: new Date(),
      sessionVersion: { increment: 1 },
      failedLoginCount: 0,
      loginLockedUntil: null,
    },
  });

  await clearChallengeCookie();
  await clearMemberSession();

  const authUrl = buildAppUrl(request, "/auth");
  authUrl.searchParams.set("ok", "password-set");
  return NextResponse.redirect(authUrl, 303);
}
