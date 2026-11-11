import Link from "next/link";
import { AttendanceStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { canAccessAdminByMember } from "@/lib/admin-access";
import { autoMarkPreviousDayUnansweredAsAbsent } from "@/lib/attendance-auto-absent";
import { getJstDayRangeFromDateKey } from "@/lib/date-format";
import { LocalDate, LocalDateTime, LocalDateTimeRange } from "@/components/local-date-time";
import { getSessionMember } from "@/lib/member-session";
import { prisma } from "@/lib/prisma";
import { MEMBER_PUBLIC_SELECT } from "@/lib/member-fields";
import styles from "@/app/member-page-shared.module.css";
import { AttendanceSubmitForm } from "./attendance-submit-form";
import { EventDeleteButton } from "./event-delete-button";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ ok?: string; error?: string; from?: string }>;
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

  if (status === AttendanceStatus.EARLY_LEAVE) {
    return "早退";
  }

  if (status === AttendanceStatus.ABSENT) {
    return "欠席";
  }

  return "未回答";
}

function removeTrailingSameDateTitleSuffix(title: string, dateKey: string): string {
  const slashDateKey = dateKey.replace(/-/g, "/");
  const trailingDatePattern = new RegExp(`\\s*(?:${dateKey}|${slashDateKey})\\s*$`);
  const normalizedTitle = title.replace(trailingDatePattern, "").trim();
  return normalizedTitle || title;
}

export default async function CalendarDatePage({ params, searchParams }: PageProps) {
  const { date } = await params;
  const query = await searchParams;
  const isHomeCalendarMode = query.from === "home";

  if (!isDateKey(date)) {
    notFound();
  }

  const member = await getSessionMember();
  if (!member) {
    redirect("/auth");
  }

  await autoMarkPreviousDayUnansweredAsAbsent(member.id);

  const canManageEvents = canAccessAdminByMember(member);
  const redirectTo = isHomeCalendarMode ? `/calendar/${date}?from=home` : `/calendar/${date}`;

  const selectedDate = dateFromKey(date);
  const { startUtc: dayStart, endUtc: dayEnd } = getJstDayRangeFromDateKey(date);

  const [events, matches, practiceMenus] = await Promise.all([
    prisma.attendanceEvent.findMany({
      where: {
        scheduledAt: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      include: {
        records: {
          include: { member: { select: MEMBER_PUBLIC_SELECT } },
        },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.matchRecord.findMany({
      where: {
        attendanceEventId: null,
        matchDate: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      orderBy: { matchDate: "asc" },
    }),
    prisma.practiceMenu.findMany({
      where: {
        practiceDate: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      include: { createdBy: { select: MEMBER_PUBLIC_SELECT } },
      orderBy: { practiceDate: "asc" },
    }),
  ]);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1><LocalDate value={selectedDate} /> の確認</h1>
        <p>この日に必要な情報を確認し、出席入力までこのページで行えます。</p>
      </header>

      <nav className={styles.nav}>
        <Link href="/" className={styles.secondaryLink}>カレンダーへ戻る</Link>
        {canManageEvents ? (
          <Link href={`/admin/events/edit?month=${date.slice(0, 7)}&date=${date}`} className={styles.secondaryLink}>予定編集</Link>
        ) : null}
        {canManageEvents ? (
          <Link href={`/admin/events/single?date=${date}`} className={styles.button}>予定を作成</Link>
        ) : null}
      </nav>

      {query.ok ? <p className={styles.message}>保存しました: {query.ok}</p> : null}
      {query.error ? <p className={styles.error}>エラー: {query.error}</p> : null}

      <section className={styles.grid}>
        <article className={styles.card}>
          <h2>当日の予定</h2>
          <ul className={styles.list}>
            {events.map((event) => (
              <li key={event.id}>出席イベント: {removeTrailingSameDateTitleSuffix(event.title, date)} / <LocalDateTimeRange startValue={event.scheduledAt} endValue={event.endAt} /></li>
            ))}
            {matches.map((match) => (
              <li key={match.id}>試合: vs {match.opponent} / <LocalDateTime value={match.matchDate} /></li>
            ))}
            {practiceMenus.map((practice) => (
              <li key={practice.id}>練習: {practice.title} / <LocalDateTime value={practice.practiceDate} /></li>
            ))}
          </ul>
        </article>
      </section>

      <section className={styles.listGrid}>
        {events.map((event) => {
          // 管理者の出席状態を簡易表示から除外
          const nonAdminRecords = event.records.filter((record) => {
            return record.member.role !== "ADMIN";
          });
          const attendMembers = nonAdminRecords.filter((record) => record.status === AttendanceStatus.ATTEND).map((record) => record.member.name);
          const lateMembers = nonAdminRecords.filter((record) => record.status === AttendanceStatus.LATE).map((record) => record.member.name);
          const earlyLeaveMembers = nonAdminRecords.filter((record) => record.status === AttendanceStatus.EARLY_LEAVE).map((record) => record.member.name);
          const absentMembers = nonAdminRecords.filter((record) => record.status === AttendanceStatus.ABSENT).map((record) => record.member.name);
          const answeredIds = new Set(nonAdminRecords.map((record) => record.memberId));
          
          const myRecord = event.records.find((record) => record.memberId === member.id);

          return (
            <article key={event.id} className={styles.card}>
              <h2>{removeTrailingSameDateTitleSuffix(event.title, date)}</h2>
              <p className={styles.meta}><LocalDateTimeRange startValue={event.scheduledAt} endValue={event.endAt} /></p>
              {event.matchDetail || event.note ? (
                <div className={styles.infoBox}>
                  <p className={styles.infoTitle}>提出前に確認</p>
                  {event.matchDetail ? <p className={styles.meta}>試合詳細: {event.matchDetail}</p> : null}
                  {event.note ? <p className={styles.meta}>補足: {event.note}</p> : null}
                </div>
              ) : null}

              {/* 自分の出席状況送信フォーム（上に移動） */}
              {isHomeCalendarMode && !myRecord ? (
                <p className={styles.infoTitle}>あなたはこのイベントに未回答です。</p>
              ) : null}

              <AttendanceSubmitForm
                eventId={event.id}
                redirectTo="/"
                initialStatus={myRecord?.status || AttendanceStatus.ATTEND}
                initialComment={myRecord?.comment || ""}
              />

              {/* 簡易出欠詳細（下に移動） */}
              <div className={styles.statusRow}>
                <span className={`${styles.statusBadge} ${styles.attend}`}>出席 {attendMembers.length}</span>
                <span className={`${styles.statusBadge} ${styles.late}`}>遅刻 {lateMembers.length}</span>
                <span className={`${styles.statusBadge} ${styles.earlyLeave}`}>早退 {earlyLeaveMembers.length}</span>
                <span className={`${styles.statusBadge} ${styles.absent}`}>欠席 {absentMembers.length}</span>
                
              </div>
              <p className={styles.meta}>出席: {attendMembers.length > 0 ? attendMembers.join("、") : "なし"}</p>
              <p className={styles.meta}>遅刻: {lateMembers.length > 0 ? lateMembers.join("、") : "なし"}</p>
              <p className={styles.meta}>早退: {earlyLeaveMembers.length > 0 ? earlyLeaveMembers.join("、") : "なし"}</p>
              <p className={styles.meta}>欠席: {absentMembers.length > 0 ? absentMembers.join("、") : "なし"}</p>
              

              {(lateMembers.length > 0 || absentMembers.length > 0 || earlyLeaveMembers.length > 0) && (
                <div style={{ marginTop: '16px', maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '8px', padding: '12px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#333' }}>欠席・遅刻・早退者一覧</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #ddd' }}>
                        <th style={{ padding: '8px 4px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>名前</th>
                        <th style={{ padding: '8px 4px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>状態</th>
                        <th style={{ padding: '8px 4px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>コメント</th>
                      </tr>
                    </thead>
                    <tbody>
                      {event.records
                        .filter((record) => record.status === AttendanceStatus.ABSENT || record.status === AttendanceStatus.LATE || record.status === AttendanceStatus.EARLY_LEAVE)
                        .map((record) => (
                          <tr key={record.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px 4px' }}>{record.member.name}</td>
                            <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: '500',
                                backgroundColor: record.status === AttendanceStatus.ABSENT ? '#fee2e2' : record.status === AttendanceStatus.LATE ? '#fef3c7' : '#dbeafe',
                                color: record.status === AttendanceStatus.ABSENT ? '#991b1b' : record.status === AttendanceStatus.LATE ? '#92400e' : '#1e40af'
                              }}>
                                {record.status === AttendanceStatus.ABSENT ? '欠席' : record.status === AttendanceStatus.LATE ? '遅刻' : '早退'}
                              </span>
                            </td>
                            <td style={{ padding: '8px 4px', fontSize: '12px', color: '#666' }}>{record.comment || '-'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Link href={`/calendar/${date}/attendance-details`} className={styles.secondaryLink}>
                出欠詳細情報を見る
              </Link>

              {canManageEvents && event.eventType === "MATCH" ? (
                <Link href={`/admin/events/${event.id}/feedbacks?returnTo=${encodeURIComponent(`/calendar/${date}?from=home`)}`} className={styles.secondaryLink}>
                  試合振り返り一覧を見る
                </Link>
              ) : null}

              <p className={styles.meta}>
                自分の現在回答: {myRecord ? <>{statusLabel(myRecord.status)} (<LocalDateTime value={myRecord.submittedAt} />)</> : "未回答"}
              </p>
            </article>
          );
        })}
        {events.length === 0 ? <p className={styles.empty}>この日の出席イベントはありません。</p> : null}
      </section>

      {canManageEvents ? (
        <section className={styles.card}>
          <h2>予定の削除</h2>
          <p className={styles.warningText}>警告: 削除した予定は元に戻せません。実行前に内容を確認してください。</p>
          {events.length === 0 ? (
            <p className={styles.empty}>削除できる出席イベントはありません。</p>
          ) : (
            <div className={styles.deleteList}>
              {events.map((event) => (
                <div key={`delete-${event.id}`} className={styles.deleteItem}>
                  <div className={styles.deleteItemMeta}>
                    <p>{removeTrailingSameDateTitleSuffix(event.title, date)}</p>
                    <p className={styles.meta}><LocalDateTimeRange startValue={event.scheduledAt} endValue={event.endAt} /></p>
                  </div>
                  <EventDeleteButton
                    eventId={event.id}
                    eventLabel={removeTrailingSameDateTitleSuffix(event.title, date)}
                    redirectTo={redirectTo}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}