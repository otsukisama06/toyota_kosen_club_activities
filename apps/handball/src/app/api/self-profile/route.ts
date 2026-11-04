import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { selfProfileUpdateSchema } from "@/lib/form-schemas";
import { getSessionMember } from "@/lib/member-session";
import { buildAppUrl } from "@/lib/request-utils";

// 本人のプロフィール（メール/ニックネーム/学年/目標）を更新します。
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const redirectTo = String(formData.get("redirectTo") || "/");
  const redirectUrl = buildAppUrl(request, redirectTo);

  const member = await getSessionMember();
  if (!member) {
    const authUrl = buildAppUrl(request, "/auth");
    authUrl.searchParams.set("error", "ログインしてください");
    return NextResponse.redirect(authUrl, 303);
  }

  const parsed = selfProfileUpdateSchema.safeParse({
    email: formData.get("email"),
    nickname: formData.get("nickname"),
    grade: formData.get("grade"),
    yearlyGoal: formData.get("yearlyGoal") || undefined,
    monthlyGoal: formData.get("monthlyGoal") || undefined,
  });

  if (!parsed.success) {
    redirectUrl.searchParams.set("error", parsed.error.issues[0]?.message || "入力値が不正です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  try {
    const updateData = {
      email: parsed.data.email,
      nickname: parsed.data.nickname,
      name: parsed.data.nickname,
      grade: parsed.data.grade,
      yearlyGoal: parsed.data.yearlyGoal || null,
      monthlyGoal: parsed.data.monthlyGoal || null,
    } as Prisma.MemberUncheckedUpdateInput;

    await prisma.member.update({
      where: { id: member.id },
      data: updateData,
    });
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

  redirectUrl.searchParams.set("ok", "profile-updated");
  return NextResponse.redirect(redirectUrl, 303);
}
