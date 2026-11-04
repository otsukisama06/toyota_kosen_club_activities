import Link from "next/link";
import { AttendanceEventType, AttendanceStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import {
  addJstDays,
  createJstDate,
  getJstDateParts,
  getJstDayRangeFromDateKey,
  getJstMonthRangeUtc,
  getJstWeekday,
  nowInJst,
  toDateKey,
} from "@/lib/date-format";
import { isJapaneseHolidayDateKey } from "@/lib/japanese-holiday";
import { autoMarkPreviousDayUnansweredAsAbsent } from "@/lib/attendance-auto-absent";
import { canAccessAdminByMember } from "@/lib/admin-access";
import { shouldCountForAttendanceRate } from "@/lib/attendance-rate";
import { cleanupCompletedExpiredClubTasks } from "@/lib/club-task";
import { getSessionMember } from "@/lib/member-session";
import { prisma } from "@/lib/prisma";
import { fetchActiveAnnouncement } from "@/lib/dual-db-content";
import { CalendarPdfDownloadButton } from "./calendar-pdf-download-button";
import { ClubTaskBoard } from "./club-task-board";
import { FloatingMobileTabs } from "./floating-mobile-tabs";
import styles from "./home-dashboard.module.css";

// DB の最新状態を毎回反映したいので動的描画にします。
export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<{ month?: string }>;
};

function buildEventDetailText(matchDetail: string | null, note: string | null): string | null {
  const parts: string[] = [];
  if (matchDetail) {
    parts.push(`試合詳細: ${matchDetail}`);
  }
  if (note) {
    parts.push(`補足: ${note}`);
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join("\n");
}

function parseMonthParam(month?: string): Date {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    const todayParts = getJstDateParts(nowInJst());
    return createJstDate(todayParts.year, todayParts.month - 1, 1);
  }

  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    const todayParts = getJstDateParts(nowInJst());
    return createJstDate(todayParts.year, todayParts.month - 1, 1);
  }

  return createJstDate(year, monthIndex, 1);
}

function toMonthParam(date: Date): string {
  const parts = getJstDateParts(date);
  const year = String(parts.year);
  const month = String(parts.month).padStart(2, "0");
  return `${year}-${month}`;
}

function formatCalendarMonth(date: Date): string {
  const parts = getJstDateParts(date);
  return `${parts.year} ${parts.month}月`;
}

function formatJstTime(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatEventTimeRange(startValue: Date, endValue?: Date | null): string {
  const startText = formatJstTime(startValue);
  if (!endValue) {
    return startText;
  }
  return `${startText}-${formatJstTime(endValue)}`;
}

// 月間カレンダーを 6 週分のマスで作るための日付配列です。
function buildCalendarDates(baseDate: Date): Date[] {
  const baseParts = getJstDateParts(baseDate);
  const firstDay = createJstDate(baseParts.year, baseParts.month - 1, 1);
  const startOffset = getJstWeekday(firstDay);
  const startDate = addJstDays(firstDay, -startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    return addJstDays(startDate, index);
  });
}

// 部員向けホーム画面です。
export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const member = await getSessionMember();

  if (!member) {
    redirect("/auth");
  }

  await autoMarkPreviousDayUnansweredAsAbsent(member.id);
  const canManageClubTasks = canAccessAdminByMember(member);

  const currentMonth = parseMonthParam(params.month);
  const currentMonthParts = getJstDateParts(currentMonth);
  const { startUtc: monthStartUtc, endUtc: nextMonthUtc } = getJstMonthRangeUtc(
    currentMonthParts.year,
    currentMonthParts.month - 1,
  );
  const today = nowInJst();
  const previousMonth = createJstDate(currentMonthParts.year, currentMonthParts.month - 2, 1);
  const followingMonth = createJstDate(currentMonthParts.year, currentMonthParts.month, 1);
  const dates = buildCalendarDates(currentMonth);
  const todayKey = toDateKey(today);
  const { startUtc: todayStartUtc, endUtc: todayEndUtc } = getJstDayRangeFromDateKey(todayKey);
  const monthParam = toMonthParam(currentMonth);
  const monthQuery = `?month=${monthParam}`;

  const [events, practiceMenus, attendanceRecords, latestNote, todayAttendanceEventCount] = await Promise.all([
    prisma.attendanceEvent.findMany({
      where: {
        scheduledAt: {
          gte: monthStartUtc,
          lt: nextMonthUtc,
        },
      },
      include: {
        records: true,
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.practiceMenu.findMany({
      where: {
        practiceDate: {
          gte: monthStartUtc,
          lt: nextMonthUtc,
        },
      },
      orderBy: { practiceDate: "asc" },
    }),
    prisma.attendanceRecord.findMany({
      where: {
        memberId: member.id,
        event: {
          eventType: {
            in: [AttendanceEventType.PRACTICE, AttendanceEventType.MATCH],
          },
        },
      },
      include: {
        event: true,
      },
    }),
    prisma.kyudoNote.findFirst({
      where: {
        memberId: member.id,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.attendanceEvent.count({
      where: {
        scheduledAt: {
          gte: todayStartUtc,
          lt: todayEndUtc,
        },
      },
    }),
  ]);
  let clubTasks: Array<{
    id: string;
    title: string;
    deadlineOn: Date;
    isCompleted: boolean;
    completedAt: Date | null;
    createdBy: { id: string; nickname: string | null } | null;
    createdAt: Date;
  }> = [];

  if (canManageClubTasks) {
    try {
      await cleanupCompletedExpiredClubTasks();
      clubTasks = await prisma.clubTask.findMany({
        include: {
          createdBy: {
            select: {
              id: true,
              nickname: true,
            },
          },
        },
        orderBy: [{ isCompleted: "asc" }, { deadlineOn: "asc" }, { createdAt: "desc" }],
      });
    } catch (error) {
      // migration 未適用などで ClubTask が読めない場合でもホーム画面は表示を継続します。
      console.error("[home] failed to fetch club tasks", error);
    }
  }
  const activeAnnouncement = await fetchActiveAnnouncement(today);

  // 出席率を計算
  const validAttendances = attendanceRecords.filter(
    (record) =>
      shouldCountForAttendanceRate(record.event.eventType, record.event.scheduledAt, member.attendanceRateStartAt)
  );
  const attendCount = validAttendances.filter((record) => record.status === "ATTEND" || record.status === "LATE").length;
  const attendanceRate = validAttendances.length === 0 ? null : (attendCount / validAttendances.length) * 100;

  const scheduleMap = new Map<string, Set<"練習" | "試合">>();
  const eventDetailMap = new Map<string, { practice: string[]; match: string[] }>();
  const attendanceStatusByDateMap = new Map<string, { registered: number; pending: number }>();
  const hasSupplementByDateMap = new Map<string, boolean>();
  const eventResponseStatusMap = new Map<string, AttendanceStatus>();
  const scheduleTextByDateMap = new Map<string, string[]>();
  const supplementTextByDateMap = new Map<string, string[]>();

  for (const record of attendanceRecords) {
    eventResponseStatusMap.set(record.eventId, record.status);
  }

  for (const event of events) {
    const key = toDateKey(event.scheduledAt);
    const current = scheduleMap.get(key) || new Set<"練習" | "試合">();
    const label = event.eventType === AttendanceEventType.MATCH ? "試合" : "練習";
    current.add(label);
    scheduleMap.set(key, current);

    const detailText = buildEventDetailText(event.matchDetail, event.note);
    if (detailText) {
      const details = eventDetailMap.get(key) || { practice: [], match: [] };
      if (label === "試合") {
        details.match.push(detailText);
      } else {
        details.practice.push(detailText);
      }
      eventDetailMap.set(key, details);
      hasSupplementByDateMap.set(key, true);
    }

    const responseStatus = eventResponseStatusMap.get(event.id);
    const statusSummary = attendanceStatusByDateMap.get(key) || { registered: 0, pending: 0 };
    if (!responseStatus || responseStatus === AttendanceStatus.UNKNOWN) {
      statusSummary.pending += 1;
    } else {
      statusSummary.registered += 1;
    }
    attendanceStatusByDateMap.set(key, statusSummary);

    const scheduleTexts = scheduleTextByDateMap.get(key) || [];
    scheduleTexts.push(`${label} ${formatEventTimeRange(event.scheduledAt, event.endAt)}`);
    scheduleTextByDateMap.set(key, scheduleTexts);

    const supplementTexts = supplementTextByDateMap.get(key) || [];
    if (event.matchDetail) {
      supplementTexts.push(`試合詳細: ${event.matchDetail}`);
    }
    if (event.note) {
      supplementTexts.push(`補足: ${event.note}`);
    }
    supplementTextByDateMap.set(key, supplementTexts);
  }

  for (const practice of practiceMenus) {
    const key = toDateKey(practice.practiceDate);
    const current = scheduleMap.get(key) || new Set<"練習" | "試合">();
    current.add("練習");
    scheduleMap.set(key, current);

    const scheduleTexts = scheduleTextByDateMap.get(key) || [];
    scheduleTexts.push("練習 (メニュー)");
    scheduleTextByDateMap.set(key, scheduleTexts);

    if (practice.detail) {
      const supplementTexts = supplementTextByDateMap.get(key) || [];
      supplementTexts.push(`練習メニュー補足: ${practice.detail}`);
      supplementTextByDateMap.set(key, supplementTexts);
      hasSupplementByDateMap.set(key, true);
    }
  }

  const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
  const hasTodayAttendanceEvent = todayAttendanceEventCount > 0;
  const daysInMonth = new Date(Date.UTC(currentMonthParts.year, currentMonthParts.month, 0)).getUTCDate();
  const calendarPdfRows = Array.from({ length: daysInMonth }, (_, dayIndex) => {
    const day = dayIndex + 1;
    const date = createJstDate(currentMonthParts.year, currentMonthParts.month - 1, day);
    const dateKey = toDateKey(date);
    const weekdayIndex = getJstWeekday(date);
    const schedules = scheduleTextByDateMap.get(dateKey) || [];
    const supplements = [...new Set(supplementTextByDateMap.get(dateKey) || [])];
    return {
      dateKey,
      weekdayLabel: weekdayLabels[weekdayIndex],
      weekdayIndex,
      isHoliday: isJapaneseHolidayDateKey(dateKey),
      hasActivity: schedules.length > 0,
      schedules,
      supplements,
    };
  });

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        {!member.email ? (
          <section className={styles.emailReminderWindow}>
            <h2>メールアドレスが未登録です</h2>
            <p>プロフィール欄からメールアドレスを登録してください。</p>
          </section>
        ) : null}

        {activeAnnouncement ? (
          <section className={styles.announcementWindow}>
            <h2>サーバ管理者からの通達</h2>
            <p>{activeAnnouncement.message}</p>
          </section>
        ) : null}

        <section className={styles.hero}>
          <h1>{member.nickname} のカレンダー</h1>
          <div className={styles.heroGoalWrap}>
            <h1 className={styles.heroGoalTitle}>目標</h1>
            <div className={styles.goalGrid}>
              <article className={styles.goalItem}>
                <h3>一年の目標</h3>
                <p>{member.yearlyGoal || "未設定です。プロフィールから入力できます。"}</p>
              </article>
              <article className={styles.goalItem}>
                <h3>{`${currentMonthParts.month}月の目標`}</h3>
                <p>{member.monthlyGoal || "未設定です。プロフィールから入力できます。"}</p>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.calendarCard}>
          <div className={styles.calendarHeader}>
            <div>
              <h2>{formatCalendarMonth(currentMonth)}</h2>
              <p>日付を押すと詳細ページへ移動し、その日の予定と出席詳細を確認できます。</p>
            </div>
            <div className={styles.monthSwitch}>
              <Link className={styles.monthButton} href={`/?month=${toMonthParam(previousMonth)}`} aria-label="前の月">◀</Link>
              <Link className={styles.monthButton} href={`/?month=${toMonthParam(followingMonth)}`} aria-label="次の月">▶</Link>
            </div>
          </div>
          <div className={styles.statusLegend}>
            <span><strong>済</strong></span>
            <span><strong>未</strong></span>
          </div>
          <div className={styles.weekdays}>
            {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
              <span
                key={day}
                className={
                  day === "日"
                    ? styles.weekdaySun
                    : day === "土"
                      ? styles.weekdaySat
                      : ""
                }
              >
                {day}
              </span>
            ))}
          </div>
          <div className={styles.calendarGrid}>
            {dates.map((date) => {
              const dateParts = getJstDateParts(date);
              const key = toDateKey(date);
              const weekday = getJstWeekday(date);
              const isSunday = weekday === 0;
              const isSaturday = weekday === 6;
              const isHoliday = isJapaneseHolidayDateKey(key);
              const eventDetails = eventDetailMap.get(key);
              const schedules = Array.from(scheduleMap.get(key) || []);
              const attendanceStatusSummary = attendanceStatusByDateMap.get(key);
              const hasSupplement = hasSupplementByDateMap.get(key) === true;
              const isCurrentMonth =
                dateParts.year === currentMonthParts.year &&
                dateParts.month === currentMonthParts.month;
              const isToday = key === todayKey;

              const cellClassName = [
                styles.dayCell,
                isCurrentMonth ? "" : styles.outsideMonth,
                hasSupplement ? styles.dayHasSupplement : "",
                isToday ? styles.today : "",
                (isSunday || isHoliday) ? styles.dayCellHoliday : "",
                isSaturday ? styles.dayCellSaturday : "",
              ].filter(Boolean).join(" ");

              const dayNumberClassName = [
                styles.dayNumber,
                (isSunday || isHoliday) ? styles.dayNumberHoliday : "",
                isSaturday ? styles.dayNumberSaturday : "",
              ].filter(Boolean).join(" ");

              return (
                <Link
                  key={key}
                  href={`/calendar/${key}?from=home`}
                  className={cellClassName}
                >
                  <div className={dayNumberClassName}>{dateParts.day}</div>
                  {attendanceStatusSummary ? (
                    <div className={styles.statusRow}>
                      {attendanceStatusSummary.registered > 0 ? (
                        <span className={`${styles.statusBadge} ${styles.registeredBadge}`}>
                          済
                        </span>
                      ) : null}
                      {attendanceStatusSummary.pending > 0 ? (
                        <span className={`${styles.statusBadge} ${styles.pendingBadge}`}>
                          未
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className={styles.dayItems}>
                    {schedules.map((item, index) => {
                      const detailsByType = item === "試合" ? eventDetails?.match : eventDetails?.practice;
                      const tooltip = detailsByType && detailsByType.length > 0
                        ? detailsByType.join("\n----------------\n")
                        : undefined;

                      return (
                        <span
                          key={`${item}-${index}`}
                          className={`${styles.badge} ${item === "試合" ? styles.badgeMatch : styles.badgePractice}`}
                          title={tooltip}
                        >
                          {item}
                        </span>
                      );
                    })}
                  </div>
                </Link>
              );
            })}
          </div>
          {hasTodayAttendanceEvent ? (
            <div className={styles.calendarBottomAction}>
              <Link href={`/calendar/${todayKey}?from=home`} className={styles.todayAttendanceRegisterButton}>
                今日の出席を登録する
              </Link>
              <Link href={`/calendar/${todayKey}/attendance-details`} className={styles.todayAttendanceButton}>
                今日の全部員の出欠詳細を見る
              </Link>
            </div>
          ) : null}
        </section>

        {canManageClubTasks ? (
          <ClubTaskBoard tasks={clubTasks} redirectTo={`/?month=${monthParam}`} />
        ) : null}

        <section className={styles.summaryCard}>
          <div className={styles.summaryGrid}>
            <article className={styles.summaryItem}>
              <h3>出席率</h3>
              <p className={styles.summaryValue}>
                {attendanceRate === null ? "データなし" : `${attendanceRate.toFixed(1)}%`}
              </p>
              <p className={styles.summarySubtext}></p>
            </article>
            {latestNote ? (
              <article className={styles.summaryItem}>
                <h3>最新のノート</h3>
                <p className={styles.latestNoteContent}>{latestNote.content}</p>
                <Link href="/kyudo-notes" className={styles.summaryLink}>
                  ノート一覧へ →
                </Link>
              </article>
            ) : (
              <article className={styles.summaryItem}>
                <h3>最新のノート</h3>
                <p className={styles.summarySubtext}>まだノートが作成されていません</p>
                <Link href="/kyudo-notes" className={styles.summaryLink}>
                  ノートを作成する →
                </Link>
              </article>
            )}
          </div>
        </section>

        <section className={styles.feedbackSection}>
          <Link href="/feedback" className={styles.feedbackButton}>
            アプリへのフィードバックを送る
          </Link>
          <CalendarPdfDownloadButton
            className={styles.feedbackButtonSub}
            monthLabel={formatCalendarMonth(currentMonth)}
            monthParam={monthParam}
            rows={calendarPdfRows}
          />
        </section>

        <FloatingMobileTabs monthQuery={monthQuery} />
      </main>
    </div>
  );
}
