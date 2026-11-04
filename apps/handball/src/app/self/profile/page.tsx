import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionMember } from "@/lib/member-session";
import styles from "../self-pages.module.css";

type ProfilePageProps = {
  searchParams: Promise<{ ok?: string; error?: string; month?: string }>;
};

function buildBackHref(month?: string): string {
  return month && /^\d{4}-\d{2}$/.test(month) ? `/?month=${month}` : "/";
}

export default async function SelfProfilePage({ searchParams }: ProfilePageProps) {
  const params = await searchParams;
  const member = await getSessionMember();

  if (!member) {
    redirect("/auth");
  }

  const backHref = buildBackHref(params.month);
  const redirectTo = params.month && /^\d{4}-\d{2}$/.test(params.month)
    ? `/self/profile?month=${params.month}`
    : "/self/profile";

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <Link href={backHref} className={styles.backLink}>カレンダーに戻る</Link>
          <div className={styles.topActions}>
            <Link href="/admin" className={styles.adminLink}>管理画面を開く</Link>
            <form action="/api/auth/logout" method="post" className={styles.inlineForm}>
              <button type="submit" className={styles.logoutButton}>ログアウト</button>
            </form>
          </div>
          <h1>プロフィール変更</h1>
        </header>

        {params.ok ? <p className={styles.message}>保存しました: {params.ok}</p> : null}
        {params.error ? <p className={styles.error}>エラー: {params.error}</p> : null}

        <section className={styles.card}>
          <form action="/api/self-profile" method="post" className={styles.form}>
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <label>
              メールアドレス
              <input
                type="email"
                name="email"
                defaultValue={member.email || ""}
                placeholder="例: player@example.com"
                required
              />
            </label>
            <label>
              ニックネーム
              <input
                type="text"
                name="nickname"
                minLength={2}
                maxLength={20}
                defaultValue={member.nickname || ""}
                placeholder="例: たくみ"
                required
              />
            </label>
            <label>
              学年
              <input
                type="text"
                name="grade"
                maxLength={20}
                defaultValue={member.grade || ""}
                placeholder="例: 2年"
                required
              />
            </label>
            <label>
              一年の目標
              <textarea
                name="yearlyGoal"
                maxLength={300}
                rows={4}
                defaultValue={member.yearlyGoal || ""}
                placeholder="例: 怪我なく一年を通してチームに貢献する"
              />
            </label>
            <label>
              その月の目標
              <textarea
                name="monthlyGoal"
                maxLength={300}
                rows={3}
                defaultValue={member.monthlyGoal || ""}
                placeholder="例: 今月は速攻参加を毎試合3回以上"
              />
            </label>
            <button className={styles.primary} type="submit">変更を保存する</button>
          </form>
        </section>
      </main>
    </div>
  );
}
