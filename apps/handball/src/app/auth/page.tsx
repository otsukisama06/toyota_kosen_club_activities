import { redirect } from "next/navigation";
import { getSessionMember } from "@/lib/member-session";
import { LoginForm } from "./login-form";
import { ClubPasswordField } from "./club-password-field";
import styles from "./auth.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ok?: string; error?: string }>;
};

export default async function AuthPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const member = await getSessionMember();
  const clubSelectorBaseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
  const clubSelectorUrl = `${clubSelectorBaseUrl.replace(/\/$/, "")}/switch-club`;

  if (member) {
    redirect("/");
  }

  return (
    <main className={styles.page}>
      <div className={styles.main}>
        <header className={styles.header}>
          <h1>ニックネームでログイン</h1>
          <p>最初にアカウント登録でニックネームを設定し、次回以降はニックネームだけでログインできます。</p>
        </header>

        {params.ok === "logout" ? <p className={styles.notice}>ログアウトしました。</p> : null}
        {params.error ? <p className={styles.error}>エラー: {params.error}</p> : null}

        <section className={styles.grid}>
          <article className={`${styles.card} ${styles.loginCard}`}>
            <h2>ログイン</h2>
            <LoginForm />
            <p className={styles.meta}>設定したニックネームでログインしてください。</p>
          </article>

          <article className={styles.card}>
            <h2>アカウント登録</h2>
            <form action="/api/auth/register" method="post" className={styles.form}>
              <input type="hidden" name="redirectTo" value="/auth" />
              <label>
                部活パスワード
                <ClubPasswordField />
              </label>
              <label>
                メールアドレス
                <input name="email" type="email" placeholder="例: player@example.com" required />
              </label>
              <label>
                学年
                <input name="grade" type="text" placeholder="例: 2年" maxLength={20} required />
              </label>
              <label>
                ニックネーム
                <input name="nickname" type="text" minLength={2} maxLength={20} placeholder="例: yuta_8" required />
              </label>
              <button type="submit">登録してログイン</button>
            </form>
            <p className={styles.meta}>ニックネームが重複している場合は登録できません。</p>
          </article>
        </section>

        <div className={styles.backToSelectWrap}>
          <a className={styles.backToSelectLink} href={clubSelectorUrl}>
            部活選択に戻る
          </a>
        </div>
      </div>
    </main>
  );
}
