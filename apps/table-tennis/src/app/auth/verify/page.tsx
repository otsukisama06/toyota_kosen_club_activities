import Link from "next/link";
import { redirect } from "next/navigation";
import { AUTH_CODE_TTL_MINUTES, getPendingChallenge, getResendWaitSeconds, maskEmail } from "@/lib/auth-challenge";
import { getSessionMember } from "@/lib/member-session";
import styles from "../auth.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ok?: string; error?: string }>;
};

export default async function VerifyPage({ searchParams }: PageProps) {
  const params = await searchParams;
  if (await getSessionMember()) {
    redirect("/");
  }

  const challenge = await getPendingChallenge(["LOGIN", "REGISTER"]);
  if (!challenge) {
    redirect("/auth");
  }

  const waitSeconds = getResendWaitSeconds(challenge.sentAt);

  return (
    <main className={styles.page}>
      <div className={styles.main}>
        <header className={styles.header}>
          <h1>確認コードの入力</h1>
          <p>
            {maskEmail(challenge.email)} に6桁の確認コードを送信しました。{AUTH_CODE_TTL_MINUTES}分以内に入力してください。
          </p>
        </header>

        {params.ok === "resent" ? <p className={styles.notice}>確認コードを再送信しました。</p> : null}
        {params.error ? <p className={styles.error}>エラー: {params.error}</p> : null}

        <section className={`${styles.card} ${styles.loginCard}`}>
          <h2>{challenge.purpose === "REGISTER" ? "アカウント登録の確認" : "ログインの確認（二段階認証）"}</h2>
          <form action="/api/auth/verify" method="post" className={styles.form}>
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
            <button type="submit">{challenge.purpose === "REGISTER" ? "登録してログイン" : "ログインする"}</button>
          </form>
          <form action="/api/auth/resend" method="post" className={styles.inlineForm}>
            <button type="submit" className={styles.linkButton}>
              {waitSeconds > 0 ? `コードが届かない場合は${waitSeconds}秒後に再送信できます` : "確認コードを再送信する"}
            </button>
          </form>
          <p className={styles.meta}>
            <Link href="/auth">ログイン画面に戻る</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
