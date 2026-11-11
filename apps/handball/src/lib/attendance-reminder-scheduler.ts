import { AttendanceEventType } from "@prisma/client";
import { formatDateTime, toDateKey } from "@/lib/date-format";
import { isLineNotificationEnabled, sendLineNotification } from "@/lib/line-notification";
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
  var __kyudoAttendanceReminderSchedulerStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __kyudoAttendanceReminderSweepRunning: boolean | undefined;
}

function getPublicBaseUrl(): string {
  return "https://toyotakosenclubnotes.cc";
}

function buildReminderMessage(event: AttendanceEventReminder): string {
  const eventDateKey = toDateKey(event.scheduledAt);
  const attendanceUrl = new URL(`/calendar/${eventDateKey}`, `${getPublicBaseUrl()}/`).toString();
  const lines = [
    "【弓道部】出欠登録のお願い",
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
  // 弓道部の出欠確認は部員ごとのメールではなく、LINE グループへ1通だけ送ります。
  if (!isLineNotificationEnabled()) {
    return { scanned: 0, sent: 0, skipped: true };
  }

  if (globalThis.__kyudoAttendanceReminderSweepRunning) {
    return { scanned: 0, sent: 0, skipped: true };
  }

  globalThis.__kyudoAttendanceReminderSweepRunning = true;

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

    let sentCount = 0;

    for (const event of dueEvents) {
      const result = await sendLineNotification(buildReminderMessage(event));

      if (result.sent) {
        await prisma.attendanceEvent.update({
          where: { id: event.id },
          data: { reminderSentAt: new Date() },
        });
        sentCount += 1;
      } else if (!result.skipped) {
        console.error("Attendance reminder LINE notification failed", {
          eventId: event.id,
          status: result.status,
          error: result.error,
        });
      }
    }

    return { scanned: dueEvents.length, sent: sentCount, skipped: false };
  } finally {
    globalThis.__kyudoAttendanceReminderSweepRunning = false;
  }
}

export async function sendDueAttendanceReminders(): Promise<ReminderSweepResult> {
  return sweepOnce();
}

// 出欠確認の LINE 通知が届くかどうかを、設定済みの LINE グループへテスト送信して確認します。
export async function sendTestAttendanceLineNotification(): Promise<{ sent: boolean; error?: string }> {
  if (!isLineNotificationEnabled()) {
    return { sent: false, error: "LINE 通知の設定（チャネルアクセストークン・送信先ID）が未設定です" };
  }

  const baseUrl = getPublicBaseUrl();
  const message = [
    "【弓道部】出欠確認 LINE 通知のテスト送信です。",
    "練習・試合の開始45分前に、このグループへ出欠登録のお願いが届きます。",
    `確認: ${new URL("/", `${baseUrl}/`).toString()}`,
  ].join("\n");

  const result = await sendLineNotification(message);
  if (!result.sent) {
    console.error("Test attendance LINE notification failed", {
      status: result.status,
      error: result.error,
    });
    return { sent: false, error: "LINE への送信に失敗しました。トークンと送信先IDを確認してください" };
  }

  return { sent: true };
}

export function startAttendanceReminderScheduler(): void {
  if (globalThis.__kyudoAttendanceReminderSchedulerStarted) {
    return;
  }

  globalThis.__kyudoAttendanceReminderSchedulerStarted = true;

  void sweepOnce().catch((error) => {
    console.error("Initial attendance reminder sweep failed", error);
  });

  setInterval(() => {
    void sweepOnce().catch((error) => {
      console.error("Attendance reminder sweep failed", error);
    });
  }, REMINDER_INTERVAL_MS);
}
