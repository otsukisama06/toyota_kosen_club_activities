import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { randomBytes, randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { CLUB_EMAIL_LABEL, sendEmail } from "@/lib/email-notification";
import { AUTH_CHALLENGE_COOKIE, isValidSignature, shouldUseSecureCookie, signValue } from "@/lib/member-session";

export type AuthChallengePurpose = "LOGIN" | "REGISTER" | "PASSWORD_RESET";

export const AUTH_CODE_TTL_MINUTES = 10;
const AUTH_CODE_TTL_MS = AUTH_CODE_TTL_MINUTES * 60 * 1000;
const AUTH_CODE_MAX_ATTEMPTS = 5;
const AUTH_CODE_RESEND_COOLDOWN_MS = 60 * 1000;
const AUTH_CHALLENGE_COOKIE_MAX_AGE = 30 * 60;

export type PendingChallenge = {
  id: string;
  purpose: AuthChallengePurpose;
  memberId: string | null;
  email: string;
  payload: Prisma.JsonValue | null;
  sentAt: Date;
};

// 新規登録時、コード確認までアカウント作成を保留する入力内容です。
export type RegisterPayload = {
  nickname: string;
  grade: string;
  passwordHash: string;
  isSuperAdmin: boolean;
};

export class AuthCodeDeliveryError extends Error {}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCode(challengeId: string, code: string): string {
  return signValue("auth-code", `${challengeId}:${code}`);
}

// メールアドレスを「ab***@example.com」のように一部伏せて表示します。
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) {
    return "***";
  }
  const visible = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  return `${visible}***@${domain}`;
}

function buildEmail(purpose: AuthChallengePurpose, code: string) {
  const purposeLabel =
    purpose === "LOGIN" ? "ログイン" : purpose === "REGISTER" ? "アカウント登録" : "パスワード設定";
  return {
    subject: `【${CLUB_EMAIL_LABEL}】${purposeLabel}の確認コード: ${code}`,
    message: [
      `${CLUB_EMAIL_LABEL}アプリの${purposeLabel}確認コードです。`,
      "",
      `確認コード: ${code}`,
      "",
      `このコードの有効期限は${AUTH_CODE_TTL_MINUTES}分です。画面に入力して手続きを完了してください。`,
      "このメールに心当たりがない場合は、コードを誰にも伝えずにこのメールを破棄してください。",
    ].join("\n"),
  };
}

async function deliverCode(email: string, purpose: AuthChallengePurpose, code: string) {
  const { subject, message } = buildEmail(purpose, code);
  const result = await sendEmail({ to: email, subject, message });

  if (result.sent) {
    return;
  }

  if (result.skipped && process.env.NODE_ENV !== "production") {
    // 開発環境でメール送信が未設定の場合はコンソールにコードを出して動作確認できるようにします。
    console.info(`[auth-code] ${purpose} code for ${email}: ${code}`);
    return;
  }

  console.error("[auth-code] failed to send email", result);
  throw new AuthCodeDeliveryError(
    result.skipped
      ? "メール送信が設定されていないため確認コードを送信できません。管理者に連絡してください"
      : "確認コードのメール送信に失敗しました。時間をおいて再度お試しください",
  );
}

async function setChallengeCookie(challengeId: string, purpose: AuthChallengePurpose, request?: NextRequest) {
  const payload = `${challengeId}.${purpose}`;
  const cookieStore = await cookies();
  cookieStore.set(AUTH_CHALLENGE_COOKIE, `${payload}.${signValue("auth-challenge", payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: AUTH_CHALLENGE_COOKIE_MAX_AGE,
  });
}

export async function clearChallengeCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_CHALLENGE_COOKIE);
}

async function readChallengeCookie(): Promise<{ id: string; purpose: AuthChallengePurpose } | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(AUTH_CHALLENGE_COOKIE)?.value;
  if (!value) {
    return null;
  }

  const parts = value.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [id, purpose, signature] = parts;
  if (purpose !== "LOGIN" && purpose !== "REGISTER" && purpose !== "PASSWORD_RESET") {
    return null;
  }
  if (!isValidSignature("auth-challenge", `${id}.${purpose}`, signature)) {
    return null;
  }

  return { id, purpose };
}

// 認証コードを発行してメール送信し、ブラウザに確認待ちのCookieを付けます。
export async function startAuthChallenge(
  args: {
    purpose: AuthChallengePurpose;
    email: string;
    memberId?: string | null;
    payload?: Prisma.InputJsonValue;
  },
  request?: NextRequest,
) {
  const now = new Date();

  // 期限切れのコードは定期的に掃除し、同じ会員・用途の未使用コードは無効化します。
  await prisma.authChallenge.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
  });
  if (args.memberId) {
    await prisma.authChallenge.updateMany({
      where: { memberId: args.memberId, purpose: args.purpose, consumedAt: null },
      data: { consumedAt: now },
    });
  }

  const code = generateCode();
  const challenge = await prisma.authChallenge.create({
    data: {
      purpose: args.purpose,
      memberId: args.memberId ?? null,
      email: args.email,
      codeHash: "",
      payload: args.payload,
      expiresAt: new Date(now.getTime() + AUTH_CODE_TTL_MS),
      sentAt: now,
    },
    select: { id: true },
  });
  await prisma.authChallenge.update({
    where: { id: challenge.id },
    data: { codeHash: hashCode(challenge.id, code) },
  });

  try {
    await deliverCode(args.email, args.purpose, code);
  } catch (error) {
    await prisma.authChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
    throw error;
  }

  await setChallengeCookie(challenge.id, args.purpose, request);
}

// 存在しないメールアドレスでも同じ画面遷移にするため、どのコードとも一致しないCookieを付けます。
export async function startDummyChallenge(purpose: AuthChallengePurpose, request?: NextRequest) {
  await setChallengeCookie(`dummy${randomBytes(12).toString("hex")}`, purpose, request);
}

export async function getPendingChallenge(purposes: AuthChallengePurpose[]): Promise<PendingChallenge | null> {
  const cookieValue = await readChallengeCookie();
  if (!cookieValue || !purposes.includes(cookieValue.purpose)) {
    return null;
  }

  const challenge = await prisma.authChallenge.findUnique({
    where: { id: cookieValue.id },
    select: {
      id: true,
      purpose: true,
      memberId: true,
      email: true,
      payload: true,
      sentAt: true,
      attempts: true,
      expiresAt: true,
      consumedAt: true,
    },
  });

  if (
    !challenge ||
    challenge.purpose !== cookieValue.purpose ||
    challenge.consumedAt ||
    challenge.expiresAt.getTime() < Date.now() ||
    challenge.attempts >= AUTH_CODE_MAX_ATTEMPTS
  ) {
    return null;
  }

  return {
    id: challenge.id,
    purpose: challenge.purpose,
    memberId: challenge.memberId,
    email: challenge.email,
    payload: challenge.payload,
    sentAt: challenge.sentAt,
  };
}

// 確認待ちの種類だけを返します（ダミーCookieでも画面を表示できるようにするため）。
export async function getPendingChallengePurpose(): Promise<AuthChallengePurpose | null> {
  return (await readChallengeCookie())?.purpose ?? null;
}

// コードを照合し、一致すれば使用済みにします。失敗回数が上限に達するとコードは無効になります。
export async function consumeAuthCode(challengeId: string, code: string): Promise<boolean> {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) {
    await prisma.authChallenge.updateMany({ where: { id: challengeId }, data: { attempts: { increment: 1 } } });
    return false;
  }

  const challenge = await prisma.authChallenge.findUnique({
    where: { id: challengeId },
    select: { codeHash: true },
  });
  if (!challenge || !isValidSignature("auth-code", `${challengeId}:${normalized}`, challenge.codeHash)) {
    await prisma.authChallenge.updateMany({ where: { id: challengeId }, data: { attempts: { increment: 1 } } });
    return false;
  }

  const result = await prisma.authChallenge.updateMany({
    where: {
      id: challengeId,
      consumedAt: null,
      expiresAt: { gte: new Date() },
      attempts: { lt: AUTH_CODE_MAX_ATTEMPTS },
    },
    data: { consumedAt: new Date() },
  });
  return result.count === 1;
}

export function getResendWaitSeconds(sentAt: Date): number {
  const remaining = AUTH_CODE_RESEND_COOLDOWN_MS - (Date.now() - sentAt.getTime());
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

// 同じ確認待ちに対して新しいコードを再送します。
export async function resendAuthChallenge(challenge: PendingChallenge) {
  const waitSeconds = getResendWaitSeconds(challenge.sentAt);
  if (waitSeconds > 0) {
    throw new AuthCodeDeliveryError(`再送信は${waitSeconds}秒後に行えます`);
  }

  const code = generateCode();
  const now = new Date();
  await prisma.authChallenge.update({
    where: { id: challenge.id },
    data: {
      codeHash: hashCode(challenge.id, code),
      attempts: 0,
      sentAt: now,
      expiresAt: new Date(now.getTime() + AUTH_CODE_TTL_MS),
    },
  });
  await deliverCode(challenge.email, challenge.purpose, code);
}
