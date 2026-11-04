// 開発環境で使う簡易的な管理キーです。
// 本番環境では .env の ADMIN_VIEW_KEY で上書きして使います。
const defaultAdminKey = "toyota-kyudo-admin";

export function getAdminKey(): string {
  const key = process.env.ADMIN_VIEW_KEY?.trim();
  if (key) {
    return key;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_VIEW_KEY is required in production");
  }

  return defaultAdminKey;
}

// URL やヘッダーから受け取ったキーが有効かを判定します。
export function isAdminKeyValid(key: string | null | undefined): boolean {
  if (!key) {
    return false;
  }

  return key === getAdminKey();
}

