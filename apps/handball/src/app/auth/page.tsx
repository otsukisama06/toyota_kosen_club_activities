import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionMember } from "@/lib/member-session";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { LoginForm } from "./login-form";
import { PasswordField } from "./password-field";
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
          <h1>ログイン</h1>
          <p>ニックネーム（またはメールアドレス）と自分で設定したパスワードを入力すると、登録メールアドレスに6桁の確認コードが届きます。</p>
        </header>

        <p className={styles.notice}>
          これまで部活共通パスワードでログインしていた方は、最初に
          <Link href="/auth/password-reset">パスワード設定</Link>
          から自分のパスワードを設定してください。
        </p>

        {params.ok === "logout" ? <p className={styles.notice}>ログアウトしました。</p> : null}
        {params.ok === "password-set" ? (
          <p className={styles.notice}>パスワードを設定しました。新しいパスワードでログインしてください。</p>
        ) : null}
        {params.error ? <p className={styles.error}>エラー: {params.error}</p> : null}

        <section className={styles.grid}>
          <article className={`${styles.card} ${styles.loginCard}`}>
            <h2>ログイン</h2>
            <LoginForm />
            <p className={styles.meta}>
              <Link href="/auth/password-reset">パスワードを忘れた方・初めて設定する方はこちら</Link>
            </p>
          </article>

          <article className={styles.card}>
            <h2>アカウント登録</h2>
            <form action="/api/auth/register" method="post" className={styles.form}>
              <label>
                メールアドレス
                <input name="email" type="email" placeholder="例: player@example.com" autoComplete="email" required />
              </label>
              <label>
                学年
                <input name="grade" type="text" placeholder="例: 2年" maxLength={20} required />
              </label>
              <label>
                ニックネーム
                <input name="nickname" type="text" minLength={2} maxLength={20} placeholder="例: yuta_8" autoComplete="username" required />
              </label>
              <label>
                パスワード
                <PasswordField autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} placeholder={`${PASSWORD_MIN_LENGTH}文字以上・英字と数字を含む`} />
              </label>
              <label>
                パスワード（確認）
                <PasswordField name="passwordConfirm" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} placeholder="もう一度入力" />
              </label>
              <button type="submit">確認コードを送信</button>
            </form>
            <p className={styles.meta}>入力したメールアドレスに届く確認コードを入力すると登録が完了します。ニックネームやメールアドレスが重複している場合は登録できません。</p>
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
