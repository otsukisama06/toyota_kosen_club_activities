import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email-notification";
import { isSuperAdminNickname } from "@/lib/admin-access";
import { toDateKey } from "@/lib/date-format";

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
  createdBy: { nickname: string | null } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// JST の日付単位で、締め切りまでの残り日数を求めます。
function daysUntilDeadline(deadlineOn: Date, now: Date): number {
  const [deadlineYear, deadlineMonth, deadlineDay] = toDateKey(deadlineOn).split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = toDateKey(now).split("-").map(Number);
  return Math.round(
    (Date.UTC(deadlineYear, deadlineMonth - 1, deadlineDay) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / DAY_MS,
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __taskDeadlineReminderSchedulerStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __taskDeadlineReminderSweepRunning: boolean | undefined;
}

function getPublicBaseUrl(): string {
  return "https://toyotakosenclubnotes.cc";
}

function buildTaskDeadlineReminderMessage(task: ClubTaskWithDeadline, remainingDays: number): string {
  const deadlineDate = toDateKey(task.deadlineOn);
  const creatorName = task.createdBy?.nickname || "不明";
  
  const lines = [
    `【弓道部】タスク締め切り通知`,
    `対象タスク: ${task.title}`,
    `締め切り日: ${deadlineDate}`,
    `残り${remainingDays}日`,
    `作成者: ${creatorName}`,
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
    const candidateTasks = await prisma.clubTask.findMany({
      where: {
        isCompleted: false,
        notifiedAt: null,
        deadlineOn: {
          gte: now,
          lte: new Date(now.getTime() + (MAX_DAYS_AHEAD + 1) * DAY_MS), // 30日以内
        },
      },
      select: {
        id: true,
        title: true,
        deadlineOn: true,
        notificationDaysBefore: true,
        notifiedAt: true,
        createdByMemberId: true,
        createdBy: { select: { nickname: true } },
      },
      orderBy: { deadlineOn: "asc" },
    });

    // 「締め切りの N 日前」に達したタスクだけを通知対象にします。
    const incompleteTasks = candidateTasks
      .map((task) => ({ task, remainingDays: daysUntilDeadline(task.deadlineOn, now) }))
      .filter(({ task, remainingDays }) => remainingDays >= 1 && remainingDays <= task.notificationDaysBefore);

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

    for (const { task, remainingDays } of incompleteTasks) {
      const message = buildTaskDeadlineReminderMessage(task, remainingDays);

      // 各管理者に通知
      for (const admin of admins) {
        // メール送信
        if (admin.email) {
          const emailResult = await sendEmail({
            to: admin.email,
            subject: `【弓道部】タスク締め切りまで${remainingDays}日: ${task.title}`,
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