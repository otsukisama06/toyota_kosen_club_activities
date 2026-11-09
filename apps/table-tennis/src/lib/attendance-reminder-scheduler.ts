import { AttendanceEventType } from "@prisma/client";
import { formatDateTime, toDateKey } from "@/lib/date-format";
import { isAttendanceReminderEmailEnabled, sendAttendanceReminderEmail } from "@/lib/email-notification";
import { isSuperAdminNickname } from "@/lib/admin-access";
import { prisma } from "@/lib/prisma";

const REMINDER_LEAD_MINUTES = 45;
const REMINDER_SCAN_WINDOW_MINUTES = 2;
const REMINDER_INTERVAL_MS = 60_000;

type AttendanceEventReminder = {
  id: string;
  title: string;
  scheduledAt: Date;
  eventType: AttendanceEventType;
  matchOpponent: string | null;
  matchDetail: string | null;
  note: string | null;
};

type ReminderSweepResult = {
  scanned: number;
  sent: number;
  skipped: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __tableTennisAttendanceReminderSchedulerStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __tableTennisAttendanceReminderSweepRunning: boolean | undefined;
}

function getPublicBaseUrl(): string {
  return "https://toyotakosenclubnotes.cc";
}

function buildReminderMessage(event: AttendanceEventReminder): string {
  const eventDateKey = toDateKey(event.scheduledAt);
  const attendanceUrl = new URL(`/calendar/${eventDateKey}`, `${getPublicBaseUrl()}/`).toString();
  const lines = [
    "【卓球部】出欠登録のお願い",
    `予定: ${event.title}`,
    `開始: ${formatDateTime(event.scheduledAt)}`,
    `開始まであと約${Math.max(1, Math.round((event.scheduledAt.getTime() - Date.now()) / 60_000))}分です。出欠登録をお願いします。`,
    `確認: ${attendanceUrl}`,
  ];

  if (event.eventType === AttendanceEventType.MATCH && event.matchOpponent) {
    lines.splice(2, 0, `対戦相手: ${event.matchOpponent}`);
  }

  if (event.matchDetail) {
    lines.push(`試合詳細: ${event.matchDetail}`);
  }

  if (event.note) {
    lines.push(`補足: ${event.note}`);
  }

  return lines.join("\n");
}

async function sweepOnce(): Promise<ReminderSweepResult> {
  if (!isAttendanceReminderEmailEnabled()) {
    return { scanned: 0, sent: 0, skipped: true };
  }

  if (globalThis.__tableTennisAttendanceReminderSweepRunning) {
    return { scanned: 0, sent: 0, skipped: true };
  }

  globalThis.__tableTennisAttendanceReminderSweepRunning = true;

  try {
    const now = new Date();
    // 開始45分前を過ぎても未送信の予定（直前に作成・サーバー停止中など）は、開始前であれば送信します。
    const windowStart = now;
    const windowEnd = new Date(now.getTime() + (REMINDER_LEAD_MINUTES + REMINDER_SCAN_WINDOW_MINUTES - 1) * 60_000);

    const dueEvents = await prisma.attendanceEvent.findMany({
      where: {
        reminderSentAt: null,
        eventType: {
          in: [AttendanceEventType.PRACTICE, AttendanceEventType.MATCH],
        },
        scheduledAt: {
          gte: windowStart,
          lt: windowEnd,
        },
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        eventType: true,
        matchOpponent: true,
        matchDetail: true,
        note: true,
      },
    });

    const recipientMembers = await prisma.member.findMany({
      where: {
        email: {
          not: null,
        },
      },
      select: {
        nickname: true,
        email: true,
      },
    });

    const recipientEmails = recipientMembers
      .filter((member) => !isSuperAdminNickname(member.nickname))
      .map((member) => member.email?.trim() || "")
      .filter((email) => email.length > 0);

    let sentCount = 0;

    for (const event of dueEvents) {
      const message = buildReminderMessage(event);
      if (recipientEmails.length === 0) {
        console.warn("Attendance reminder skipped because no recipient emails are registered", {
          eventId: event.id,
        });
        continue;
      }

      let deliveredCount = 0;

      for (const recipientEmail of recipientEmails) {
        const perRecipientResult = await sendAttendanceReminderEmail({
          to: recipientEmail,
          message,
        });

        if (perRecipientResult.sent) {
          deliveredCount += 1;
        } else if (!perRecipientResult.skipped) {
          console.error("Attendance reminder email failed", {
            eventId: event.id,
            recipients: 1,
            status: perRecipientResult.status,
            error: perRecipientResult.error,
          });
        }
      }

      if (deliveredCount > 0) {
        await prisma.attendanceEvent.update({
          where: { id: event.id },
          data: { reminderSentAt: new Date() },
        });
        sentCount += 1;
      } else {
        console.warn("Attendance reminder had no successful email delivery", {
          eventId: event.id,
          recipients: recipientEmails.length,
        });
      }
    }

    return { scanned: dueEvents.length, sent: sentCount, skipped: false };
  } finally {
    globalThis.__tableTennisAttendanceReminderSweepRunning = false;
  }
}

export async function sendDueAttendanceReminders(): Promise<ReminderSweepResult> {
  return sweepOnce();
}

export async function sendTestConfirmationEmailToAllMembers(): Promise<{ total: number; sent: number }> {
  if (!isAttendanceReminderEmailEnabled()) {
    return { total: 0, sent: 0 };
  }

  const recipients = await prisma.member.findMany({
    where: {
      email: {
        not: null,
      },
    },
    select: {
      nickname: true,
      email: true,
    },
  });

  const emails = recipients
    .filter((member) => !isSuperAdminNickname(member.nickname))
    .map((member) => member.email?.trim() || "")
    .filter((email) => email.length > 0);

  if (emails.length === 0) {
    return { total: 0, sent: 0 };
  }

  const baseUrl = getPublicBaseUrl();
  const message = [
    "【テスト送信】出欠確認メール送信機能の確認です。",
    "出欠登録をお願いします。",
    `確認: ${new URL("/", `${baseUrl}/`).toString()}`,
  ].join("\n");

  let deliveredCount = 0;

  for (const email of emails) {
    const result = await sendAttendanceReminderEmail({
      to: email,
      subject: "【卓球部】出欠確認メール（テスト送信）",
      message,
    });

    if (result.sent) {
      deliveredCount += 1;
    } else if (!result.skipped) {
      console.error("Test confirmation email failed", {
        recipients: 1,
        status: result.status,
        error: result.error,
      });
    }
  }

  return { total: emails.length, sent: deliveredCount };
}

export function startAttendanceReminderScheduler(): void {
  if (globalThis.__tableTennisAttendanceReminderSchedulerStarted) {
    return;
  }

  globalThis.__tableTennisAttendanceReminderSchedulerStarted = true;

  void sweepOnce().catch((error) => {
    console.error("Initial attendance reminder sweep failed", error);
  });

  setInterval(() => {
    void sweepOnce().catch((error) => {
      console.error("Attendance reminder sweep failed", error);
    });
  }, REMINDER_INTERVAL_MS);
}
