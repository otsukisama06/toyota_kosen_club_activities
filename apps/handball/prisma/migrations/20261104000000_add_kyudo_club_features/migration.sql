-- 卓球アプリと同等の機能（部活タスク・試合振り返り・弓道ノート・試合結果・メール/出席率など）を弓道DBへ追加します。
-- EARLY_LEAVE は 20260501000000_add_early_leave_status で追加済みのため IF NOT EXISTS で冪等にしています。
-- AlterEnum
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'EARLY_LEAVE';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "attendanceRateStartAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AttendanceEvent" ADD COLUMN     "endAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DailyAdminStatusReport" (
    "id" TEXT NOT NULL,
    "reportDateKey" TEXT NOT NULL,
    "statusText" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyAdminStatusReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "deadlineOn" TIMESTAMP(3) NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "notificationDaysBefore" INTEGER NOT NULL DEFAULT 3,
    "notifiedAt" TIMESTAMP(3),
    "createdByMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchFeedback" (
    "id" TEXT NOT NULL,
    "attendanceEventId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KyudoNote" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "noteDateKey" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KyudoNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KyudoScoreSheet" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "opponent" TEXT NOT NULL,
    "matchDate" TIMESTAMP(3) NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KyudoScoreSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchScoreEntry" (
    "id" TEXT NOT NULL,
    "scoreSheetId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "ourScore" INTEGER NOT NULL,
    "theirScore" INTEGER NOT NULL,
    "winner" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchScoreEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyAdminStatusReport_reportDateKey_key" ON "DailyAdminStatusReport"("reportDateKey");

-- CreateIndex
CREATE INDEX "DailyAdminStatusReport_sentAt_idx" ON "DailyAdminStatusReport"("sentAt");

-- CreateIndex
CREATE INDEX "ClubTask_isCompleted_deadlineOn_idx" ON "ClubTask"("isCompleted", "deadlineOn");

-- CreateIndex
CREATE INDEX "ClubTask_deadlineOn_notifiedAt_idx" ON "ClubTask"("deadlineOn", "notifiedAt");

-- CreateIndex
CREATE INDEX "MatchFeedback_attendanceEventId_idx" ON "MatchFeedback"("attendanceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchFeedback_attendanceEventId_memberId_key" ON "MatchFeedback"("attendanceEventId", "memberId");

-- CreateIndex
CREATE INDEX "KyudoNote_memberId_noteDateKey_idx" ON "KyudoNote"("memberId", "noteDateKey");

-- CreateIndex
CREATE INDEX "KyudoNote_memberId_createdAt_idx" ON "KyudoNote"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "KyudoScoreSheet_memberId_matchDate_idx" ON "KyudoScoreSheet"("memberId", "matchDate");

-- CreateIndex
CREATE INDEX "MatchScoreEntry_scoreSheetId_idx" ON "MatchScoreEntry"("scoreSheetId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchScoreEntry_scoreSheetId_setNumber_key" ON "MatchScoreEntry"("scoreSheetId", "setNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");

-- AddForeignKey
ALTER TABLE "ClubTask" ADD CONSTRAINT "ClubTask_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchFeedback" ADD CONSTRAINT "MatchFeedback_attendanceEventId_fkey" FOREIGN KEY ("attendanceEventId") REFERENCES "AttendanceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchFeedback" ADD CONSTRAINT "MatchFeedback_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KyudoNote" ADD CONSTRAINT "KyudoNote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KyudoScoreSheet" ADD CONSTRAINT "KyudoScoreSheet_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchScoreEntry" ADD CONSTRAINT "MatchScoreEntry_scoreSheetId_fkey" FOREIGN KEY ("scoreSheetId") REFERENCES "KyudoScoreSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

