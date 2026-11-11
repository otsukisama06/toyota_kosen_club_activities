import Link from "next/link";
import styles from "../auth.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function PasswordResetRequestPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <main className={styles.page}>
      <div className={styles.main}>
        <header className={styles.header}>
          <h1>パスワードの設定・再設定</h1>
          <p>登録済みのメールアドレスに6桁の確認コードを送ります。コードを入力して新しいパスワードを設定してください。</p>
        </header>

        {params.notice === "setup-required" ? (
          <p className={styles.notice}>
            ログイン方法が個人パスワードに変わりました。続けるには、登録済みのメールアドレスを入力してパスワードを設定してください。
          </p>
        ) : null}
        {params.error ? <p className={styles.error}>エラー: {params.error}</p> : null}

        <section className={`${styles.card} ${styles.loginCard}`}>
          <h2>メールアドレスの入力</h2>
          <form action="/api/auth/password-reset/request" method="post" className={styles.form}>
            <label>
              登録済みのメールアドレス
              <input name="email" type="email" placeholder="例: player@example.com" autoComplete="email" required autoFocus />
            </label>
            <button type="submit">確認コードを送信</button>
          </form>
          <p className={styles.meta}>メールアドレスを登録していない場合は、管理者に登録を依頼してください。</p>
          <p className={styles.meta}>
            <Link href="/auth">ログイン画面に戻る</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
