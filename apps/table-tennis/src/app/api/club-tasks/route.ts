import { NextRequest, NextResponse } from "next/server";
import { canAccessAdminByMember } from "@/lib/admin-access";
import { cleanupCompletedExpiredClubTasks } from "@/lib/club-task";
import { buildAppUrl } from "@/lib/request-utils";
import { parseJstDateTimeInputToUtc } from "@/lib/date-format";
import { clubTaskSchema, clubTaskUpdateSchema } from "@/lib/form-schemas";
import { getSessionMember } from "@/lib/member-session";
import { prisma } from "@/lib/prisma";

function redirectWithError(request: NextRequest, redirectTo: string, message: string): NextResponse {
  const redirectUrl = buildAppUrl(request, redirectTo || "/");
  redirectUrl.searchParams.set("error", message);
  return NextResponse.redirect(redirectUrl, 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "create");
  const redirectTo = String(formData.get("redirectTo") || "/");

  try {
    const member = await getSessionMember();

    if (!member) {
      return redirectWithError(request, "/auth", "ログインしてください");
    }

    if (!canAccessAdminByMember(member)) {
      return redirectWithError(request, redirectTo, "管理者権限のあるプレイヤーのみ操作できます");
    }

    await cleanupCompletedExpiredClubTasks();

    if (intent === "delete") {
      const taskId = String(formData.get("taskId") || "");
      if (!taskId) {
        return redirectWithError(request, redirectTo, "削除対象が指定されていません");
      }

      const task = await prisma.clubTask.findUnique({ where: { id: taskId }, select: { id: true } });
      if (!task) {
        return redirectWithError(request, redirectTo, "タスクが見つかりませんでした");
      }

      await prisma.clubTask.delete({ where: { id: taskId } });
      const redirectUrl = buildAppUrl(request, redirectTo);
      redirectUrl.searchParams.set("ok", "club-task-deleted");
      return NextResponse.redirect(redirectUrl, 303);
    }

    if (intent === "toggle-complete") {
      const taskId = String(formData.get("taskId") || "");
      if (!taskId) {
        return redirectWithError(request, redirectTo, "更新対象が指定されていません");
      }

      const task = await prisma.clubTask.findUnique({ where: { id: taskId } });
      if (!task) {
        return redirectWithError(request, redirectTo, "タスクが見つかりませんでした");
      }

      await prisma.clubTask.update({
        where: { id: taskId },
        data: {
          isCompleted: !task.isCompleted,
          completedAt: task.isCompleted ? null : new Date(),
        },
      });

      const redirectUrl = buildAppUrl(request, redirectTo);
      redirectUrl.searchParams.set("ok", "club-task-updated");
      return NextResponse.redirect(redirectUrl, 303);
    }

    if (intent === "update-deadline") {
      const parsed = clubTaskUpdateSchema.safeParse({
        taskId: formData.get("taskId"),
        deadlineOn: formData.get("deadlineOn"),
      });

      if (!parsed.success) {
        const redirectUrl = buildAppUrl(request, redirectTo);
        redirectUrl.searchParams.set("error", parsed.error.issues[0]?.message || "入力値が不正です");
        return NextResponse.redirect(redirectUrl, 303);
      }

      const existingTask = await prisma.clubTask.findUnique({ where: { id: parsed.data.taskId }, select: { id: true } });
      if (!existingTask) {
        return redirectWithError(request, redirectTo, "タスクが見つかりませんでした");
      }

      const deadlineOn = parseJstDateTimeInputToUtc(parsed.data.deadlineOn);
      if (Number.isNaN(deadlineOn.getTime())) {
        return redirectWithError(request, redirectTo, "締め切り日が不正です");
      }

      await prisma.clubTask.update({
        where: { id: parsed.data.taskId },
        // 締め切りを変更したら、新しい締め切りに合わせて再通知します。
        data: { deadlineOn, notifiedAt: null },
      });

      const redirectUrl = buildAppUrl(request, redirectTo);
      redirectUrl.searchParams.set("ok", "club-task-deadline-updated");
      return NextResponse.redirect(redirectUrl, 303);
    }

    const parsed = clubTaskSchema.safeParse({
      title: formData.get("title"),
      deadlineOn: formData.get("deadlineOn"),
    });

    if (!parsed.success) {
      const redirectUrl = buildAppUrl(request, redirectTo);
      redirectUrl.searchParams.set("error", parsed.error.issues[0]?.message || "入力値が不正です");
      return NextResponse.redirect(redirectUrl, 303);
    }

    const deadlineOn = parseJstDateTimeInputToUtc(parsed.data.deadlineOn);
    if (Number.isNaN(deadlineOn.getTime())) {
      return redirectWithError(request, redirectTo, "締め切り日が不正です");
    }

    await prisma.clubTask.create({
      data: {
        title: parsed.data.title,
        deadlineOn,
        notificationDaysBefore: parsed.data.notificationDaysBefore ?? 3,
        createdByMemberId: member.id,
      },
    });

    const redirectUrl = buildAppUrl(request, redirectTo);
    redirectUrl.searchParams.set("ok", "club-task-created");
    return NextResponse.redirect(redirectUrl, 303);
  } catch (error) {
    console.error("[api/club-tasks] failed to process request", error);
    return redirectWithError(request, redirectTo, "タスクの操作に失敗しました。DB接続と migration 状態を確認してください");
  }
}