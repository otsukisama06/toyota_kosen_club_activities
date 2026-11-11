// メール送信には Brevo（旧 Sendinblue）のトランザクションメール API を使います。
const BREVO_SEND_EMAIL_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

// メール件名・本文に使う部活名です。
export const CLUB_EMAIL_LABEL = "卓球部";

type SendEmailArgs = {
  to: string;
  message: string;
  subject: string;
};

type SendEmailResult = {
  sent: boolean;
  skipped: boolean;
  status?: number;
  error?: string;
};

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getEmailConfig() {
  return {
    apiKey: normalizeEnvValue(process.env.BREVO_API_KEY),
    from:
      normalizeEnvValue(process.env.ATTENDANCE_REMINDER_EMAIL_FROM) ||
      normalizeEnvValue(process.env.EMAIL_FROM),
  };
}

export function isAttendanceReminderEmailEnabled(): boolean {
  const config = getEmailConfig();
  return Boolean(config.apiKey && config.from);
}

export async function sendEmail({ to, message, subject }: SendEmailArgs): Promise<SendEmailResult> {
  const config = getEmailConfig();

  if (!config.apiKey || !config.from) {
    return { sent: false, skipped: true };
  }

  try {
    const response = await fetch(BREVO_SEND_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: CLUB_EMAIL_LABEL, email: config.from },
        to: [{ email: to }],
        subject,
        textContent: message,
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
  } catch (error) {
    return { sent: false, skipped: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function sendAttendanceReminderEmail({
  to,
  message,
  subject,
}: Omit<SendEmailArgs, "subject"> & { subject?: string }) {
  return sendEmail({
    to,
    message,
    subject: subject || "【卓球部】出欠登録をお願いします",
  });
}

export type BulkEmailMessage = {
  to: string;
  subject: string;
  message: string;
};

// 宛先ごとに個別のメールとして順番に送ります（他の宛先が見えないようにするため）。
export async function sendBulkEmails(messages: BulkEmailMessage[]) {
  if (!isAttendanceReminderEmailEnabled()) {
    return { sent: 0, failed: 0, skipped: true, errors: [] as string[] };
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of messages) {
    const result = await sendEmail({ to: item.to, subject: item.subject, message: item.message });
    if (result.sent) {
      sent += 1;
    } else {
      failed += 1;
      if (!result.skipped && errors.length < 10) {
        errors.push(`${result.status ?? ""} ${result.error ?? ""}`.trim());
      }
    }
  }

  return { sent, failed, skipped: false, errors };
}
