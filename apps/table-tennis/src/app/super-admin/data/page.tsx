import { describeOkParam, requireSuperAdminPage } from "@/lib/super-admin";
import styles from "../super-admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ok?: string; error?: string; deleted?: string; savedMB?: string }>;
};

const REDIRECT_TO = "/super-admin/data";

export default async function SuperAdminDataPage({ searchParams }: PageProps) {
  const params = await searchParams;
  await requireSuperAdminPage();
  const okMessage = describeOkParam(params.ok);

  return (
    <>
      <header className={styles.pageHeader}>
        <h1>データ管理</h1>
        <p>元に戻せない操作です。実行には確認キーワードと admin の追加パスワード（ログイン時に入力するもの）が必要です。</p>
      </header>

      {okMessage ? (
        <p className={styles.ok}>
          {okMessage}
          {params.savedMB ? ` / 削減量 ${params.savedMB}MB` : ""}
          {params.deleted ? ` / 削除件数 ${params.deleted}` : ""}
        </p>
      ) : null}
      {params.error ? <p className={styles.error}>エラー: {params.error}</p> : null}

      <section className={styles.card}>
        <h2>DB 軽量化</h2>
        <p className={styles.meta}>不要データ削除と DB メンテナンスを実行します。通常は通常モード、容量逼迫時のみ強力モードを使ってください。</p>
        <form action="/api/admin-data/compact" method="post" className={styles.form}>
          <input type="hidden" name="intent" value="compact-database" />
          <input type="hidden" name="redirectTo" value={REDIRECT_TO} />
          <label>
            確認キーワード（「軽量化実行」と入力）
            <input type="text" name="confirmText" placeholder="軽量化実行" required />
          </label>
          <label>
            実行パスワード
            <input type="password" name="executionPassword" placeholder="admin の追加パスワード" autoComplete="off" required />
          </label>
          <label className={styles.inlineLabel}>
            <input type="checkbox" name="aggressive" value="1" />
            強力モードを使う（VACUUM FULL。処理中にロックが発生しやすい）
          </label>
          <div className={styles.actions}>
            <button type="submit" className={styles.primaryButton}>DB 軽量化を実行する</button>
          </div>
        </form>
      </section>

      <section className={`${styles.card} ${styles.dangerCard}`}>
        <h2>予定の全削除</h2>
        <p className={styles.meta}>すべての出席予定・試合スコア・練習メニューを削除します。元に戻せません。</p>
        <form action="/api/admin-data/cleanup" method="post" className={styles.form}>
          <input type="hidden" name="intent" value="delete-all-schedules-and-match-scores" />
          <input type="hidden" name="redirectTo" value={REDIRECT_TO} />
          <label>
            確認キーワード（「全削除」と入力）
            <input type="text" name="confirmText" placeholder="全削除" required />
          </label>
          <label>
            実行パスワード
            <input type="password" name="executionPassword" placeholder="admin の追加パスワード" autoComplete="off" required />
          </label>
          <div className={styles.actions}>
            <button type="submit" className={styles.dangerButton}>予定と試合スコアを全削除する</button>
          </div>
        </form>
      </section>
    </>
  );
}
