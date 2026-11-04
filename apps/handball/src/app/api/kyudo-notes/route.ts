import { NextRequest, NextResponse } from "next/server";
import { getSessionMember } from "@/lib/member-session";
import { prisma } from "@/lib/prisma";
import { buildAppUrl } from "@/lib/request-utils";

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// 弓道ノートの保存・更新・削除を行う
export async function POST(request: NextRequest) {
  const member = await getSessionMember();
  const formData = await request.formData();
  const redirectTo = String(formData.get("redirectTo") || "/kyudo-notes");
  const redirectUrl = buildAppUrl(request, redirectTo);
  const intent = String(formData.get("intent") || "save");
  const noteId = String(formData.get("noteId") || "");
  const noteDateKey = String(formData.get("noteDateKey") || "");
  const content = String(formData.get("content") || "").trim();

  if (!member) {
    redirectUrl.searchParams.set("error", "unauthorized");
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (!isDateKey(noteDateKey)) {
    redirectUrl.searchParams.set("error", "invalid-date");
    return NextResponse.redirect(redirectUrl, 303);
  }

  try {
    if (intent === "delete") {
      if (noteId) {
        await prisma.kyudoNote.deleteMany({
          where: {
            id: noteId,
            memberId: member.id,
          },
        });
      } else {
        await prisma.kyudoNote.deleteMany({
          where: {
            memberId: member.id,
            noteDateKey,
          },
        });
      }
      redirectUrl.searchParams.set("ok", "deleted");
      return NextResponse.redirect(redirectUrl, 303);
    }

    if (!content) {
      redirectUrl.searchParams.set("error", "invalid-input");
      return NextResponse.redirect(redirectUrl, 303);
    }

    if (noteId) {
      const result = await prisma.kyudoNote.updateMany({
        where: {
          id: noteId,
          memberId: member.id,
        },
        data: {
          content,
          noteDateKey,
        },
      });

      if (result.count === 0) {
        redirectUrl.searchParams.set("error", "not-found");
        return NextResponse.redirect(redirectUrl, 303);
      }

      redirectUrl.searchParams.set("ok", "updated");
      return NextResponse.redirect(redirectUrl, 303);
    }

    await prisma.kyudoNote.create({
      data: {
        memberId: member.id,
        noteDateKey,
        content,
      },
    });

    redirectUrl.searchParams.set("ok", "created");
    return NextResponse.redirect(redirectUrl, 303);
  } catch (error) {
    console.error("Failed to save kyudo note", error);
    redirectUrl.searchParams.set("error", "save-failed");
    return NextResponse.redirect(redirectUrl, 303);
  }
}
