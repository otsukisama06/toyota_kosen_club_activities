import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email-notification";
import { isSuperAdminNickname } from "@/lib/admin-access";
import { formatDateTime, toDateKey } from "@/lib/date-format";

const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5分間隔
const MAX_DAYS_AHEAD = 30; // 最大30日前から通知

type AdminMember = {
  id: string;
  nickname: string;
  email: string | null;
};

type ClubTaskWithDeadline = {
  id: string;
  title: string;
  deadlineOn: Date;
  notificationDaysBefore: number;
  notifiedAt: Date | null;
  createdByMemberId: string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __taskDeadlineReminderSchedulerStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __taskDeadlineReminderSweepRunning: boolean | undefined;
}

function getPublicBaseUrl(): string {
  return "https://toyotakosenclubnotes.cc";
}

function buildTaskDeadlineReminderMessage(task: ClubTaskWithDeadline, adminName: string): string {
  const deadlineDate = toDateKey(task.deadlineOn);
  const daysUntilDeadline = task.notificationDaysBefore;
  
  const lines = [
    `【弓道部】タスク締め切り通知`,
    `対象タスク: ${task.title}`,
    `締め切り日: ${deadlineDate}`,
    `残り${daysUntilDeadline}日`,
    `作成者: ${adminName}`,
    `確認: ${new URL("/club-task-board", getPublicBaseUrl()).toString()}`,
  ];

  return lines.join("\n");
}

async function sweepOnce(): Promise<{
  scanned: number;
  emailSent: number;
  skipped: boolean;
}> {
  if (globalThis.__taskDeadlineReminderSweepRunning) {
    return { scanned: 0, emailSent: 0, skipped: true };
  }

  globalThis.__taskDeadlineReminderSweepRunning = true;

  try {
    const now = new Date();
    
    // 未完了のタスクを取得
    const incompleteTasks = await prisma.clubTask.findMany({
      where: {
        isCompleted: false,
        notifiedAt: null,
        deadlineOn: {
          gte: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 1日以上先
          lte: new Date(now.getTime() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000), // 30日以内
        },
      },
      select: {
        id: true,
        title: true,
        deadlineOn: true,
        notificationDaysBefore: true,
        notifiedAt: true,
        createdByMemberId: true,
      },
      orderBy: { deadlineOn: "asc" },
    });

    if (incompleteTasks.length === 0) {
      return { scanned: 0, emailSent: 0, skipped: false };
    }

    // 管理者メンバーを取得
    const adminMembers = await prisma.member.findMany({
      where: {
        canAccessAdmin: true,
      },
      select: {
        id: true,
        nickname: true,
        email: true,
      },
    });

    const admins: AdminMember[] = adminMembers
      .filter((member): member is AdminMember => member.nickname !== null && !isSuperAdminNickname(member.nickname))

    let emailSentCount = 0;

    for (const task of incompleteTasks) {
      // 各管理者に通知
      for (const admin of admins) {
        const message = buildTaskDeadlineReminderMessage(task, admin.nickname);

        // メール送信
        if (admin.email) {
          const emailResult = await sendEmail({
            to: admin.email,
            subject: `【弓道部】タスク締め切りまで${task.notificationDaysBefore}日: ${task.title}`,
            message,
          });

          if (emailResult.sent) {
            emailSentCount += 1;
          } else if (!emailResult.skipped) {
            console.error("Task deadline reminder email failed", {
              taskId: task.id,
              adminId: admin.id,
              status: emailResult.status,
              error: emailResult.error,
            });
          }
        }
      }

      // 通知済みとしてマーク
      await prisma.clubTask.update({
        where: { id: task.id },
        data: { notifiedAt: new Date() },
      });
    }

    return {
      scanned: incompleteTasks.length,
      emailSent: emailSentCount,
      skipped: false,
    };
  } finally {
    globalThis.__taskDeadlineReminderSweepRunning = false;
  }
}

export async function sendTaskDeadlineReminders(): Promise<{
  scanned: number;
  emailSent: number;
  skipped: boolean;
}> {
  return sweepOnce();
}

export function startTaskDeadlineReminderScheduler(): void {
  if (globalThis.__taskDeadlineReminderSchedulerStarted) {
    return;
  }

  globalThis.__taskDeadlineReminderSchedulerStarted = true;

  void sweepOnce().catch((error) => {
    console.error("Initial task deadline reminder sweep failed", error);
  });

  setInterval(() => {
    void sweepOnce().catch((error) => {
      console.error("Task deadline reminder sweep failed", error);
    });
  }, SCAN_INTERVAL_MS);
}