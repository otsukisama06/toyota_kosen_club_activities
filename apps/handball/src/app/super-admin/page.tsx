import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { LocalDateTime } from "@/components/local-date-time";
import { isAttendanceReminderEmailEnabled } from "@/lib/email-notification";
import { fetchUnifiedAnnouncements } from "@/lib/dual-db-content";
import { formatUptimeDhms, getRaspberryPiStatus } from "@/lib/system-status";
import { listConsoleMembers, requireSuperAdminPage } from "@/lib/super-admin";
import styles from "./super-admin.module.css";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { href: "/super-admin/mail", title: "メール一斉送信", description: "部員全員・役職・学年・個別指定でメールを送信します。" },
  { href: "/super-admin/announcements", title: "通達メッセージ", description: "メイン画面上部に表示する通達を登録・削除します。" },
  { href: "/super-admin/members", title: "部員アカウント", description: "メール・パスワード設定状況の確認、ロック解除、強制ログアウト。" },
  { href: "/super-admin/system", title: "サーバ状態", description: "ラズパイ・Docker コンテナの稼働状況を確認します。" },
  { href: "/super-admin/data", title: "データ管理", description: "予定の全削除、DB 軽量化を実行します。" },
  { href: "/admin/release-notes", title: "リリースノート", description: "アプリのバージョン情報と変更内容を管理します。" },
  { href: "/admin/feedback", title: "フィードバック", description: "部員から届いた意見・要望を確認します。" },
];

export default async function SuperAdminDashboardPage() {
  await requireSuperAdminPage();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [members, lockedCount, announcements, recentFeedbackCount, recentBroadcasts, systemStatus] = await Promise.all([
    listConsoleMembers(),
    prisma.member.count({ where: { loginLockedUntil: { gt: now } } }),
    fetchUnifiedAnnouncements(),
    prisma.feedback.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.emailBroadcast.findMany({ orderBy: { createdAt: "desc" }, take: 3 }),
    getRaspberryPiStatus(),
  ]);

  const withEmail = members.filter((member) => member.hasEmail).length;
  const withPassword = members.filter((member) => member.hasPassword).length;
  const needsPasswordWithEmail = members.filter((member) => member.hasEmail && !member.hasPassword).length;
  const withoutEmail = members.length - withEmail;
  const activeAnnouncements = announcements.filter(
    (announcement) => announcement.startsAt <= now && announcement.endsAt >= now,
  ).length;
  const emailEnabled = isAttendanceReminderEmailEnabled();

  return (
    <>
      <header className={styles.pageHeader}>
        <h1>ダッシュボード</h1>
        <p>admin 専用の機能をこの画面にまとめています。左（スマホでは上）のメニューから各機能へ移動できます。</p>
      </header>

      {!emailEnabled ? (
        <p className={styles.warning}>
          メール送信が未設定です。ログイン確認コードや一斉送信を使うには、メールAPIキー（ATTENDANCE_REMINDER_EMAIL_API_KEY など）を設定してください。
        </p>
      ) : null}

      <section className={styles.statGrid}>
        <div className={styles.stat}><span>部員数</span><strong>{members.length}</strong></div>
        <div className={styles.stat}><span>メール登録済み</span><strong>{withEmail}</strong></div>
        <div className={`${styles.stat} ${withoutEmail > 0 ? styles.statAlert : ""}`}><span>メール未登録</span><strong>{withoutEmail}</strong></div>
        <div className={styles.stat}><span>パスワード設定済み</span><strong>{withPassword}</strong></div>
        <div className={`${styles.stat} ${needsPasswordWithEmail > 0 ? styles.statAlert : ""}`}><span>パスワード未設定</span><strong>{members.length - withPassword}</strong></div>
        <div className={`${styles.stat} ${lockedCount > 0 ? styles.statAlert : ""}`}><span>ログイン制限中</span><strong>{lockedCount}</strong></div>
        <div className={styles.stat}><span>表示中の通達</span><strong>{activeAnnouncements}</strong></div>
        <div className={styles.stat}><span>フィードバック（30日）</span><strong>{recentFeedbackCount}</strong></div>
      </section>

      {needsPasswordWithEmail > 0 ? (
        <section className={styles.card}>
          <h2>パスワード未設定の部員がいます</h2>
          <p className={styles.meta}>
            メール登録済みでパスワード未設定の部員が {needsPasswordWithEmail} 名います。設定依頼メールを一斉送信できます。
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryButton} href="/super-admin/mail?template=password-setup">設定依頼メールを作成</Link>
            <Link className={styles.secondaryButton} href="/super-admin/members">部員アカウントを確認</Link>
          </div>
        </section>
      ) : null}

      <section className={styles.card}>
        <h2>機能一覧</h2>
        <div className={styles.tileGrid}>
          {SECTIONS.map((section) => (
            <Link key={section.href} href={section.href} className={styles.tile}>
              <strong>{section.title}</strong>
              <span>{section.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <h2>最近の一斉送信</h2>
        {recentBroadcasts.length === 0 ? (
          <p className={styles.meta}>まだ一斉送信はありません。</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>送信日時</th><th>件名</th><th>対象</th><th>結果</th></tr>
              </thead>
              <tbody>
                {recentBroadcasts.map((broadcast) => (
                  <tr key={broadcast.id}>
                    <td><LocalDateTime value={broadcast.createdAt} /></td>
                    <td>{broadcast.subject}</td>
                    <td>{broadcast.targetSummary}</td>
                    <td>{broadcast.sentCount}/{broadcast.recipientCount} 件{broadcast.failedCount > 0 ? `（失敗 ${broadcast.failedCount}）` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <h2>サーバ概要</h2>
        <p className={styles.meta}>
          稼働時間 {formatUptimeDhms(systemStatus.uptimeSeconds)} / ディスク使用率{" "}
          {systemStatus.disk.usagePercent !== null ? `${systemStatus.disk.usagePercent}%` : "N/A"} / Docker{" "}
          {systemStatus.docker.available
            ? `${systemStatus.docker.runningContainers ?? 0}/${systemStatus.docker.totalContainers ?? 0} 実行中`
            : "利用不可"}
        </p>
        <div className={styles.actions}>
          <Link className={styles.secondaryButton} href="/super-admin/system">詳細を見る</Link>
        </div>
      </section>
    </>
  );
}
