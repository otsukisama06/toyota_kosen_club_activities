import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthorizedAdminMember } from "@/lib/admin-access";
import { LocalDateTime, LocalDateTimeRange } from "@/components/local-date-time";
import { sortMembersByGradeAscending } from "@/lib/member-sort";
import { prisma } from "@/lib/prisma";
import styles from "../../events-management.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

type MemberRow = {
  id: string;
  name: string;
  nickname: string | null;
  grade: string | null;
};

type FeedbackRow = {
  id: string;
  memberId: string;
  feedback: string;
  updatedAt: Date;
};

export default async function AdminEventFeedbacksPage({ params, searchParams }: PageProps) {
  const { eventId } = await params;
  const sp = await searchParams;
  const adminMember = await getAuthorizedAdminMember();
  const returnTo = sp.returnTo && sp.returnTo.startsWith("/") ? sp.returnTo : "/admin/events";

  if (!adminMember) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>予定管理へのアクセス権限がありません</h1>
          <p>役職が管理者・コーチ・マネージャーのユーザーのみ利用できます。</p>
          <Link className={styles.linkButton} href={returnTo}>戻る</Link>
        </section>
      </main>
    );
  }

  const event = await prisma.attendanceEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      endAt: true,
      eventType: true,
      matchOpponent: true,
      matchDetail: true,
      note: true,
    },
  });

  if (!event) {
    notFound();
  }

  if (event.eventType !== "MATCH") {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>この予定は試合ではありません</h1>
          <p className={styles.meta}>振り返り一覧は試合予定にのみ表示されます。</p>
          <Link className={styles.secondaryLink} href={returnTo}>戻る</Link>
        </section>
      </main>
    );
  }

  const [membersRaw, feedbacksRaw] = await Promise.all([
    prisma.member.findMany({
      select: {
        id: true,
        name: true,
        nickname: true,
        grade: true,
      },
    }),
    prisma.matchFeedback.findMany({
      where: { attendanceEventId: event.id },
      select: {
        id: true,
        memberId: true,
        feedback: true,
        updatedAt: true,
      },
    }),
  ]);

  const members = sortMembersByGradeAscending(membersRaw as MemberRow[]);
  const feedbacks = feedbacksRaw as FeedbackRow[];

  const feedbackMap = new Map<string, FeedbackRow>(
    feedbacks.map((feedback: FeedbackRow) => [feedback.memberId, feedback])
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>試合振り返り一覧</h1>
        <p>
          {event.title}
          {event.matchOpponent ? ` / ${event.matchOpponent}` : ""}
          {" / "}
          <LocalDateTimeRange startValue={event.scheduledAt} endValue={event.endAt} />
        </p>
      </header>

      <div className={styles.topLinks}>
        <Link className={styles.linkButton} href={returnTo}>戻る</Link>
      </div>

      {event.matchDetail || event.note ? (
        <section className={styles.card}>
          <h2>試合情報</h2>
          {event.matchDetail ? <p className={styles.meta}>詳細: {event.matchDetail}</p> : null}
          {event.note ? <p className={styles.meta}>補足: {event.note}</p> : null}
        </section>
      ) : null}

      <section className={styles.card}>
        <h2>各部員の記入状況</h2>
        <div className={styles.memberTableWrap}>
          <table className={styles.memberTable}>
            <thead>
              <tr>
                <th>学年</th>
                <th>部員名</th>
                <th>記入状況</th>
                <th>振り返り内容</th>
                <th>更新日時</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member: MemberRow) => {
                const feedback = feedbackMap.get(member.id);
                const displayName = member.nickname || member.name;
                const hasFeedback = Boolean(feedback);

                return (
                  <tr key={member.id}>
                    <td>{member.grade || "-"}</td>
                    <td>{displayName}</td>
                    <td>{hasFeedback ? "記入済み" : "未記入"}</td>
                    <td style={{ whiteSpace: "pre-wrap" }}>{feedback ? feedback.feedback : "-"}</td>
                    <td>{feedback ? <LocalDateTime value={feedback.updatedAt} /> : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
