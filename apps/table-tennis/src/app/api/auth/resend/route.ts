import { NextRequest, NextResponse } from "next/server";
import {
  AuthCodeDeliveryError,
  getPendingChallenge,
  getPendingChallengePurpose,
  resendAuthChallenge,
} from "@/lib/auth-challenge";
import { buildAppUrl } from "@/lib/request-utils";

// 確認コードを再送します。パスワード再設定ではメールアドレスの登録有無が分からないよう、常に同じ結果を返します。
export async function POST(request: NextRequest) {
  const purpose = await getPendingChallengePurpose();
  if (!purpose) {
    const authUrl = buildAppUrl(request, "/auth");
    authUrl.searchParams.set("error", "確認待ちの手続きがありません。最初からやり直してください");
    return NextResponse.redirect(authUrl, 303);
  }

  const backUrl = buildAppUrl(request, purpose === "PASSWORD_RESET" ? "/auth/password-reset/confirm" : "/auth/verify");
  const challenge = await getPendingChallenge([purpose]);

  if (!challenge) {
    if (purpose === "PASSWORD_RESET") {
      backUrl.searchParams.set("ok", "resent");
      return NextResponse.redirect(backUrl, 303);
    }
    const authUrl = buildAppUrl(request, "/auth");
    authUrl.searchParams.set("error", "確認コードの有効期限が切れたか、入力回数の上限に達しました。最初からやり直してください");
    return NextResponse.redirect(authUrl, 303);
  }

  try {
    await resendAuthChallenge(challenge);
  } catch (error) {
    if (error instanceof AuthCodeDeliveryError) {
      backUrl.searchParams.set("error", error.message);
      return NextResponse.redirect(backUrl, 303);
    }
    throw error;
  }

  backUrl.searchParams.set("ok", "resent");
  return NextResponse.redirect(backUrl, 303);
}
