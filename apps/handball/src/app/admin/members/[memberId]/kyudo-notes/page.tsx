import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthorizedAdminMember } from "@/lib/admin-access";
import { LocalDateTime } from "@/components/local-date-time";
import { prisma } from "@/lib/prisma";
import styles from "@/app/admin/member-detail-dashboard.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ memberId: string }>;
};

export default async function AdminMemberKyudoNotesPage({ params }: PageProps) {
  const { memberId } = await params;
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

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      name: true,
      nickname: true,
      grade: true,
    },
  });

  if (!member) {
    notFound();
  }

  const notes = await prisma.kyudoNote.findMany({
    where: { memberId },
    orderBy: { noteDateKey: "desc" },
  });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{member.nickname || member.name} の弓道ノート一覧</h1>
        <p>{member.grade || "学年未設定"}</p>
      </header>

      <nav className={styles.nav}>
        <Link className={styles.secondaryLink} href={`/admin/members/${member.id}`}>部員概要へ戻る</Link>
      </nav>

      <section className={styles.card}>
        <h2>記録一覧</h2>
        {notes.length === 0 ? (
          <p className={styles.empty}>弓道ノートはまだ記録されていません。</p>
        ) : (
          <ul className={styles.tableList}>
            {notes.map((note: { id: string; noteDateKey: string; updatedAt: Date; content: string }) => (
              <li key={note.id}>
                <strong>{note.noteDateKey}</strong>
                {" / 最終更新: "}
                <LocalDateTime value={note.updatedAt} />
                <p style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{note.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
