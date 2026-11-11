import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// このアプリと、行き来する相手アプリの情報です（ゲートウェイの club_sport Cookie の値と一致させます）。
export const CURRENT_CLUB = { id: "handball", label: "弓道部" } as const;
export const PEER_CLUB = { id: "table-tennis", label: "卓球部" } as const;

export type ClubSwitchDestination = "home" | "admin" | "super-admin";

export const CLUB_SWITCH_DESTINATION_PATHS: Record<ClubSwitchDestination, string> = {
  home: "/",
  admin: "/admin",
  "super-admin": "/super-admin",
};

const TOKEN_TTL_MS = 60 * 1000;

export function isClubSwitchDestination(value: string): value is ClubSwitchDestination {
  return value === "home" || value === "admin" || value === "super-admin";
}

// ゲートウェイが起動時に生成して両アプリへ同じ値を渡す共有の秘密鍵です。
function getClubSwitchSecret(): string | null {
  return process.env.CLUB_SWITCH_SECRET?.trim() || null;
}

export function isClubSwitchEnabled(): boolean {
  return Boolean(getClubSwitchSecret());
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(`club-switch:${payload}`).digest("base64url");
}

type TokenPayload = {
  to: string;
  next: ClubSwitchDestination;
  exp: number;
  nonce: string;
};

// 相手アプリへ admin として移動するための、60秒だけ有効な1回限りのトークンを作ります。
export function createClubSwitchToken(next: ClubSwitchDestination): string | null {
  const secret = getClubSwitchSecret();
  if (!secret) {
    return null;
  }

  const payload: TokenPayload = {
    to: PEER_CLUB.id,
    next,
    exp: Date.now() + TOKEN_TTL_MS,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(secret, encoded)}`;
}

const globalForClubSwitch = globalThis as unknown as { __usedClubSwitchNonces?: Map<string, number> };

function markNonceUsed(nonce: string, exp: number): boolean {
  const used = (globalForClubSwitch.__usedClubSwitchNonces ??= new Map());
  const now = Date.now();
  for (const [key, expiresAt] of used) {
    if (expiresAt < now) {
      used.delete(key);
    }
  }
  if (used.has(nonce)) {
    return false;
  }
  used.set(nonce, exp);
  return true;
}

// 相手アプリから来たトークンを検証し、移動先を返します。不正・期限切れ・使用済みなら null です。
export function verifyClubSwitchToken(token: string): ClubSwitchDestination | null {
  const secret = getClubSwitchSecret();
  if (!secret) {
    return null;
  }

  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) {
    return null;
  }

  const expected = Buffer.from(sign(secret, encoded), "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }

  if (
    payload.to !== CURRENT_CLUB.id ||
    typeof payload.exp !== "number" ||
    payload.exp < Date.now() ||
    typeof payload.nonce !== "string" ||
    !isClubSwitchDestination(String(payload.next))
  ) {
    return null;
  }

  if (!markNonceUsed(payload.nonce, payload.exp)) {
    return null;
  }

  return payload.next;
}
