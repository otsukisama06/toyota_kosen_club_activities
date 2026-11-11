import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  clearChallengeCookie,
  consumeAuthCode,
  getPendingChallenge,
  type RegisterPayload,
} from "@/lib/auth-challenge";
import { setMemberSession } from "@/lib/member-session";
import { buildAppUrl } from "@/lib/request-utils";

function isRegisterPayload(value: unknown): value is RegisterPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.nickname === "string" &&
    typeof payload.grade === "string" &&
    typeof payload.passwordHash === "string" &&
    typeof payload.isSuperAdmin === "boolean"
  );
}

// 2段階目: メールで届いた6桁の確認コードを照合してログイン（または登録）を完了します。
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const verifyUrl = buildAppUrl(request, "/auth/verify");
  const authUrl = buildAppUrl(request, "/auth");

  const challenge = await getPendingChallenge(["LOGIN", "REGISTER"]);
  if (!challenge) {
    await clearChallengeCookie();
    authUrl.searchParams.set("error", "確認コードの有効期限が切れたか、入力回数の上限に達しました。最初からやり直してください");
    return NextResponse.redirect(authUrl, 303);
  }

  const code = String(formData.get("code") || "");
  if (!(await consumeAuthCode(challenge.id, code))) {
    verifyUrl.searchParams.set("error", "確認コードが正しくありません");
    return NextResponse.redirect(verifyUrl, 303);
  }

  await clearChallengeCookie();

  if (challenge.purpose === "LOGIN") {
    if (!challenge.memberId) {
      authUrl.searchParams.set("error", "ログイン情報が見つかりません。最初からやり直してください");
      return NextResponse.redirect(authUrl, 303);
    }

    await setMemberSession(challenge.memberId, request);
    const successUrl = buildAppUrl(request, "/");
    successUrl.searchParams.set("ok", "login");
    return NextResponse.redirect(successUrl, 303);
  }

  if (!isRegisterPayload(challenge.payload)) {
    authUrl.searchParams.set("error", "登録情報が見つかりません。最初からやり直してください");
    return NextResponse.redirect(authUrl, 303);
  }

  const payload = challenge.payload;
  try {
    const createdMember = await prisma.member.create({
      data: {
        name: payload.nickname,
        nickname: payload.nickname,
        email: challenge.email,
        grade: payload.grade,
        passwordHash: payload.passwordHash,
        passwordUpdatedAt: new Date(),
        role: (payload.isSuperAdmin ? "ADMIN" : "PLAYER") as never,
        canAccessAdmin: payload.isSuperAdmin,
      },
      select: { id: true },
    });

    await setMemberSession(createdMember.id, request);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : "";
      authUrl.searchParams.set(
        "error",
        target.includes("email") ? "そのメールアドレスは既に使われています" : "そのニックネームは既に使われています",
      );
      return NextResponse.redirect(authUrl, 303);
    }

    throw error;
  }

  const successUrl = buildAppUrl(request, "/");
  successUrl.searchParams.set("ok", "registered");
  return NextResponse.redirect(successUrl, 303);
}
