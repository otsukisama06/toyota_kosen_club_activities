const RESEND_SEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

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
    from:
      normalizeEnvValue(process.env.ATTENDANCE_REMINDER_EMAIL_FROM) ||
      normalizeEnvValue(process.env.EMAIL_FROM),
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
