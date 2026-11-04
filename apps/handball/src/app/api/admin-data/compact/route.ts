import { NextRequest, NextResponse } from "next/server";
import { InputType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthorizedAdminMember, isSuperAdminNickname, isValidSuperAdminLoginPassword } from "@/lib/admin-access";
import { buildAppUrl } from "@/lib/request-utils";

const REPORT_RETENTION_DAYS = 45;
const TOKEN_RETENTION_DAYS = 30;
const ANNOUNCEMENT_RETENTION_DAYS = 30;
const FEEDBACK_RETENTION_DAYS = 365;

function parseBoolean(value: FormDataEntryValue | null): boolean {
  if (!value) {
    return false;
  }
  const normalized = String(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

function subtractDays(base: Date, days: number): Date {
  return new Date(base.getTime() - days * 24 * 60 * 60 * 1000);
}

function parsePgBytesValue(raw: unknown): number {
  if (typeof raw === "number") {
    return raw;
  }
  if (typeof raw === "bigint") {
    return Number(raw);
  }
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function getCurrentDatabaseSizeBytes(): Promise<number> {
  const result = await prisma.$queryRawUnsafe<Array<{ size_bytes: unknown }>>(
    "SELECT pg_database_size(current_database()) AS size_bytes",
  );
  return parsePgBytesValue(result[0]?.size_bytes);
}

export async function POST(request: NextRequest) {
  const adminMember = await getAuthorizedAdminMember();
  if (!adminMember) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const confirmText = String(formData.get("confirmText") || "");
  const executionPassword = String(formData.get("executionPassword") || "");
  const aggressive = parseBoolean(formData.get("aggressive"));
  const redirectTo = String(formData.get("redirectTo") || "/admin/super-admin");
  const redirectUrl = buildAppUrl(request, redirectTo);

  if (intent !== "compact-database") {
    redirectUrl.searchParams.set("error", "操作が不正です");
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (confirmText !== "軽量化実行") {
    redirectUrl.searchParams.set("error", "確認キーワードが一致しません（軽量化実行と入力してください）");
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (!isSuperAdminNickname(adminMember.nickname)) {
    redirectUrl.searchParams.set("error", "この操作は admin ユーザーのみ実行できます");
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (!isValidSuperAdminLoginPassword(executionPassword)) {
    redirectUrl.searchParams.set("error", "実行パスワードが違います");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const now = new Date();
  const reportCutoff = subtractDays(now, REPORT_RETENTION_DAYS);
  const tokenCutoff = subtractDays(now, TOKEN_RETENTION_DAYS);
  const announcementCutoff = subtractDays(now, ANNOUNCEMENT_RETENTION_DAYS);
  const feedbackCutoff = subtractDays(now, FEEDBACK_RETENTION_DAYS);

  const beforeSizeBytes = await getCurrentDatabaseSizeBytes();

  const deleted = await prisma.$transaction(async (tx) => {
    const oldReports = await tx.dailyAdminStatusReport.deleteMany({
      where: {
        sentAt: { lt: reportCutoff },
      },
    });

    const oldTokens = await tx.inputToken.deleteMany({
      where: {
        OR: [
          {
            expiresAt: { lt: now },
          },
          {
            isActive: false,
            createdAt: { lt: tokenCutoff },
          },
          {
            usedAt: { lt: tokenCutoff },
          },
        ],
      },
    });

    const oldAttendanceTokens = await tx.inputToken.deleteMany({
      where: {
        type: InputType.ATTENDANCE,
        createdAt: { lt: tokenCutoff },
      },
    });

    const oldAnnouncements = await tx.adminAnnouncement.deleteMany({
      where: {
        endsAt: { lt: announcementCutoff },
      },
    });

    const oldFeedbacks = await tx.feedback.deleteMany({
      where: {
        createdAt: { lt: feedbackCutoff },
      },
    });

    return {
      oldReports: oldReports.count,
      oldTokens: oldTokens.count,
      oldAttendanceTokens: oldAttendanceTokens.count,
      oldAnnouncements: oldAnnouncements.count,
      oldFeedbacks: oldFeedbacks.count,
    };
  });

  const vacuumTargets = [
    "InputToken",
    "DailyAdminStatusReport",
    "AdminAnnouncement",
    "Feedback",
  ];

  const maintenanceErrors: string[] = [];
  for (const tableName of vacuumTargets) {
    const sql = aggressive
      ? `VACUUM (FULL, ANALYZE) \"${tableName}\"`
      : `VACUUM (ANALYZE) \"${tableName}\"`;

    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (error) {
      maintenanceErrors.push(
        error instanceof Error ? `${tableName}: ${error.message}` : `${tableName}: unknown error`,
      );
    }
  }

  const afterSizeBytes = await getCurrentDatabaseSizeBytes();
  const savedBytes = Math.max(beforeSizeBytes - afterSizeBytes, 0);

  const deletedSummary = [
    `reports=${deleted.oldReports}`,
    `tokens=${deleted.oldTokens + deleted.oldAttendanceTokens}`,
    `announcements=${deleted.oldAnnouncements}`,
    `feedbacks=${deleted.oldFeedbacks}`,
  ].join(",");

  redirectUrl.searchParams.set("ok", aggressive ? "db-compacted-aggressive" : "db-compacted");
  redirectUrl.searchParams.set("deleted", deletedSummary);
  redirectUrl.searchParams.set("savedMB", (savedBytes / 1024 / 1024).toFixed(2));

  if (maintenanceErrors.length > 0) {
    redirectUrl.searchParams.set("error", `一部メンテナンス失敗: ${maintenanceErrors.join(" | ")}`);
  }

  return NextResponse.redirect(redirectUrl, 303);
}
