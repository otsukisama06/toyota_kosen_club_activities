import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminNickname } from "@/lib/admin-access";
import { getSuperAdminMember } from "@/lib/super-admin";
import { buildAppUrl } from "@/lib/request-utils";

// 部員アカウントのログイン制限解除・強制ログアウトを行います。
export async function POST(request: NextRequest) {
  const redirectUrl = buildAppUrl(request, "/super-admin/members");
  const admin = await getSuperAdminMember();
  if (!admin) {
    const authUrl = buildAppUrl(request, "/auth");
    authUrl.searchParams.set("error", "admin ユーザーでログインしてください");
    return NextResponse.redirect(authUrl, 303);
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const memberId = String(formData.get("memberId") || "");

  const target = memberId
    ? await prisma.member.findUnique({ where: { id: memberId }, select: { id: true, nickname: true } })
    : null;
  if (!target) {
    redirectUrl.searchParams.set("error", "対象の部員が見つかりません");
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (intent === "unlock") {
    await prisma.member.update({
      where: { id: target.id },
      data: { failedLoginCount: 0, loginLockedUntil: null },
    });
    redirectUrl.searchParams.set("ok", "member-unlocked");
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (intent === "force-logout") {
    if (isSuperAdminNickname(target.nickname)) {
      redirectUrl.searchParams.set("error", "admin 自身は強制ログアウトできません");
      return NextResponse.redirect(redirectUrl, 303);
    }
    await prisma.member.update({
      where: { id: target.id },
      data: { sessionVersion: { increment: 1 } },
    });
    redirectUrl.searchParams.set("ok", "member-logged-out");
    return NextResponse.redirect(redirectUrl, 303);
  }

  redirectUrl.searchParams.set("error", "操作が不正です");
  return NextResponse.redirect(redirectUrl, 303);
}
