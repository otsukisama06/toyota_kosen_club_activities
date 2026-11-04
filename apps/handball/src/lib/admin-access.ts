import { getSessionMember } from "@/lib/member-session";
import { autoMarkPreviousDayUnansweredAsAbsent } from "@/lib/attendance-auto-absent";
import { timingSafeEqual } from "node:crypto";

const DEFAULT_SUPER_ADMIN_NICKNAME = "admin";
const DEFAULT_SUPER_ADMIN_LOGIN_PASSWORD = "devdev";

function getSuperAdminNickname(): string {
  return process.env.SUPER_ADMIN_NICKNAME?.trim() || DEFAULT_SUPER_ADMIN_NICKNAME;
}

function getSuperAdminLoginPassword(): string {
  const envPassword = process.env.SUPER_ADMIN_LOGIN_PASSWORD?.trim();
  if (envPassword) {
    return envPassword;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SUPER_ADMIN_LOGIN_PASSWORD is required in production");
  }

  return DEFAULT_SUPER_ADMIN_LOGIN_PASSWORD;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isSuperAdminNickname(nickname: string | null | undefined): boolean {
  return (nickname || "").toLowerCase() === getSuperAdminNickname().toLowerCase();
}

export function filterOutSuperAdminMembers<T extends { nickname: string | null }>(members: T[]): T[] {
  return members.filter((member) => !isSuperAdminNickname(member.nickname));
}

export function isValidSuperAdminLoginPassword(password: string | null | undefined): boolean {
  return safeEqual(password || "", getSuperAdminLoginPassword());
}

function isPrivilegedRole(role: string | null | undefined): boolean {
  return role === "MANAGER" || role === "COACH" || role === "ADMIN";
}

export function canAccessAdminByMember(member: { nickname?: string | null; role?: string | null; canAccessAdmin?: boolean } | null): boolean {
  if (!member) {
    return false;
  }

  return isSuperAdminNickname(member.nickname) || isPrivilegedRole(member.role) || Boolean(member.canAccessAdmin);
}

export async function getAuthorizedAdminMember() {
  const member = await getSessionMember();

  if (!member || !canAccessAdminByMember(member)) {
    return null;
  }

  await autoMarkPreviousDayUnansweredAsAbsent(member.id);

  return member;
}
