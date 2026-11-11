import Link from "next/link";
import { getAuthorizedAdminMember, isSuperAdminNickname } from "@/lib/admin-access";
import { LocalDateTime } from "@/components/local-date-time";
import { fetchUnifiedReleaseNotes } from "@/lib/dual-db-content";
import styles from "../admin-dashboard.module.css";

type PageProps = {
  searchParams: Promise<{
    error?: string;
    ok?: string;
  }>;
};

async function getReleaseNotesSafely() {
  try {
    const notes = await fetchUnifiedReleaseNotes();

    return { notes, loadError: null as string | null };
  } catch (error) {
    console.error("[admin/release-notes] failed to fetch release notes", error);
    return {
      notes: [] as Array<{
        id: string;
        version: string;
        title: string;
        content: string;
        createdBy: { nickname: string | null };
        createdAt: Date;
      }>,
      loadError: "リリースノートの取得に失敗しました。DBのマイグレーション状態を確認してください。",
    };
  }
}

export default async function ReleaseNotesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const adminMember = await getAuthorizedAdminMember();

  if (!adminMember) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>管理画面へのアクセス権限がありません</h1>
          <p>役職が管理者・コーチ・マネージャーのユーザーのみ利用できます。</p>
          <Link className={styles.secondaryLink} href="/admin">管理画面へ戻る</Link>
        </section>
      </main>
    );
  }

  if (!isSuperAdminNickname(adminMember.nickname)) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>権限がありません</h1>
          <p>ユーザー名が「admin」の人のみリリースノートの作成ができます。</p>
          <Link className={styles.secondaryLink} href="/admin">管理画面へ戻る</Link>
        </section>
      </main>
    );
  }

  const { notes: releaseNotes, loadError } = await getReleaseNotesSafely();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>リリースノート管理</h1>
      </header>

      <nav className={styles.nav}>
        <Link className={styles.secondaryLink} href="/super-admin">スーパーアドミン画面へ戻る</Link>
        <Link className={styles.secondaryLink} href="/admin">管理画面へ戻る</Link>
      </nav>

      {sp.error && (
        <section className={styles.card} style={{ borderColor: "#d32f2f" }}>
          <p style={{ color: "#d32f2f" }}>{sp.error}</p>
        </section>
      )}

      {loadError && (
        <section className={styles.card} style={{ borderColor: "#d32f2f" }}>
          <p style={{ color: "#d32f2f" }}>{loadError}</p>
        </section>
      )}

      {sp.ok && (
        <section className={styles.card} style={{ borderColor: "#388e3c" }}>
          <p style={{ color: "#388e3c" }}>{sp.ok}</p>
        </section>
      )}

      <section className={styles.card}>
        <h2>新規リリースノート</h2>
        <form action="/api/release-notes" method="post" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <input type="hidden" name="redirectTo" value="/admin/release-notes" />
          
          <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span>バージョン（例：v1.0.0）</span>
            <input
              type="text"
              name="version"
              minLength={1}
              maxLength={20}
              placeholder="例: v1.0.0"
              required
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontFamily: "inherit",
                fontSize: "14px"
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span>タイトル</span>
            <input
              type="text"
              name="title"
              minLength={1}
              maxLength={100}
              placeholder="例: 新機能「目標管理」を追加しました"
              required
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontFamily: "inherit",
                fontSize: "14px"
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span>内容</span>
            <textarea
              name="content"
              minLength={1}
              maxLength={2000}
              placeholder="変更内容、修正内容などを記入してください"
              required
              rows={8}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontFamily: "inherit",
                fontSize: "14px",
                resize: "vertical"
              }}
            />
          </label>

          <button
            type="submit"
            style={{
              padding: "10px 16px",
              backgroundColor: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "bold"
            }}
          >
            作成
          </button>
        </form>
      </section>

      {releaseNotes.length > 0 && (
        <section className={styles.card}>
          <h2>リリース履歴</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {releaseNotes.map((note) => (
              <article
                key={note.id}
                style={{
                  padding: "12px",
                  border: "1px solid #e0e0e0",
                  borderRadius: "4px",
                  backgroundColor: "#f9f9f9"
                }}
              >
                <h3 style={{ margin: "0 0 8px 0" }}>
                  {note.version}: {note.title}
                </h3>
                <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#666" }}>
                  作成者: {note.createdBy.nickname || "不明"} / <LocalDateTime value={note.createdAt} />
                </p>
                <p style={{ margin: "0", whiteSpace: "pre-wrap", lineHeight: "1.6" }}>
                  {note.content}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
