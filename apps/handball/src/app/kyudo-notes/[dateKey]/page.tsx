import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LocalDateTime } from "@/components/local-date-time";
import { getSessionMember } from "@/lib/member-session";
import { prisma } from "@/lib/prisma";
import styles from "@/app/home-dashboard.module.css";

type PageProps = {
  params: Promise<{ dateKey: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
};

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export const dynamic = "force-dynamic";

export default async function KyudoNoteDetailPage({ params, searchParams }: PageProps) {
  const { dateKey } = await params;
  const sp = await searchParams;

  if (!isDateKey(dateKey)) {
    notFound();
  }

  const member = await getSessionMember();
  if (!member) {
    redirect("/auth");
  }

  const note = await prisma.kyudoNote.findFirst({
    where: {
      memberId: member.id,
      noteDateKey: dateKey,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.card}>
          <h1>弓道ノート {dateKey}</h1>
          <p>その日の振り返りや改善ポイントを書き残せます。</p>
        </section>

        {sp.ok ? (
          <section className={styles.card} style={{ borderColor: "#2e7d32" }}>
            <p style={{ margin: 0, color: "#2e7d32" }}>
              {sp.ok === "updated" ? "ノートを更新しました。" : sp.ok === "deleted" ? "ノートを削除しました。" : "ノートを保存しました。"}
            </p>
          </section>
        ) : null}

        {sp.error ? (
          <section className={styles.card} style={{ borderColor: "#c62828" }}>
            <p style={{ margin: 0, color: "#c62828" }}>
              {sp.error === "invalid-input" ? "内容を入力してください。" : "処理に失敗しました。"}
            </p>
          </section>
        ) : null}

        <section className={styles.card}>
          <h2>{note ? "ノートを編集" : "ノートを入力"}</h2>
          <form action="/api/kyudo-notes" method="post" className={styles.form}>
            <input type="hidden" name="intent" value={note ? "save" : "create"} />
            <input type="hidden" name="noteDateKey" value={dateKey} />
            <input type="hidden" name="redirectTo" value="/kyudo-notes" />
            {note ? <input type="hidden" name="noteId" value={note.id} /> : null}
            <label>
              内容
              <textarea
                name="content"
                rows={10}
                defaultValue={note?.content || ""}
                placeholder="今日の練習で良かったこと、課題、次回への目標を記入"
                required
              />
            </label>
            <button type="submit" className={styles.primary}>{note ? "更新する" : "保存する"}</button>
          </form>

          {note ? (
            <form action="/api/kyudo-notes" method="post" className={styles.inlineForm}>
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="noteId" value={note.id} />
              <input type="hidden" name="noteDateKey" value={dateKey} />
              <input type="hidden" name="redirectTo" value="/kyudo-notes" />
              <button type="submit" className={styles.dangerSmall}>この日のノートを削除</button>
            </form>
          ) : null}

          {note ? (
            <form action="/api/kyudo-notes" method="post" className={styles.inlineForm}>
              <input type="hidden" name="intent" value="create" />
              <input type="hidden" name="noteDateKey" value={dateKey} />
              <input type="hidden" name="redirectTo" value="/kyudo-notes" />
              <button type="submit" className={styles.secondary}>この日付で新しいノートを追加</button>
            </form>
          ) : null}

          {note ? (
            <p className={styles.muted} style={{ marginTop: 12 }}>
              最終作成: <LocalDateTime value={note.createdAt} />
            </p>
          ) : null}
        </section>

        <section className={styles.feedbackSection}>
          <Link href="/kyudo-notes" className={styles.secondary}>ノート一覧へ戻る</Link>
        </section>
      </main>
    </div>
  );
}
