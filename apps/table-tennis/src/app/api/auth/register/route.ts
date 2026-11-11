import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { memberAccountRegisterSchema } from "@/lib/form-schemas";
import { isReservedSuperAdminNickname, isSuperAdminNickname, isValidSuperAdminLoginPassword } from "@/lib/admin-access";
import { AuthCodeDeliveryError, type RegisterPayload, startAuthChallenge } from "@/lib/auth-challenge";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { buildAppUrl } from "@/lib/request-utils";

// 入力内容を確認してメールに確認コードを送ります。アカウントはコード確認後に作成します。
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const redirectUrl = buildAppUrl(request, "/auth");

  const parsed = memberAccountRegisterSchema.safeParse({
    email: formData.get("email"),
    nickname: formData.get("nickname"),
    grade: formData.get("grade"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });

  if (!parsed.success) {
    redirectUrl.searchParams.set("error", parsed.error.issues[0]?.message || "入力値が不正です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const passwordError = validatePasswordStrength(parsed.data.password);
  if (passwordError) {
    redirectUrl.searchParams.set("error", passwordError);
    return NextResponse.redirect(redirectUrl, 303);
  }

  const registeringSuperAdmin = isSuperAdminNickname(parsed.data.nickname);
  if (isReservedSuperAdminNickname(parsed.data.nickname)) {
    const adminPassword = String(formData.get("adminPassword") || "");
    if (!registeringSuperAdmin || !isValidSuperAdminLoginPassword(adminPassword)) {
      redirectUrl.searchParams.set("error", "そのニックネームは使用できません");
      return NextResponse.redirect(redirectUrl, 303);
    }
  }

  const duplicated = await prisma.member.findFirst({
    where: { nickname: { equals: parsed.data.nickname, mode: "insensitive" } },
    select: { id: true },
  });

  if (duplicated) {
    redirectUrl.searchParams.set("error", "そのニックネームは既に使われています");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const duplicatedEmail = await prisma.member.findFirst({
    where: { email: { equals: parsed.data.email, mode: "insensitive" } },
    select: { id: true },
  });

  if (duplicatedEmail) {
    redirectUrl.searchParams.set("error", "そのメールアドレスは既に使われています");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const payload: RegisterPayload = {
    nickname: parsed.data.nickname,
    grade: parsed.data.grade,
    passwordHash: await hashPassword(parsed.data.password),
    isSuperAdmin: registeringSuperAdmin,
  };

  try {
    await startAuthChallenge({ purpose: "REGISTER", email: parsed.data.email, payload }, request);
  } catch (error) {
    if (error instanceof AuthCodeDeliveryError) {
      redirectUrl.searchParams.set("error", error.message);
      return NextResponse.redirect(redirectUrl, 303);
    }
    throw error;
  }

  return NextResponse.redirect(buildAppUrl(request, "/auth/verify"), 303);
}
