import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

const MEMBER_SESSION_COOKIE = "hbn_member_session";
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

function getSessionSecret(): string {
  const explicitSecret = process.env.SESSION_SECRET?.trim();
  if (explicitSecret) {
    return explicitSecret;
  }

  // SESSION_SECRET が未設定の場合は、本番で必須の秘密値から署名鍵を導出します。
  const derivedSource = [
    process.env.ADMIN_VIEW_KEY,
    process.env.SUPER_ADMIN_LOGIN_PASSWORD,
    process.env.CLUB_PASSWORD,
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

function signMemberId(memberId: string): string {
  return createHmac("sha256", getSessionSecret()).update(memberId).digest("base64url");
}

function encodeSessionValue(memberId: string): string {
  return `${memberId}.${signMemberId(memberId)}`;
}

// 署名付きCookieを検証し、改ざんされていなければ会員IDを返します。
function decodeSessionValue(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const separatorIndex = value.lastIndexOf(".");
  if (separatorIndex <= 0) {
    return null;
  }

  const memberId = value.slice(0, separatorIndex);
  const signature = Buffer.from(value.slice(separatorIndex + 1), "utf8");
  const expected = Buffer.from(signMemberId(memberId), "utf8");
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    return null;
  }

  return memberId;
}

export async function getSessionMember() {
  const cookieStore = await cookies();
  const memberId = decodeSessionValue(cookieStore.get(MEMBER_SESSION_COOKIE)?.value);

  if (!memberId) {
    return null;
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
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
    },
  });

  return member as SessionMember | null;
}

function shouldUseSecureCookie(request?: NextRequest): boolean {
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
  const cookieStore = await cookies();
  cookieStore.set(MEMBER_SESSION_COOKIE, encodeSessionValue(memberId), {
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
