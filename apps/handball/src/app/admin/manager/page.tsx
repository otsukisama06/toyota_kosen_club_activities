import Link from "next/link";
import { filterOutSuperAdminMembers, getAuthorizedAdminMember, isSuperAdminNickname } from "@/lib/admin-access";
import { shouldCountForAttendanceRate } from "@/lib/attendance-rate";
import { prisma } from "@/lib/prisma";
import { sortMembersByGradeAscending } from "@/lib/member-sort";
import { ManagerMemberTable } from "./manager-member-table";
import styles from "../admin-dashboard.module.css";

export const dynamic = "force-dynamic";

type MemberRoleValue = "PLAYER" | "MANAGER" | "COACH" | "ADMIN";
type GoalRow = { id: string; yearlyGoal: string | null; monthlyGoal: string | null };
type ManagerMemberSource = {
  id: string;
  name: string;
  nickname: string | null;
  grade: string | null;
  role: MemberRoleValue;
  attendanceRateStartAt: Date;
  attendances: {
    status: "ATTEND" | "LATE" | "ABSENT" | "UNKNOWN";
    event: {
      eventType: "PRACTICE" | "MATCH";
      scheduledAt: Date;
    };
  }[];
  playerScores: { goals: number; shotAttempts: number }[];
};

export default async function AdminManagerPage() {
  const adminMember = await getAuthorizedAdminMember();

  if (!adminMember) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>管理画面へのアクセス権限がありません</h1>
          <p>役職が管理者・コーチ・マネージャーのユーザーのみ利用できます。</p>
          <Link className={styles.linkButton} href="/">
            トップへ戻る
          </Link>
        </section>
      </main>
    );
  }

  const members = (await prisma.member.findMany({
    select: {
      id: true,
      name: true,
      nickname: true,
      grade: true,
      role: true,
      attendanceRateStartAt: true,
      attendances: {
        select: {
          status: true,
          event: {
            select: {
              eventType: true,
              scheduledAt: true,
            },
          },
        },
      },
      playerScores: {
        select: {
          goals: true,
          shotAttempts: true,
        },
      },
    },
  })) as ManagerMemberSource[];

  const goalRows = await prisma.$queryRaw<GoalRow[]>`
    SELECT "id", "yearlyGoal", "monthlyGoal"
    FROM "Member"
  `;
  const goalMap = new Map<string, GoalRow>(goalRows.map((row: GoalRow) => [row.id, row]));

  const rows = filterOutSuperAdminMembers(sortMembersByGradeAscending<ManagerMemberSource>(members)).map((member: ManagerMemberSource) => {
    const role: MemberRoleValue = isSuperAdminNickname(member.nickname)
      ? "ADMIN"
      : (member.role as MemberRoleValue);

    const validAttendances = member.attendances.filter((record) =>
      shouldCountForAttendanceRate(record.event.eventType, record.event.scheduledAt, member.attendanceRateStartAt)
    );
    const attendCount = validAttendances.filter((record) => record.status === "ATTEND" || record.status === "LATE").length;
    const attendanceRate =
      validAttendances.length === 0 ? null : (attendCount / validAttendances.length) * 100;

    const totalGoals = member.playerScores.reduce((sum: number, score: { goals: number; shotAttempts: number }) => sum + score.goals, 0);
    const totalShotAttempts = member.playerScores.reduce((sum: number, score: { goals: number; shotAttempts: number }) => sum + score.shotAttempts, 0);
    const scoringRate = totalShotAttempts === 0 ? null : (totalGoals / totalShotAttempts) * 100;

    const goal = goalMap.get(member.id);

    return {
      id: member.id,
      name: member.name,
      nickname: member.nickname,
      grade: member.grade,
      role,
      attendanceRateStartAt: member.attendanceRateStartAt.toISOString(),
      yearlyGoal: goal?.yearlyGoal ?? null,
      monthlyGoal: goal?.monthlyGoal ?? null,
      attendanceRate,
      scoringRate,
    };
  });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>マネージャーウィンドウ</h1>
        <p>部員情報に加えて、出席率・得点率を確認できます。</p>
        <div className={styles.topLinks}>
          <Link className={styles.linkButton} href="/admin">
            管理画面へ戻る
          </Link>
          <Link className={styles.secondaryLink} href="/">
            メイン画面へ
          </Link>
        </div>
      </header>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>部員一覧 (マネージャー確認用)</h2>
            <p className={styles.meta}>チェックボックスで表示列を切り替えられます。</p>
          </div>
        </div>

        <ManagerMemberTable members={rows} />
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>目標管理</h2>
            <p className={styles.meta}>全部員の年間目標・月間目標を確認できます。</p>
          </div>
        </div>
        <Link className={styles.linkButton} href="/admin/manager/goals">
          部員マネージャー
        </Link>
      </section>
    </main>
  );
}
