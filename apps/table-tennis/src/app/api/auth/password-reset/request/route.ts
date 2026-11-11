import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { passwordResetRequestSchema } from "@/lib/form-schemas";
import { AuthCodeDeliveryError, startAuthChallenge, startDummyChallenge } from "@/lib/auth-challenge";
import { buildAppUrl } from "@/lib/request-utils";

// パスワード再設定（初回設定を含む）の確認コードを、登録済みメールアドレスへ送ります。
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const requestUrl = buildAppUrl(request, "/auth/password-reset");

  const parsed = passwordResetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    requestUrl.searchParams.set("error", parsed.error.issues[0]?.message || "入力値が不正です");
    return NextResponse.redirect(requestUrl, 303);
  }

  const member = await prisma.member.findFirst({
    where: { email: { equals: parsed.data.email, mode: "insensitive" } },
    select: { id: true, email: true },
  });

  try {
    if (member?.email) {
      await startAuthChallenge({ purpose: "PASSWORD_RESET", memberId: member.id, email: member.email }, request);
    } else {
      // 登録の有無を推測されないよう、未登録でも同じ画面へ進めます。
      await startDummyChallenge("PASSWORD_RESET", request);
    }
  } catch (error) {
    if (error instanceof AuthCodeDeliveryError) {
      requestUrl.searchParams.set("error", error.message);
      return NextResponse.redirect(requestUrl, 303);
    }
    throw error;
  }

  return NextResponse.redirect(buildAppUrl(request, "/auth/password-reset/confirm"), 303);
}
