import Link from "next/link";
import { redirect } from "next/navigation";
import { LocalDate } from "@/components/local-date-time";
import { nowInJst, toDateKey } from "@/lib/date-format";
import { getSessionMember } from "@/lib/member-session";
import styles from "@/app/home-dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function NewKyudoNotePage() {
  const member = await getSessionMember();

  if (!member) {
    redirect("/auth");
  }

  const todayKey = toDateKey(nowInJst());

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.card}>
          <h1>新しい弓道ノート</h1>
          <p>日付を選んで、好きなだけノートを追加できます。</p>
        </section>

        <section className={styles.card}>
          <h2>ノートを作成</h2>
          <form action="/api/kyudo-notes" method="post" className={styles.form}>
            <input type="hidden" name="intent" value="create" />
            <input type="hidden" name="redirectTo" value="/kyudo-notes" />
            <label>
              日付
              <input type="date" name="noteDateKey" defaultValue={todayKey} required />
            </label>
            <label>
              内容
              <textarea
                name="content"
                rows={10}
                placeholder="今日の練習で良かったこと、課題、次回への目標を記入"
                required
              />
            </label>
            <button type="submit" className={styles.primary}>保存する</button>
          </form>
        </section>

        <section className={styles.feedbackSection}>
          <Link href="/kyudo-notes" className={styles.secondary}>ノート一覧へ戻る</Link>
        </section>
      </main>
    </div>
  );
}
