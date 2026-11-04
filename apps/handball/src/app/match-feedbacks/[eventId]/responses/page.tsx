import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionMember } from "@/lib/member-session";
import { canAccessAdminByMember } from "@/lib/admin-access";
import { LocalDateTime } from "@/components/local-date-time";
import styles from "@/app/home-dashboard.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

type FeedbackWithMember = {
  id: string;
  memberId: string;
  feedback: string;
  updatedAt: Date;
  member: {
    id: string;
    name: string;
    nickname: string | null;
    grade: string | null;
  };
};

export default async function MatchFeedbackResponsesPage({ params }: PageProps) {
  const { eventId } = await params;
  const member = await getSessionMember();

  if (!member) {
    redirect("/auth");
  }

  if (!canAccessAdminByMember(member)) {
    redirect("/match-feedbacks");
  }

  const event = await prisma.attendanceEvent.findFirst({
    where: {
      id: eventId,
      eventType: "MATCH",
    },
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      endAt: true,
      matchOpponent: true,
      matchDetail: true,
      note: true,
    },
  });

  if (!event) {
    notFound();
  }

  const feedbacks = await prisma.matchFeedback.findMany({
    where: { attendanceEventId: eventId },
    include: {
      member: {
        select: {
          id: true,
          name: true,
          nickname: true,
          grade: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>試合振り返り一覧</h1>
        <p>
          {event.title} - 回答者 {feedbacks.length} 人の振り返り
        </p>
      </header>

      <nav className={styles.nav}>
        <Link href="/match-feedbacks" className={styles.secondaryLink}>
          試合振り返り一覧へ戻る
        </Link>
      </nav>

      <section className={styles.card}>
        <h3>試合情報</h3>
        <div className={styles.meta}>
          <span>相手: {event.matchOpponent || "未設定"}</span>
          <span>日時: <LocalDateTime value={event.scheduledAt} /></span>
          {event.endAt && <span>終了: <LocalDateTime value={event.endAt} /></span>}
        </div>
        {event.matchDetail && <p className={styles.content}>{event.matchDetail}</p>}
        {event.note && <p className={styles.note}>{event.note}</p>}
      </section>

      <section className={styles.card}>
        <h3>部員の振り返り</h3>
        {feedbacks.length === 0 ? (
          <p className={styles.empty}>まだ回答はありません。</p>
        ) : (
          <ul className={styles.list}>
            {feedbacks.map((fb) => (
              <li key={fb.id} className={styles.item}>
                <div className={styles.meta}>
                  <span>
                    部名: {fb.member.name}
                    {fb.member.nickname ? ` (${fb.member.nickname})` : ""}
                  </span>
                  <span>学年: {fb.member.grade || "未設定"}</span>
                  <span>回答日: <LocalDateTime value={fb.updatedAt} /></span>
                </div>
                <p className={styles.content}>{fb.feedback}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}