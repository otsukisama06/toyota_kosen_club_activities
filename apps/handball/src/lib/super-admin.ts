import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isSuperAdminNickname } from "@/lib/admin-access";
import { getSessionMember } from "@/lib/member-session";
import { CLUB_EMAIL_LABEL } from "@/lib/email-notification";

export const SUPER_ADMIN_HOME_PATH = "/super-admin";

export const MEMBER_ROLE_LABELS: Record<string, string> = {
  PLAYER: "プレイヤー",
  MANAGER: "マネージャー",
  COACH: "コーチ",
  ADMIN: "管理者",
};

// スーパーアドミン（admin ニックネーム）でログインしている場合のみ会員情報を返します。
export async function getSuperAdminMember() {
  const member = await getSessionMember();
  if (!member || !isSuperAdminNickname(member.nickname)) {
    return null;
  }
  return member;
}

// 各ページの先頭で呼び、admin 以外はトップへ戻します（レイアウトだけに頼らずページ単位でも確認します）。
export async function requireSuperAdminPage() {
  const member = await getSuperAdminMember();
  if (!member) {
    redirect("/");
  }
  return member;
}

// メール本文に載せるアプリのURLです。
export async function getAppPublicBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (configured && !/localhost|127\.0\.0\.1/.test(configured)) {
    return configured.replace(/\/$/, "");
  }

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  if (host) {
    const proto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
    return `${proto}://${host}`;
  }

  return configured ? configured.replace(/\/$/, "") : "http://localhost:3000";
}

// 画面描画時点の現在時刻です（サーバーコンポーネントで期限判定に使います）。
export function getRequestTimeMs(): number {
  return Date.now();
}

export type ConsoleMember = {
  id: string;
  nickname: string;
  grade: string | null;
  role: string;
  hasEmail: boolean;
  hasPassword: boolean;
};

// 一斉送信の宛先選択に使う部員一覧です（スーパーアドミン自身は除外）。
export async function listConsoleMembers(): Promise<ConsoleMember[]> {
  const members = await prisma.member.findMany({
    select: { id: true, nickname: true, name: true, grade: true, role: true, email: true, passwordHash: true },
    orderBy: [{ grade: "asc" }, { nickname: "asc" }],
  });

  return members
    .filter((member) => !isSuperAdminNickname(member.nickname))
    .map((member) => ({
      id: member.id,
      nickname: member.nickname || member.name,
      grade: member.grade,
      role: member.role,
      hasEmail: Boolean(member.email?.trim()),
      hasPassword: Boolean(member.passwordHash),
    }));
}

export type BroadcastTarget = "all" | "roles" | "grades" | "no-password" | "selected";

export type BroadcastFilter = {
  target: BroadcastTarget;
  roles: string[];
  grades: string[];
  memberIds: string[];
};

export function isBroadcastTarget(value: string): value is BroadcastTarget {
  return ["all", "roles", "grades", "no-password", "selected"].includes(value);
}

// 宛先条件に一致する部員を絞り込みます（メールアドレス未登録者は常に除外）。
export function filterBroadcastMembers<T extends ConsoleMember>(members: T[], filter: BroadcastFilter): T[] {
  return members.filter((member) => {
    if (!member.hasEmail) {
      return false;
    }
    switch (filter.target) {
      case "all":
        return true;
      case "roles":
        return filter.roles.includes(member.role);
      case "grades":
        return filter.grades.includes(member.grade || "");
      case "no-password":
        return !member.hasPassword;
      case "selected":
        return filter.memberIds.includes(member.id);
      default:
        return false;
    }
  });
}

export function describeBroadcastFilter(filter: BroadcastFilter, memberNicknames: Map<string, string>): string {
  switch (filter.target) {
    case "all":
      return "全部員";
    case "roles":
      return `役職: ${filter.roles.map((role) => MEMBER_ROLE_LABELS[role] || role).join("・")}`;
    case "grades":
      return `学年: ${filter.grades.map((grade) => grade || "未設定").join("・")}`;
    case "no-password":
      return "パスワード未設定の部員";
    case "selected": {
      const names = filter.memberIds.map((id) => memberNicknames.get(id)).filter(Boolean) as string[];
      return `個別指定: ${names.slice(0, 10).join("、")}${names.length > 10 ? ` ほか${names.length - 10}名` : ""}`;
    }
  }
}

// 本文の {nickname} を宛先ごとのニックネームに置き換え、末尾に送信元の説明を付けます。
export function renderBroadcastMessage(body: string, nickname: string): string {
  return [
    body.replaceAll("{nickname}", nickname),
    "",
    "――",
    `このメールは${CLUB_EMAIL_LABEL}アプリの管理者（admin）から一斉送信しています。`,
  ].join("\n");
}

export async function buildPasswordSetupTemplate() {
  const baseUrl = await getAppPublicBaseUrl();
  return {
    subject: `【${CLUB_EMAIL_LABEL}】パスワード設定のお願い`,
    body: [
      "{nickname} さん",
      "",
      `${CLUB_EMAIL_LABEL}アプリのログイン方法が変わりました。`,
      "部活共通パスワードは廃止され、自分で設定したパスワードとメールに届く確認コードでログインします。",
      "",
      "以下のページを開き、このメールアドレスを入力してパスワードを設定してください。",
      `${baseUrl}/auth/password-reset`,
    ].join("\n"),
  };
}

const OK_MESSAGES: Record<string, string> = {
  announcement: "通達を登録しました",
  "announcement-deleted": "通達を削除しました",
  "all-schedules-and-match-scores-deleted": "予定と試合スコアを全削除しました",
  "member-unlocked": "ログイン制限を解除しました",
  "member-logged-out": "対象部員をすべての端末からログアウトさせました",
  "db-compacted": "DB 軽量化を実行しました",
  "db-compacted-aggressive": "DB 軽量化（強力モード）を実行しました",
};

// API から戻ってきた ok パラメータを画面表示用の文言にします。
export function describeOkParam(ok: string | undefined): string | null {
  if (!ok) {
    return null;
  }
  if (OK_MESSAGES[ok]) {
    return OK_MESSAGES[ok];
  }
  if (ok === "test-line-sent") {
    return "出欠確認の LINE 通知をテスト送信しました";
  }
  const broadcast = ok.match(/^broadcast-sent-(\d+)-(\d+)$/);
  if (broadcast) {
    return `一斉送信しました（成功 ${broadcast[1]}件 / 失敗 ${broadcast[2]}件）`;
  }
  return `完了しました: ${ok}`;
}
