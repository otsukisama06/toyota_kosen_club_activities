import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

const MEMBER_SESSION_COOKIE = "hbn_member_session";
export const AUTH_CHALLENGE_COOKIE = "hbn_auth_challenge";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type SessionMember = {
  id: string;
  name: string;
  nickname: string | null;
  email: string | null;
  grade: string | null;
  yearlyGoal: string | null;
  monthlyGoal: string | null;
  canAccessAdmin: boolean;
  role: "PLAYER" | "MANAGER" | "COACH" | "ADMIN";
  attendanceRateStartAt: Date;
  createdAt: Date;
};

export function getSessionSecret(): string {
  const explicitSecret = process.env.SESSION_SECRET?.trim();
  if (explicitSecret) {
    return explicitSecret;
  }

  // SESSION_SECRET が未設定の場合は、本番で必須の秘密値から署名鍵を導出します。
  const derivedSource = [
    process.env.ADMIN_VIEW_KEY,
    process.env.SUPER_ADMIN_LOGIN_PASSWORD,
  ]
    .map((value) => value?.trim() || "")
    .join("\u0000");

  if (!derivedSource.replace(/\u0000/g, "")) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET is required in production");
    }
    return "dev-member-session-secret";
  }

  return createHash("sha256").update(`member-session:${derivedSource}`).digest("hex");
}

// 任意の値に用途付きの HMAC 署名を付けます。
export function signValue(purpose: string, value: string): string {
  return createHmac("sha256", getSessionSecret()).update(`${purpose}:${value}`).digest("base64url");
}

export function isValidSignature(purpose: string, value: string, signature: string): boolean {
  const actual = Buffer.from(signature, "utf8");
  const expected = Buffer.from(signValue(purpose, value), "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Cookie 値は「会員ID.セッション世代.署名」です。パスワード変更で世代が変わると古いセッションは無効になります。
function encodeSessionValue(memberId: string, sessionVersion: number): string {
  const payload = `${memberId}.${sessionVersion}`;
  return `${payload}.${signValue("member-session", payload)}`;
}

// 署名付きCookieを検証し、改ざんされていなければ会員IDとセッション世代を返します。
function decodeSessionValue(value: string | undefined): { memberId: string; sessionVersion: number } | null {
  if (!value) {
    return null;
  }

  const parts = value.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [memberId, versionRaw, signature] = parts;
  if (!memberId || !/^\d+$/.test(versionRaw)) {
    return null;
  }

  if (!isValidSignature("member-session", `${memberId}.${versionRaw}`, signature)) {
    return null;
  }

  return { memberId, sessionVersion: Number(versionRaw) };
}

export async function getSessionMember() {
  const cookieStore = await cookies();
  const session = decodeSessionValue(cookieStore.get(MEMBER_SESSION_COOKIE)?.value);

  if (!session) {
    return null;
  }

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: {
      id: true,
      name: true,
      nickname: true,
      email: true,
      grade: true,
      yearlyGoal: true,
      monthlyGoal: true,
      canAccessAdmin: true,
      role: true,
      attendanceRateStartAt: true,
      createdAt: true,
      sessionVersion: true,
    },
  });

  if (!member || member.sessionVersion !== session.sessionVersion) {
    return null;
  }

  const { sessionVersion: _sessionVersion, ...sessionMember } = member;
  void _sessionVersion;
  return sessionMember as SessionMember;
}

export function shouldUseSecureCookie(request?: NextRequest): boolean {
  if (!request) {
    return process.env.NODE_ENV === "production";
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto) {
    return forwardedProto === "https";
  }

  return request.nextUrl.protocol === "https:";
}

export async function setMemberSession(memberId: string, request?: NextRequest) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { sessionVersion: true },
  });
  if (!member) {
    throw new Error("Member not found");
  }

  const cookieStore = await cookies();
  cookieStore.set(MEMBER_SESSION_COOKIE, encodeSessionValue(memberId, member.sessionVersion), {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearMemberSession() {
  const cookieStore = await cookies();
  cookieStore.delete(MEMBER_SESSION_COOKIE);
}
