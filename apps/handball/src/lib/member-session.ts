import { cookies } from "next/headers";
import { NextRequest } from "next/server";
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

export async function getSessionMember() {
  const cookieStore = await cookies();
  const memberId = cookieStore.get(MEMBER_SESSION_COOKIE)?.value;

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
  cookieStore.set(MEMBER_SESSION_COOKIE, memberId, {
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
