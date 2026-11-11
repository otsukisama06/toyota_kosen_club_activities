import { NextRequest, NextResponse } from "next/server";
import { getSuperAdminMember } from "@/lib/super-admin";
import { PEER_CLUB, createClubSwitchToken, isClubSwitchDestination } from "@/lib/club-switch";
import { buildAppUrl } from "@/lib/request-utils";

// スーパーアドミンが相手の部活アプリへ移動します。トークンを発行してゲートウェイの /switch-app へ送ります。
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const destination = String(formData.get("next") || "home");
  const backUrl = buildAppUrl(request, String(formData.get("returnTo") || "/"));

  const admin = await getSuperAdminMember();
  if (!admin) {
    const authUrl = buildAppUrl(request, "/auth");
    authUrl.searchParams.set("error", "admin ユーザーでログインしてください");
    return NextResponse.redirect(authUrl, 303);
  }

  if (!isClubSwitchDestination(destination)) {
    backUrl.searchParams.set("error", "移動先が不正です");
    return NextResponse.redirect(backUrl, 303);
  }

  const token = createClubSwitchToken(destination);
  if (!token) {
    backUrl.searchParams.set("error", `${PEER_CLUB.label}への切り替えは、ゲートウェイ経由で起動している場合のみ利用できます`);
    return NextResponse.redirect(backUrl, 303);
  }

  const switchUrl = buildAppUrl(request, "/switch-app");
  switchUrl.searchParams.set("to", PEER_CLUB.id);
  switchUrl.searchParams.set("token", token);
  return NextResponse.redirect(switchUrl, 303);
}
