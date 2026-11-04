import { fetchUnifiedReleaseNotes } from "@/lib/dual-db-content";
import { LocalDateTime } from "@/components/local-date-time";
import styles from "./release-notes.module.css";

export const metadata = {
  title: "リリースノート | Toyota Kyudo Notes",
  description: "アプリケーションのリリース履歴とアップデート情報を確認できます。",
};

// ビルド時のデータベース依存をスキップ（Docker ビルド時にデータベースが存在しないため）
export const dynamic = "force-dynamic";

// 更新頻度が低い一覧のため、短期キャッシュで DB 読み取り回数を抑えます。
export const revalidate = 300;

async function getReleaseNotesSafely() {
  try {
    return await fetchUnifiedReleaseNotes();
  } catch (error) {
    // Docker build時などDB未接続環境でもプリレンダを失敗させない。
    console.error("[release-notes] failed to fetch release notes; fallback to empty list", error);
    return [];
  }
}

export default async function ReleaseNotesPage() {
  const releaseNotes = await getReleaseNotesSafely();

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>リリースノート</h1>
        <p>アプリケーションの更新や改善内容をお知らせします。</p>
      </header>

      {releaseNotes.length === 0 ? (
        <section className={styles.card}>
          <p className={styles.noData}>現在、リリースノートはありません。</p>
        </section>
      ) : (
        <div className={styles.releaseList}>
          {releaseNotes.map((note) => (
            <article key={note.id} className={styles.releaseItem}>
              <div className={styles.releaseHeader}>
                <h2 className={styles.releaseTitle}>
                  <span className={styles.version}>{note.version}</span>
                  <span>{note.title}</span>
                </h2>
                <LocalDateTime className={styles.releaseDate} value={note.createdAt} />
              </div>
              <p className={styles.releaseMeta}>
                {note.createdBy.nickname || "管理者"}
              </p>
              <div className={styles.releaseContent}>
                {note.content}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

