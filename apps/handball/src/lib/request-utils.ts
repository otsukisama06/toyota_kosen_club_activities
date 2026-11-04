import { NextRequest } from "next/server";

const PRODUCTION_APP_FALLBACK_URL = "https://toyota-kyudo-notes.onrender.com";

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

// Render などのプロキシ配下でも外向きURLでリダイレクトできるようにします。
export function getRequestOrigin(request: NextRequest): string {
  const forwardedProtoRaw = request.headers.get("x-forwarded-proto");
  const forwardedHostRaw = request.headers.get("x-forwarded-host");
  const forwardedProto = forwardedProtoRaw?.split(",")[0]?.trim().toLowerCase();
  const forwardedHost = forwardedHostRaw?.split(",")[0]?.trim();
  if ((forwardedProto === "https" || forwardedProto === "http") && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = request.headers.get("host");
  if (host) {
    const protocol = request.nextUrl.protocol || "https:";
    return `${protocol}//${host}`;
  }

  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.RENDER_EXTERNAL_URL;
  if (configuredBaseUrl) {
    return normalizeBaseUrl(configuredBaseUrl);
  }

  return process.env.NODE_ENV === "production" ? PRODUCTION_APP_FALLBACK_URL : request.nextUrl.origin;
}

export function buildAppUrl(request: NextRequest, path: string): URL {
  return new URL(path, `${getRequestOrigin(request)}/`);
}

// 管理キーは URL クエリまたはヘッダーのどちらからでも受け取れるようにしています。
export function getAdminKeyFromRequest(request: NextRequest): string | null {
  const urlKey = request.nextUrl.searchParams.get("key");
  const headerKey = request.headers.get("x-admin-key");

  return urlKey || headerKey;
}

// 管理画面へ戻すときに key を落とさないための共通処理です。
export function buildAdminRedirectUrl(request: NextRequest): URL {
  const key = request.nextUrl.searchParams.get("key") || "";
  const redirectUrl = buildAppUrl(request, "/admin");

  if (key) {
    redirectUrl.searchParams.set("key", key);
  }

  return redirectUrl;
}

// 詳細ページなど任意の画面へ戻すときに使う汎用リダイレクト生成です。
export function buildRedirectUrl(request: NextRequest, redirectTo: string, key?: string | null): URL {
  const redirectUrl = buildAppUrl(request, redirectTo || "/admin");

  if (key) {
    redirectUrl.searchParams.set("key", key);
  }

  return redirectUrl;
}

