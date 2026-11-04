const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";
const LINE_MESSAGE_MAX_LENGTH = 5000;

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// gateway は全環境変数を両アプリへ渡すため、弓道側は KYUDO_ 接頭辞付きの値だけを参照します。
// （共通の LINE_* を読むと卓球部のグループへ誤送信されるおそれがあるため）
export function getLineNotificationConfig() {
  return {
    accessToken: normalizeEnvValue(process.env.KYUDO_LINE_MESSAGING_API_CHANNEL_ACCESS_TOKEN),
    targetId: normalizeEnvValue(process.env.KYUDO_LINE_MESSAGING_API_TARGET_ID),
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
}
