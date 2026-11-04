import { Prisma } from "@prisma/client";
import { isSuperAdminNickname } from "@/lib/admin-access";
import { addJstDays, createJstDate, getJstDateParts, nowInJst, toDateKey } from "@/lib/date-format";
import { sendEmail } from "@/lib/email-notification";
import { prisma } from "@/lib/prisma";
import { formatRaspberryPiStatusMessage, getRaspberryPiStatus } from "@/lib/system-status";

const TARGET_HOUR = 7;

declare global {
  // eslint-disable-next-line no-var
  var __kyudoAdminDailyStatusSchedulerStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __kyudoAdminDailyStatusSchedulerRunning: boolean | undefined;
}

function isAfterOrAtTargetHour(date: Date): boolean {
  const parts = getJstDateParts(date);
  return parts.hour >= TARGET_HOUR;
}

async function getAdminRecipientEmails(): Promise<string[]> {
  const members = await prisma.member.findMany({
    where: {
      email: { not: null },
    },
    select: {
      nickname: true,
      email: true,
    },
  });

  return members
    .filter((member) => isSuperAdminNickname(member.nickname))
    .map((member) => member.email?.trim() || "")
    .filter((email) => email.length > 0);
}

async function sendDailyReportOnce(): Promise<{ sent: boolean; skipped: boolean; reason?: string }> {
  if (globalThis.__kyudoAdminDailyStatusSchedulerRunning) {
    return { sent: false, skipped: true, reason: "already-running" };
  }

  globalThis.__kyudoAdminDailyStatusSchedulerRunning = true;

  try {
    const currentTime = nowInJst();
    if (!isAfterOrAtTargetHour(currentTime)) {
      return { sent: false, skipped: true, reason: "before-target-hour" };
    }

    const reportDateKey = toDateKey(currentTime);
    const existingReport = await prisma.dailyAdminStatusReport.findUnique({
      where: { reportDateKey },
      select: { id: true },
    });

    if (existingReport) {
      return { sent: false, skipped: true, reason: "already-sent" };
    }

    const recipients = await getAdminRecipientEmails();
    if (recipients.length === 0) {
      return { sent: false, skipped: true, reason: "no-recipient" };
    }

    const status = await getRaspberryPiStatus();
    const statusText = formatRaspberryPiStatusMessage(status);

    await prisma.dailyAdminStatusReport.create({
      data: {
        reportDateKey,
        statusText,
      },
    });

    let sentCount = 0;
    for (const recipient of recipients) {
      const result = await sendEmail({
        to: recipient,
        subject: "【弓道部】ラズパイ状態レポート",
        message: statusText,
      });

      if (result.sent) {
        sentCount += 1;
      }
    }

    if (sentCount === 0) {
      await prisma.dailyAdminStatusReport.update({
        where: { reportDateKey },
        data: {
          statusText: `${statusText}\n\nメール送信に失敗しました`,
        },
      });
      return { sent: false, skipped: false, reason: "delivery-failed" };
    }

    return { sent: true, skipped: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { sent: false, skipped: true, reason: "already-sent" };
    }

    console.error("Daily admin status report failed", error);
    return { sent: false, skipped: false, reason: "error" };
  } finally {
    globalThis.__kyudoAdminDailyStatusSchedulerRunning = false;
  }
}

function scheduleNextRun(): number {
  const now = nowInJst();
  const parts = getJstDateParts(now);
  const nextRunDate = parts.hour >= TARGET_HOUR ? addJstDays(now, 1) : now;
  const nextParts = getJstDateParts(nextRunDate);
  const nextRun = createJstDate(nextParts.year, nextParts.month - 1, nextParts.day, TARGET_HOUR, 0);
  const delay = Math.max(nextRun.getTime() - now.getTime(), 60_000);
  return delay;
}

export async function runDailyAdminStatusReport(): Promise<void> {
  await sendDailyReportOnce();
}

export function startDailyAdminStatusScheduler(): void {
  if (globalThis.__kyudoAdminDailyStatusSchedulerStarted) {
    return;
  }

  globalThis.__kyudoAdminDailyStatusSchedulerStarted = true;

  void runDailyAdminStatusReport().catch((error) => {
    console.error("Initial daily admin status report failed", error);
  });

  const schedule = () => {
    const delay = scheduleNextRun();
    setTimeout(() => {
      void runDailyAdminStatusReport().catch((error) => {
        console.error("Daily admin status report failed", error);
      }).finally(() => {
        schedule();
      });
    }, delay);
  };

  schedule();
}