import Link from "next/link";
import { AttendanceStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { getJstDayRangeFromDateKey } from "@/lib/date-format";
import { LocalDate, LocalDateTime, LocalDateTimeRange } from "@/components/local-date-time";
import { autoMarkPreviousDayUnansweredAsAbsent } from "@/lib/attendance-auto-absent";
import { filterOutSuperAdminMembers } from "@/lib/admin-access";
import { getSessionMember } from "@/lib/member-session";
import { prisma } from "@/lib/prisma";
import styles from "@/app/member-page-shared.module.css";
import { sortMembersByGradeAscending } from "@/lib/member-sort";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ date: string }>;
};

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateFromKey(value: string): Date {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(year, month - 1, day);
}

function statusLabel(status: AttendanceStatus): string {
  if (status === AttendanceStatus.ATTEND) {
    return "出席";
  }

  if (status === AttendanceStatus.LATE) {
    return "遅刻";
  }

  if (status === AttendanceStatus.ABSENT) {
    return "欠席";
  }

  return "未回答";
}

function statusClassName(status: AttendanceStatus): string {
  if (status === AttendanceStatus.ATTEND) {
    return `${styles.statusBadge} ${styles.attend}`;
  }

  if (status === AttendanceStatus.LATE) {
    return `${styles.statusBadge} ${styles.late}`;
  }

  if (status === AttendanceStatus.ABSENT) {
    return `${styles.statusBadge} ${styles.absent}`;
  }

  return `${styles.statusBadge} ${styles.unknown}`;
}

function removeTrailingSameDateTitleSuffix(title: string, dateKey: string): string {
  const slashDateKey = dateKey.replace(/-/g, "/");
  const trailingDatePattern = new RegExp(`\\s*(?:${dateKey}|${slashDateKey})\\s*$`);
  const normalizedTitle = title.replace(trailingDatePattern, "").trim();
  return normalizedTitle || title;
}

export default async function AttendanceDetailsPage({ params }: PageProps) {
  const { date } = await params;

  if (!isDateKey(date)) {
    notFound();
  }

  const member = await getSessionMember();
  if (!member) {
    redirect("/auth");
  }

  await autoMarkPreviousDayUnansweredAsAbsent(member.id);

  const selectedDate = dateFromKey(date);
  const { startUtc: dayStart, endUtc: dayEnd } = getJstDayRangeFromDateKey(date);

  const [allMembers, events] = await Promise.all([
    prisma.member.findMany({
      select: { id: true, name: true, nickname: true, grade: true },
    }).then(sortMembersByGradeAscending).then(filterOutSuperAdminMembers),
    prisma.attendanceEvent.findMany({
      where: {
        scheduledAt: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      include: {
        records: {
          include: { member: true },
        },
      },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1><LocalDate value={selectedDate} /> の出欠詳細</h1>
        <p>各部員の回答状況とコメントを確認できます。</p>
      </header>

      <nav className={styles.nav}>
        <Link href={`/calendar/${date}`} className={styles.secondaryLink}>日付ページへ戻る</Link>
      </nav>

      <section className={styles.listGrid}>
        {events.map((event) => {
          const recordMap = new Map(event.records.map((record) => [record.memberId, record]));

          return (
            <article key={event.id} className={styles.card}>
              <h2>{removeTrailingSameDateTitleSuffix(event.title, date)}</h2>
              <p className={styles.meta}><LocalDateTimeRange startValue={event.scheduledAt} endValue={event.endAt} /></p>
              {event.matchDetail || event.note ? (
                <div className={styles.infoBox}>
                  {event.matchDetail ? <p className={styles.meta}>試合詳細: {event.matchDetail}</p> : null}
                  {event.note ? <p className={styles.meta}>補足: {event.note}</p> : null}
                </div>
              ) : null}

              <div className={styles.memberTableWrap}>
                <table className={styles.memberTable}>
                  <thead>
                    <tr>
                      <th>部員名</th>
                      <th>学年</th>
                      <th>出欠状況</th>
                      <th>コメント</th>
                      <th>回答日時</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allMembers.map((m) => {
                      const record = recordMap.get(m.id);
                      const status = record?.status || AttendanceStatus.UNKNOWN;
                      const displayName = m.nickname || m.name;

                      return (
                        <tr key={`${event.id}-${m.id}`}>
                          <td>
                            <strong>{displayName}</strong>
                          </td>
                          <td>{m.grade || "-"}</td>
                          <td>
                            <span className={statusClassName(status)}>
                              {statusLabel(status)}
                            </span>
                          </td>
                          <td>{record?.comment?.trim() ? record.comment : "-"}</td>
                          <td>
                            {record ? <LocalDateTime value={record.submittedAt} /> : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}

        {events.length === 0 ? <p className={styles.empty}>この日の出席イベントはありません。</p> : null}
      </section>
    </main>
  );
}
