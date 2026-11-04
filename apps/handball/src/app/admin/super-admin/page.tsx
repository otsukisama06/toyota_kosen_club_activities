import Link from "next/link";
import { getAuthorizedAdminMember, isSuperAdminNickname } from "@/lib/admin-access";
import { addJstDays, nowInJst, toDateTimeLocalValue } from "@/lib/date-format";
import { LocalDateTime } from "@/components/local-date-time";
import { fetchUnifiedAnnouncements } from "@/lib/dual-db-content";
import { formatBytes, formatUptimeDhms, getRaspberryPiStatus } from "@/lib/system-status";
import styles from "../admin-dashboard.module.css";

export const dynamic = "force-dynamic";

type SuperAdminPageProps = {
  searchParams: Promise<{
    error?: string;
    ok?: string;
  }>;
};

export default async function SuperAdminPage({ searchParams }: SuperAdminPageProps) {
  const params = await searchParams;
  const adminMember = await getAuthorizedAdminMember();

  if (!adminMember) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>管理画面へのアクセス権限がありません</h1>
          <p>役職が管理者・コーチ・マネージャーのユーザーのみ利用できます。</p>
          <Link className={styles.linkButton} href="/">
            トップへ戻る
          </Link>
        </section>
      </main>
    );
  }

  if (!isSuperAdminNickname(adminMember.nickname)) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>このページは admin ユーザーのみ閲覧できます</h1>
          <p>admin 専用機能を利用するには、ユーザー名が admin のアカウントでログインしてください。</p>
          <Link className={styles.linkButton} href="/admin">
            管理画面へ戻る
          </Link>
        </section>
      </main>
    );
  }

  const now = nowInJst();
  const nextWeek = addJstDays(now, 7);
  const defaultAnnouncementStart = toDateTimeLocalValue(now);
  const defaultAnnouncementEnd = toDateTimeLocalValue(nextWeek);

  const announcements = await fetchUnifiedAnnouncements();
  const raspberryPiStatus = await getRaspberryPiStatus();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>admin 専用画面</h1>
        <p>admin のみが利用できる機能をここに集約しています。</p>
        <div className={styles.topLinks}>
          <Link className={styles.linkButton} href="/admin">
            管理画面へ戻る
          </Link>
        </div>
      </header>

      {params.error ? <p className={styles.error}>エラー: {params.error}</p> : null}
      {params.ok ? <p className={styles.ok}>保存しました: {params.ok}</p> : null}

      <section className={styles.card}>
        <h2>通達メッセージ管理</h2>
        <p className={styles.meta}>指定期間中だけメイン画面上部に赤色ウィンドウで表示されます。</p>
        <form action="/api/admin-announcements" method="post" className={styles.form}>
          <input type="hidden" name="redirectTo" value="/admin/super-admin" />
          <label>
            通達メッセージ
            <textarea name="message" rows={3} maxLength={500} required placeholder="例: 明日の練習は体育館が使えないため、グラウンド集合です。" />
          </label>
          <label>
            表示開始日時
            <input type="datetime-local" name="startsAt" defaultValue={defaultAnnouncementStart} required />
          </label>
          <label>
            表示終了日時
            <input type="datetime-local" name="endsAt" defaultValue={defaultAnnouncementEnd} required />
          </label>
          <button type="submit">通達を登録</button>
        </form>

        <div className={styles.memberTableWrap}>
          <table className={styles.memberTable}>
            <thead>
              <tr>
                <th>通達内容</th>
                <th>表示期間</th>
                <th>登録日時</th>
                <th>削除</th>
              </tr>
            </thead>
            <tbody>
              {announcements.map((announcement) => (
                <tr key={announcement.id}>
                  <td>{announcement.message}</td>
                  <td><LocalDateTime value={announcement.startsAt} /> 〜 <LocalDateTime value={announcement.endsAt} /></td>
                  <td><LocalDateTime value={announcement.createdAt} /></td>
                  <td>
                    <form action="/api/admin-announcements" method="post" className={styles.inlineForm}>
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="redirectTo" value="/admin/super-admin" />
                      <input type="hidden" name="announcementId" value={announcement.id} />
                      <input type="hidden" name="message" value={announcement.message} />
                      <input type="hidden" name="startsAtIso" value={announcement.startsAt.toISOString()} />
                      <input type="hidden" name="endsAtIso" value={announcement.endsAt.toISOString()} />
                      <button type="submit" className={styles.dangerButton}>削除</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {announcements.length === 0 ? (
            <p className={styles.notice} style={{ padding: "16px" }}>登録済みの通達はありません。</p>
          ) : null}
        </div>
      </section>

      <section className={styles.card}>
        <h2>確認メール テスト送信</h2>
        <p className={styles.meta}>登録済みメールアドレスを持つ部員へ、確認メールを一斉送信します（admin は除外）。</p>
        <form action="/api/admin-reminders/test" method="post" className={styles.form}>
          <input type="hidden" name="redirectTo" value="/admin/super-admin" />
          <button type="submit">部員へ確認メールをテスト送信する</button>
        </form>
      </section>

      <section className={styles.card}>
        <h2>ラズパイステータス</h2>
        <p className={styles.meta}>毎朝7時に送信する内容と同じ情報を表示します。</p>
        <div className={styles.notice}>
          <strong>ホスト</strong>: {raspberryPiStatus.hostname}
          <br />
          <strong>OS</strong>: {raspberryPiStatus.platform} {raspberryPiStatus.release} ({raspberryPiStatus.arch})
          <br />
          <strong>稼働時間</strong>: {formatUptimeDhms(raspberryPiStatus.uptimeSeconds)}
          <br />
          <strong>負荷平均</strong>: {raspberryPiStatus.loadAverage.map((value) => value.toFixed(2)).join(" / ")}
          <br />
          <strong>メモリ</strong>: {(raspberryPiStatus.memory.freeBytes / 1024 / 1024).toFixed(0)}MB free / {(raspberryPiStatus.memory.totalBytes / 1024 / 1024).toFixed(0)}MB total
          <br />
          <strong>ディスク ({raspberryPiStatus.disk.path})</strong>: free {formatBytes(raspberryPiStatus.disk.freeBytes)} / available {formatBytes(raspberryPiStatus.disk.availableBytes)} / total {formatBytes(raspberryPiStatus.disk.totalBytes)} / used {formatBytes(raspberryPiStatus.disk.usedBytes)} / usage {raspberryPiStatus.disk.usagePercent !== null ? `${raspberryPiStatus.disk.usagePercent}%` : "N/A"}
          <br />
          <strong>Docker</strong>: {raspberryPiStatus.docker.available ? `${raspberryPiStatus.docker.runningContainers ?? 0}/${raspberryPiStatus.docker.totalContainers ?? 0} 実行中` : `利用不可 (${raspberryPiStatus.docker.error || "unknown"})`}
        </div>

        <div className={styles.memberTableWrap}>
          <table className={styles.memberTable}>
            <thead>
              <tr>
                <th>コンテナ</th>
                <th>イメージ</th>
                <th>状態</th>
                <th>詳細</th>
              </tr>
            </thead>
            <tbody>
              {raspberryPiStatus.docker.containers.map((container) => (
                <tr key={container.name}>
                  <td>{container.name}</td>
                  <td>{container.image}</td>
                  <td>{container.state}</td>
                  <td>{container.status}</td>
                </tr>
              ))}
              {raspberryPiStatus.docker.containers.length === 0 ? (
                <tr>
                  <td colSpan={4}>コンテナ情報を取得できませんでした。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <h2>リリースノート管理</h2>
        <p className={styles.meta}>アプリのバージョン情報と変更内容を管理します。</p>
        <div className={styles.inlineActions}>
          <Link className={styles.linkButton} href="/admin/release-notes">
            リリースノート管理へ
          </Link>
        </div>
      </section>

      <section className={styles.card}>
        <h2>フィードバック確認</h2>
        <p className={styles.meta}>メイン画面から送信された意見・要望を確認できます。</p>
        <div className={styles.inlineActions}>
          <Link className={styles.linkButton} href="/admin/feedback">
            フィードバック一覧へ
          </Link>
        </div>
      </section>

      <section className={styles.card}>
        <h2>予定の全削除</h2>
        <p className={styles.meta}>すべての出席予定データを削除します。admin ユーザーのみ実行できます。元に戻せません。</p>
        <form action="/api/admin-data/cleanup" method="post" className={styles.form}>
          <input type="hidden" name="intent" value="delete-all-schedules-and-match-scores" />
          <input type="hidden" name="redirectTo" value="/admin/super-admin" />
          <label>
            確認キーワード
            <input
              type="text"
              name="confirmText"
              placeholder="全削除"
              required
            />
          </label>
          <label>
            実行パスワード
            <input
              type="password"
              name="executionPassword"
              placeholder="管理者ログインパスワード"
              required
            />
          </label>
          <button type="submit" className={styles.dangerButton}>予定と試合スコアを全削除する</button>
        </form>
      </section>

      <section className={styles.card}>
        <h2>DB 軽量化</h2>
        <p className={styles.meta}>不要データ削除と DB メンテナンスを実行します。通常は通常モード、容量逼迫時のみ強力モードを使ってください。</p>
        <form action="/api/admin-data/compact" method="post" className={styles.form}>
          <input type="hidden" name="intent" value="compact-database" />
          <input type="hidden" name="redirectTo" value="/admin/super-admin" />
          <label>
            確認キーワード
            <input
              type="text"
              name="confirmText"
              placeholder="軽量化実行"
              required
            />
          </label>
          <label>
            実行パスワード
            <input
              type="password"
              name="executionPassword"
              placeholder="管理者ログインパスワード"
              required
            />
          </label>
          <label>
            <input type="checkbox" name="aggressive" value="1" />
            強力モードを使う（VACUUM FULL。処理中にロックが発生しやすい）
          </label>
          <button type="submit">DB 軽量化を実行する</button>
        </form>
      </section>
    </main>
  );
}
