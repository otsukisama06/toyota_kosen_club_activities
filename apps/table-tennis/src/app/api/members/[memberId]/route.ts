import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthorizedAdminMember, isReservedSuperAdminNickname, isSuperAdminNickname } from "@/lib/admin-access";
import { buildRedirectUrl } from "@/lib/request-utils";
import { memberUpdateSchema } from "@/lib/form-schemas";

type RouteContext = {
  params: Promise<{ memberId: string }>;
};

// 部員ごとの更新と削除を扱います。
export async function POST(request: NextRequest, { params }: RouteContext) {
  const adminMember = await getAuthorizedAdminMember();
  if (!adminMember) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { memberId } = await params;
  const actorIsTopAdmin = isSuperAdminNickname(adminMember.nickname) || adminMember.role === "ADMIN";
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "update");
  const redirectTo = String(formData.get("redirectTo") || "/admin");

  if (intent === "update-role") {
    const targetMember = await prisma.member.findUnique({
      where: { id: memberId },
      select: { nickname: true, role: true },
    });

    if (!targetMember) {
      return NextResponse.json({ error: "対象の部員が見つかりません" }, { status: 404 });
    }

    if (isSuperAdminNickname(targetMember.nickname)) {
      return NextResponse.json({ error: "スーパーアドミンの役職は変更できません" }, { status: 403 });
    }

    if (memberId === adminMember.id && !isSuperAdminNickname(adminMember.nickname)) {
      return NextResponse.json({ error: "自分自身の役職は変更できません" }, { status: 403 });
    }

    const requestedRole = String(formData.get("role") || "PLAYER");
    if (requestedRole !== "PLAYER" && requestedRole !== "MANAGER" && requestedRole !== "COACH" && requestedRole !== "ADMIN") {
      return NextResponse.json({ error: "役職はプレイヤー・マネージャー・コーチ・管理者から選択してください" }, { status: 400 });
    }

    if ((requestedRole === "ADMIN" || targetMember.role === "ADMIN") && !actorIsTopAdmin) {
      return NextResponse.json({ error: "管理者の任命・変更は管理者のみ可能です" }, { status: 403 });
    }

    await prisma.member.update({
      where: { id: memberId },
      data: {
        role: requestedRole,
        canAccessAdmin: requestedRole !== "PLAYER",
      },
    });

    return NextResponse.json({ success: true, role: requestedRole });
  }

  const redirectUrl = buildRedirectUrl(request, redirectTo);

  if (intent === "delete") {
    const deleteTarget = await prisma.member.findUnique({
      where: { id: memberId },
      select: { nickname: true, role: true },
    });

    if (!deleteTarget) {
      redirectUrl.searchParams.set("error", "対象の部員が見つかりません");
      return NextResponse.redirect(redirectUrl, 303);
    }

    if (isSuperAdminNickname(deleteTarget.nickname)) {
      redirectUrl.searchParams.set("error", "スーパーアドミンは削除できません");
      return NextResponse.redirect(redirectUrl, 303);
    }

    if (deleteTarget.role === "ADMIN" && !actorIsTopAdmin) {
      redirectUrl.searchParams.set("error", "管理者の削除は管理者のみ可能です");
      return NextResponse.redirect(redirectUrl, 303);
    }

    await prisma.member.delete({
      where: { id: memberId },
    });

    redirectUrl.searchParams.set("ok", "member-deleted");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const parsed = memberUpdateSchema.safeParse({
    email: formData.get("email") ?? undefined,
    nickname: formData.get("nickname"),
    grade: formData.get("grade") || undefined,
  });

  if (!parsed.success) {
    redirectUrl.searchParams.set("error", parsed.error.issues[0]?.message || "入力値が不正です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const targetMember = await prisma.member.findUnique({
    where: { id: memberId },
    select: { nickname: true, role: true },
  });

  if (!targetMember) {
    redirectUrl.searchParams.set("error", "対象の部員が見つかりません");
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (isSuperAdminNickname(targetMember.nickname) || isReservedSuperAdminNickname(parsed.data.nickname)) {
    redirectUrl.searchParams.set("error", "スーパーアドミンに関わるニックネームは変更できません");
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (targetMember.role === "ADMIN" && !actorIsTopAdmin) {
    redirectUrl.searchParams.set("error", "管理者の情報変更は管理者のみ可能です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  try {
    await prisma.member.update({
      where: { id: memberId },
      data: {
        nickname: parsed.data.nickname,
        name: parsed.data.nickname,
        grade: parsed.data.grade,
        // 空欄の場合はメールアドレスを変更しません（ログインの確認コード送信先のため）。
        ...(parsed.data.email ? { email: parsed.data.email } : {}),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : "";
      redirectUrl.searchParams.set(
        "error",
        target.includes("email") ? "そのメールアドレスは既に使われています" : "そのニックネームは既に使われています",
      );
      return NextResponse.redirect(redirectUrl, 303);
    }

    throw error;
  }

  redirectUrl.searchParams.set("ok", "member-updated");
  return NextResponse.redirect(redirectUrl, 303);
}
