import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { memberAccountRegisterSchema } from "@/lib/form-schemas";
import { isSuperAdminNickname } from "@/lib/admin-access";
import { isValidClubPassword } from "@/lib/club-password";
import { setMemberSession } from "@/lib/member-session";
import { buildAppUrl } from "@/lib/request-utils";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const redirectTo = String(formData.get("redirectTo") || "/auth");
  const redirectUrl = buildAppUrl(request, redirectTo);

  const parsed = memberAccountRegisterSchema.safeParse({
    email: formData.get("email"),
    nickname: formData.get("nickname"),
    grade: formData.get("grade"),
  });
  const clubPassword = String(formData.get("clubPassword") || "");

  if (!parsed.success) {
    redirectUrl.searchParams.set("error", parsed.error.issues[0]?.message || "入力値が不正です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (!isValidClubPassword(clubPassword)) {
    redirectUrl.searchParams.set("error", "部活パスワードが正しくありません");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const duplicated = await prisma.member.findUnique({
    where: { nickname: parsed.data.nickname },
    select: { id: true },
  });

  if (duplicated) {
    redirectUrl.searchParams.set("error", "そのニックネームは既に使われています");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const duplicatedEmail = await prisma.member.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });

  if (duplicatedEmail) {
    redirectUrl.searchParams.set("error", "そのメールアドレスは既に使われています");
    return NextResponse.redirect(redirectUrl, 303);
  }

  try {
    const createdMember = await prisma.member.create({
      data: {
        name: parsed.data.nickname,
        nickname: parsed.data.nickname,
        email: parsed.data.email,
        grade: parsed.data.grade,
        role: (isSuperAdminNickname(parsed.data.nickname) ? "ADMIN" : "PLAYER") as never,
        canAccessAdmin: isSuperAdminNickname(parsed.data.nickname),
      },
      select: { id: true },
    });

    await setMemberSession(createdMember.id, request);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : "";
      if (target.includes("email")) {
        redirectUrl.searchParams.set("error", "そのメールアドレスは既に使われています");
      } else {
        redirectUrl.searchParams.set("error", "そのニックネームは既に使われています");
      }
      return NextResponse.redirect(redirectUrl, 303);
    }

    throw error;
  }

  const successUrl = buildAppUrl(request, "/");
  successUrl.searchParams.set("ok", "registered");
  return NextResponse.redirect(successUrl, 303);
}
