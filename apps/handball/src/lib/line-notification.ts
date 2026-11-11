const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";
const LINE_MESSAGE_MAX_LENGTH = 5000;

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// docker compose では両アプリに同じ環境変数が渡るため、弓道部専用の HANDBALL_* を最優先で読みます。
export function getLineNotificationConfig() {
  return {
    accessToken:
      normalizeEnvValue(process.env.HANDBALL_LINE_MESSAGING_API_CHANNEL_ACCESS_TOKEN) ||
      normalizeEnvValue(process.env.LINE_MESSAGING_API_CHANNEL_ACCESS_TOKEN),
    targetId:
      normalizeEnvValue(process.env.HANDBALL_LINE_MESSAGING_API_TARGET_ID) ||
      normalizeEnvValue(process.env.LINE_MESSAGING_API_TARGET_ID),
  };
}

export function isLineNotificationEnabled(): boolean {
  const config = getLineNotificationConfig();
  return Boolean(config.accessToken && config.targetId);
}

function clampMessageLength(message: string): string {
  if (message.length <= LINE_MESSAGE_MAX_LENGTH) {
    return message;
  }

  return `${message.slice(0, LINE_MESSAGE_MAX_LENGTH - 1)}…`;
}

export async function sendLineNotification(message: string) {
  const config = getLineNotificationConfig();

  if (!config.accessToken || !config.targetId) {
    return { sent: false, skipped: true };
  }

  try {
    const response = await fetch(LINE_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: config.targetId,
        messages: [{ type: "text", text: clampMessageLength(message) }],
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
