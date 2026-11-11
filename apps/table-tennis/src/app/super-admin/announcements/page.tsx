import { LocalDateTime } from "@/components/local-date-time";
import { addJstDays, nowInJst, toDateTimeLocalValue } from "@/lib/date-format";
import { fetchUnifiedAnnouncements } from "@/lib/dual-db-content";
import { describeOkParam, getRequestTimeMs, requireSuperAdminPage } from "@/lib/super-admin";
import styles from "../super-admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ok?: string; error?: string }>;
};

const REDIRECT_TO = "/super-admin/announcements";

export default async function SuperAdminAnnouncementsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  await requireSuperAdminPage();

  const now = nowInJst();
  const defaultStart = toDateTimeLocalValue(now);
  const defaultEnd = toDateTimeLocalValue(addJstDays(now, 7));
  const announcements = await fetchUnifiedAnnouncements();
  const currentTime = getRequestTimeMs();
  const okMessage = describeOkParam(params.ok);

  return (
    <>
      <header className={styles.pageHeader}>
        <h1>通達メッセージ</h1>
        <p>指定期間中だけ、弓道・卓球の両アプリのメイン画面上部に赤色ウィンドウで表示されます。</p>
      </header>

      {okMessage ? <p className={styles.ok}>{okMessage}</p> : null}
      {params.error ? <p className={styles.error}>エラー: {params.error}</p> : null}

      <section className={styles.card}>
        <h2>通達を登録</h2>
        <form action="/api/admin-announcements" method="post" className={styles.form}>
          <input type="hidden" name="redirectTo" value={REDIRECT_TO} />
          <label>
            通達メッセージ
            <textarea name="message" rows={3} maxLength={500} required placeholder="例: 明日の練習は体育館が使えないため、グラウンド集合です。" />
          </label>
          <label>
            表示開始日時
            <input type="datetime-local" name="startsAt" defaultValue={defaultStart} required />
          </label>
          <label>
            表示終了日時
            <input type="datetime-local" name="endsAt" defaultValue={defaultEnd} required />
          </label>
          <div className={styles.actions}>
            <button type="submit" className={styles.primaryButton}>通達を登録</button>
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <h2>登録済みの通達</h2>
        {announcements.length === 0 ? (
          <p className={styles.meta}>登録済みの通達はありません。</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>状態</th>
                  <th>通達内容</th>
                  <th>表示期間</th>
                  <th>登録日時</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {announcements.map((announcement) => {
                  const startsAt = new Date(announcement.startsAt).getTime();
                  const endsAt = new Date(announcement.endsAt).getTime();
                  const status =
                    currentTime < startsAt ? "予定" : currentTime > endsAt ? "終了" : "表示中";
                  return (
                    <tr key={announcement.id}>
                      <td>
                        <span className={status === "表示中" ? styles.badgeOk : status === "予定" ? styles.badgeWarn : styles.badge}>
                          {status}
                        </span>
                      </td>
                      <td>{announcement.message}</td>
                      <td>
                        <LocalDateTime value={announcement.startsAt} /> 〜 <LocalDateTime value={announcement.endsAt} />
                      </td>
                      <td><LocalDateTime value={announcement.createdAt} /></td>
                      <td>
                        <form action="/api/admin-announcements" method="post" className={styles.inlineForm}>
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="redirectTo" value={REDIRECT_TO} />
                          <input type="hidden" name="announcementId" value={announcement.id} />
                          <input type="hidden" name="message" value={announcement.message} />
                          <input type="hidden" name="startsAtIso" value={announcement.startsAt.toISOString()} />
                          <input type="hidden" name="endsAtIso" value={announcement.endsAt.toISOString()} />
                          <button type="submit" className={styles.dangerButton}>削除</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
