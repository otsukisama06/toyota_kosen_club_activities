import Link from "next/link";
import { redirect } from "next/navigation";
import { AUTH_CODE_TTL_MINUTES, getPendingChallengePurpose } from "@/lib/auth-challenge";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { PasswordField } from "../../password-field";
import styles from "../../auth.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ok?: string; error?: string }>;
};

export default async function PasswordResetConfirmPage({ searchParams }: PageProps) {
  const params = await searchParams;
  if ((await getPendingChallengePurpose()) !== "PASSWORD_RESET") {
    redirect("/auth/password-reset");
  }

  return (
    <main className={styles.page}>
      <div className={styles.main}>
        <header className={styles.header}>
          <h1>新しいパスワードの設定</h1>
          <p>
            入力したメールアドレスが登録されている場合は、6桁の確認コードを送信しました。{AUTH_CODE_TTL_MINUTES}分以内に入力してください。
          </p>
        </header>

        {params.ok === "resent" ? <p className={styles.notice}>確認コードを再送信しました。</p> : null}
        {params.error ? <p className={styles.error}>エラー: {params.error}</p> : null}

        <section className={`${styles.card} ${styles.loginCard}`}>
          <h2>確認コードと新しいパスワード</h2>
          <form action="/api/auth/password-reset/confirm" method="post" className={styles.form}>
            <label>
              確認コード（6桁）
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder="123456"
                required
                autoFocus
                className={styles.codeInput}
              />
            </label>
            <label>
              新しいパスワード
              <PasswordField autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} placeholder={`${PASSWORD_MIN_LENGTH}文字以上・英字と数字を含む`} />
            </label>
            <label>
              新しいパスワード（確認）
              <PasswordField name="passwordConfirm" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} placeholder="もう一度入力" />
            </label>
            <button type="submit">パスワードを設定する</button>
          </form>
          <form action="/api/auth/resend" method="post" className={styles.inlineForm}>
            <button type="submit" className={styles.linkButton}>確認コードを再送信する</button>
          </form>
          <p className={styles.meta}>
            <Link href="/auth/password-reset">メールアドレスを入力し直す</Link>
            {" / "}
            <Link href="/auth">ログイン画面に戻る</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
