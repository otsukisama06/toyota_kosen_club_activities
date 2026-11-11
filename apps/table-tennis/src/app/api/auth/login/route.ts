import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { passwordLoginSchema } from "@/lib/form-schemas";
import { isSuperAdminNickname, isValidSuperAdminLoginPassword } from "@/lib/admin-access";
import { AuthCodeDeliveryError, startAuthChallenge } from "@/lib/auth-challenge";
import { verifyPassword } from "@/lib/password";
import { buildAppUrl } from "@/lib/request-utils";

const MAX_FAILED_LOGIN_ATTEMPTS = 10;
const LOGIN_LOCK_MINUTES = 15;
const INVALID_CREDENTIALS_MESSAGE = "ニックネーム（メールアドレス）またはパスワードが正しくありません";

// 1段階目: ニックネーム（またはメールアドレス）と個人パスワードを確認し、メールで確認コードを送ります。
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const redirectUrl = buildAppUrl(request, "/auth");

  const parsed = passwordLoginSchema.safeParse({
    loginId: formData.get("loginId"),
    password: formData.get("password"),
    adminPassword: formData.get("adminPassword") || undefined,
  });

  if (!parsed.success) {
    redirectUrl.searchParams.set("error", parsed.error.issues[0]?.message || "入力値が不正です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const { loginId, password, adminPassword } = parsed.data;
  const member = await prisma.member.findFirst({
    where: loginId.includes("@")
      ? { email: { equals: loginId, mode: "insensitive" } }
      : { nickname: loginId },
    select: {
      id: true,
      nickname: true,
      email: true,
      passwordHash: true,
      failedLoginCount: true,
      loginLockedUntil: true,
    },
  });

  if (!member) {
    redirectUrl.searchParams.set("error", INVALID_CREDENTIALS_MESSAGE);
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (!member.passwordHash) {
    // 部活共通パスワード時代から登録されているユーザは、まずメールで本人確認してパスワードを設定します。
    if (!member.email) {
      redirectUrl.searchParams.set(
        "error",
        "メールアドレスが未登録のためパスワードを設定できません。管理者にメールアドレスの登録を依頼してください",
      );
      return NextResponse.redirect(redirectUrl, 303);
    }
    const setupUrl = buildAppUrl(request, "/auth/password-reset");
    setupUrl.searchParams.set("notice", "setup-required");
    return NextResponse.redirect(setupUrl, 303);
  }

  if (member.loginLockedUntil && member.loginLockedUntil.getTime() > Date.now()) {
    redirectUrl.searchParams.set(
      "error",
      "パスワードの誤入力が続いたため一時的にログインを制限しています。しばらくしてから再度お試しいただくか、パスワードを再設定してください",
    );
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (!(await verifyPassword(password, member.passwordHash))) {
    const failedLoginCount = member.failedLoginCount + 1;
    const shouldLock = failedLoginCount >= MAX_FAILED_LOGIN_ATTEMPTS;
    await prisma.member.update({
      where: { id: member.id },
      data: shouldLock
        ? { failedLoginCount: 0, loginLockedUntil: new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000) }
        : { failedLoginCount },
    });
    redirectUrl.searchParams.set("error", INVALID_CREDENTIALS_MESSAGE);
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (isSuperAdminNickname(member.nickname) && !isValidSuperAdminLoginPassword(adminPassword)) {
    redirectUrl.searchParams.set("error", "admin ログインには追加のパスワードが必要です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  await prisma.member.update({
    where: { id: member.id },
    data: { failedLoginCount: 0, loginLockedUntil: null },
  });

  if (!member.email) {
    redirectUrl.searchParams.set(
      "error",
      "メールアドレスが未登録のため確認コードを送信できません。管理者にメールアドレスの登録を依頼してください",
    );
    return NextResponse.redirect(redirectUrl, 303);
  }

  try {
    await startAuthChallenge({ purpose: "LOGIN", memberId: member.id, email: member.email }, request);
  } catch (error) {
    if (error instanceof AuthCodeDeliveryError) {
      redirectUrl.searchParams.set("error", error.message);
      return NextResponse.redirect(redirectUrl, 303);
    }
    throw error;
  }

  return NextResponse.redirect(buildAppUrl(request, "/auth/verify"), 303);
}
