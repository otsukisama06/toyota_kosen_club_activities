const RESEND_SEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

// メール件名・本文に使う部活名です。
export const CLUB_EMAIL_LABEL = "弓道部";

// 弓道部の送信元アドレスは固定です（共通の EMAIL_FROM は卓球アプリ用のため参照しません）。
const KYUDO_EMAIL_FROM = "kyudo@toyotakosenclubnotes.cc";

type SendEmailArgs = {
  to: string;
  message: string;
  subject: string;
};

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getAttendanceReminderEmailConfig() {
  return {
    apiKey:
      normalizeEnvValue(process.env.ATTENDANCE_REMINDER_EMAIL_API_KEY) ||
      normalizeEnvValue(process.env.RESEND_API_KEY),
    from: KYUDO_EMAIL_FROM,
  };
}

export function isAttendanceReminderEmailEnabled(): boolean {
  const config = getAttendanceReminderEmailConfig();
  return Boolean(config.apiKey && config.from);
}

export async function sendEmail({
  to,
  message,
  subject,
}: SendEmailArgs) {
  const config = getAttendanceReminderEmailConfig();

  if (!config.apiKey || !config.from) {
    return { sent: false, skipped: true };
  }

  const response = await fetch(RESEND_SEND_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [to],
      subject,
      text: message,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    return {
      sent: false,
      skipped: false,
      status: response.status,
      error: errorBody.slice(0, 300) || response.statusText,
    };
  }

  return { sent: true, skipped: false };
}

export async function sendAttendanceReminderEmail({
  to,
  message,
  subject,
}: Omit<SendEmailArgs, "subject"> & { subject?: string }) {
  return sendEmail({
    to,
    message,
    subject: subject || "【弓道部】出欠登録をお願いします",
  });
}

const RESEND_BATCH_EMAIL_ENDPOINT = "https://api.resend.com/emails/batch";
const RESEND_BATCH_MAX = 100;

export type BulkEmailMessage = {
  to: string;
  subject: string;
  message: string;
};

// 宛先ごとに個別のメールとして送ります（他の宛先が見えないようにするため）。Resend のバッチ送信で100件ずつ送信します。
export async function sendBulkEmails(messages: BulkEmailMessage[]) {
  const config = getAttendanceReminderEmailConfig();

  if (!config.apiKey || !config.from) {
    return { sent: 0, failed: 0, skipped: true, errors: [] as string[] };
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let index = 0; index < messages.length; index += RESEND_BATCH_MAX) {
    const chunk = messages.slice(index, index + RESEND_BATCH_MAX);
    try {
      const response = await fetch(RESEND_BATCH_EMAIL_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          chunk.map((item) => ({
            from: config.from,
            to: [item.to],
            subject: item.subject,
            text: item.message,
          })),
        ),
      });

      if (response.ok) {
        sent += chunk.length;
      } else {
        failed += chunk.length;
        const errorBody = await response.text().catch(() => "");
        errors.push(`${response.status} ${errorBody.slice(0, 200) || response.statusText}`);
      }
    } catch (error) {
      failed += chunk.length;
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return { sent, failed, skipped: false, errors };
}
