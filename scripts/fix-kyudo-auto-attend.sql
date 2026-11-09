-- 弓道アプリ（handball_notes）向けの一回限りのデータ修正スクリプトです。
--
-- 2026-11-04〜2026-11-08 の版では、前日までの未回答イベントを自動で「出席(ATTEND)」として
-- 登録していました。その後「欠席(ABSENT)」補完に修正しましたが、既に作られた ATTEND は残っています。
--
-- 自動補完で作られたレコードは、同じ処理の中で同じ submittedAt がまとめて設定されているため、
-- 「同一 submittedAt を持つ ATTEND が複数件・コメントなし」のものを自動補完分とみなして ABSENT に戻します。
--
-- 実行手順（ラズパイ上）:
--   1. まず PREVIEW 部分だけ実行して対象件数と内容を確認する
--   2. 問題なければ全体を実行する（BEGIN〜COMMIT）
--   docker exec -i toyota_kosen_club_activities-postgres-1 \
--     sh -c 'psql -U "$POSTGRES_USER" -d handball_notes' < scripts/fix-kyudo-auto-attend.sql

-- PREVIEW: 自動補完とみなす submittedAt ごとの件数
WITH auto_batches AS (
  SELECT "submittedAt"
  FROM "AttendanceRecord"
  WHERE status = 'ATTEND'
    AND comment IS NULL
    AND "submittedAt" >= TIMESTAMP '2026-11-03 15:00:00'
  GROUP BY "submittedAt"
  HAVING COUNT(*) >= 2
)
SELECT r."submittedAt", COUNT(*) AS records
FROM "AttendanceRecord" r
JOIN auto_batches b ON b."submittedAt" = r."submittedAt"
WHERE r.status = 'ATTEND' AND r.comment IS NULL
GROUP BY r."submittedAt"
ORDER BY r."submittedAt";

BEGIN;

WITH auto_batches AS (
  SELECT "submittedAt"
  FROM "AttendanceRecord"
  WHERE status = 'ATTEND'
    AND comment IS NULL
    AND "submittedAt" >= TIMESTAMP '2026-11-03 15:00:00'
  GROUP BY "submittedAt"
  HAVING COUNT(*) >= 2
)
UPDATE "AttendanceRecord" r
SET status = 'ABSENT'
FROM auto_batches b
WHERE r."submittedAt" = b."submittedAt"
  AND r.status = 'ATTEND'
  AND r.comment IS NULL;

COMMIT;
