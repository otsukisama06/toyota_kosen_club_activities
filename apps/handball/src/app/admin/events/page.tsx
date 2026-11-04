import Link from "next/link";
import { AttendanceEventType } from "@prisma/client";
import { getAuthorizedAdminMember } from "@/lib/admin-access";
import { toDateKey } from "@/lib/date-format";
import { LocalDateTimeRange } from "@/components/local-date-time";
import { prisma } from "@/lib/prisma";
import styles from "./events-management.module.css";

export const dynamic = "force-dynamic";

type EventManagePageProps = {
  searchParams: Promise<{
    error?: string;
    ok?: string;
  }>;
};

export default async function EventManagePage({ searchParams }: EventManagePageProps) {
  const params = await searchParams;
  const adminMember = await getAuthorizedAdminMember();

  if (!adminMember) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>予定管理へのアクセス権限がありません</h1>
          <p>役職が管理者・コーチ・マネージャーのユーザーのみ利用できます。</p>
          <Link className={styles.linkButton} href="/admin">
            管理画面へ戻る
          </Link>
        </section>
      </main>
    );
  }

  const events = await prisma.attendanceEvent.findMany({
    orderBy: { scheduledAt: "desc" },
  });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>予定管理</h1>
        <p>単体作成・複数作成のページへ遷移できます。削除はこの画面で行えます。</p>
        <div className={styles.topLinks}>
          <Link className={styles.linkButton} href="/admin">
            管理画面へ戻る
          </Link>
          <Link className={styles.secondaryLink} href="/">
            メイン画面へ
          </Link>
        </div>
      </header>

      {params.error ? <p className={styles.error}>エラー: {params.error}</p> : null}
      {params.ok ? <p className={styles.ok}>保存しました: {params.ok}</p> : null}

      <section className={styles.card}>
        <h2>操作メニュー</h2>
        <div className={styles.jumpButtons}>
          <Link className={styles.linkButton} href="/admin/events/single">単体予定作成へ</Link>
          <Link className={styles.linkButton} href="/admin/events/bulk">複数予定作成へ</Link>
          <Link className={styles.linkButton} href="/admin/events/edit">予定編集へ</Link>
          <a className={styles.secondaryLink} href="#delete-events">この画面で予定削除</a>
        </div>
      </section>

      <section id="delete-events" className={styles.card}>
        <h2>予定削除</h2>
        <p className={styles.meta}>作成済み予定を一覧から削除できます。</p>
        <div className={styles.memberTableWrap}>
          <table className={styles.memberTable}>
            <thead>
              <tr>
                <th>種別</th>
                <th>予定名</th>
                <th>日時</th>
                <th>振り返り</th>
                <th>編集</th>
                <th>削除</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{event.eventType === AttendanceEventType.MATCH ? "試合" : "練習"}</td>
                  <td>{event.title}</td>
                  <td><LocalDateTimeRange startValue={event.scheduledAt} endValue={event.endAt} /></td>
                  <td>
                    {event.eventType === AttendanceEventType.MATCH ? (
                      <Link
                        className={styles.tableActionLink}
                        href={`/admin/events/${event.id}/feedbacks`}
                      >
                        振り返り一覧
                      </Link>
                    ) : (
                      <span className={styles.meta}>-</span>
                    )}
                  </td>
                  <td>
                    <Link
                      className={styles.tableActionLink}
                      href={`/admin/events/edit?date=${toDateKey(event.scheduledAt)}`}
                    >
                      編集
                    </Link>
                  </td>
                  <td>
                    <form action={`/api/events/${event.id}`} method="post" className={styles.inlineForm}>
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="redirectTo" value="/admin/events" />
                      <button type="submit" className={styles.dangerButton}>削除</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.length === 0 ? (
            <p className={styles.notice}>予定はまだありません。</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
