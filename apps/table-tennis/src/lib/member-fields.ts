// 部員情報をブラウザへ返すときに必ず除外する、ログイン認証用の内部項目です（Prisma の omit に渡します）。
export const MEMBER_AUTH_FIELDS_OMIT = {
  passwordHash: true,
  sessionVersion: true,
  failedLoginCount: true,
  loginLockedUntil: true,
} as const;

// 一般の部員も見る画面で他の部員を表示するときに取得する項目です（メールアドレスは含めません）。
export const MEMBER_PUBLIC_SELECT = {
  id: true,
  name: true,
  nickname: true,
  grade: true,
  role: true,
} as const;
