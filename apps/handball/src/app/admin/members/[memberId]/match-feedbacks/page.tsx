import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthorizedAdminMember } from "@/lib/admin-access";
import { LocalDateTimeRange } from "@/components/local-date-time";
import { prisma } from "@/lib/prisma";
import styles from "@/app/admin/member-detail-dashboard.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ memberId: string }>;
};

export default async function AdminMemberMatchFeedbacksPage({ params }: PageProps) {
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

  const feedbacks = await prisma.matchFeedback.findMany({
    where: { memberId },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          endAt: true,
          matchOpponent: true,
        },
      },
    },
    orderBy: {
      event: {
        scheduledAt: "desc",
      },
    },
  });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{member.nickname || member.name} の試合振り返り一覧</h1>
        <p>{member.grade || "学年未設定"}</p>
      </header>

      <nav className={styles.nav}>
        <Link className={styles.secondaryLink} href={`/admin/members/${member.id}`}>部員概要へ戻る</Link>
      </nav>

      <section className={styles.card}>
        <h2>記録一覧</h2>
        {feedbacks.length === 0 ? (
          <p className={styles.empty}>試合振り返りはまだ記録されていません。</p>
        ) : (
          <ul className={styles.tableList}>
            {feedbacks.map((feedback: { id: string; feedback: string; event: { title: string; scheduledAt: Date; endAt: Date | null; matchOpponent: string | null } }) => (
              <li key={feedback.id}>
                <strong>{feedback.event.title}</strong>
                {" / "}
                <LocalDateTimeRange startValue={feedback.event.scheduledAt} endValue={feedback.event.endAt} />
                {feedback.event.matchOpponent ? ` / ${feedback.event.matchOpponent}` : ""}
                <p style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{feedback.feedback}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
