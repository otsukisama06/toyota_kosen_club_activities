import Link from "next/link";
import { filterOutSuperAdminMembers } from "@/lib/admin-access";
import { getAuthorizedAdminMember } from "@/lib/admin-access";
import { prisma } from "@/lib/prisma";
import { sortMembersByGradeAscending } from "@/lib/member-sort";
import { GoalsTable } from "./goals-table";
import styles from "../../admin-dashboard.module.css";

export const dynamic = "force-dynamic";

type GoalMember = {
  id: string;
  name: string;
  nickname: string | null;
  grade: string | null;
  yearlyGoal: string | null;
  monthlyGoal: string | null;
};

export default async function AdminManagerGoalsPage() {
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
      yearlyGoal: true,
      monthlyGoal: true,
    },
    orderBy: {
      grade: "asc",
    },
  })) as GoalMember[];

  const sortedMembers = filterOutSuperAdminMembers(sortMembersByGradeAscending<GoalMember>(members));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>全員の目標一覧</h1>
        <p>全部員の年間目標・月間目標を確認できます。</p>
        <div className={styles.topLinks}>
          <Link className={styles.linkButton} href="/admin/manager">
            マネージャーウィンドウへ戻る
          </Link>
          <Link className={styles.secondaryLink} href="/admin">
            管理画面へ戻る
          </Link>
        </div>
      </header>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>部員の目標</h2>
            <p className={styles.meta}>年間目標と月間目標を表形式で表示しています。</p>
          </div>
        </div>

        <GoalsTable members={sortedMembers} />
      </section>
    </main>
  );
}
