import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceStatus } from "@prisma/client";
import { getAuthorizedAdminMember } from "@/lib/admin-access";
import { LocalDateTimeRange } from "@/components/local-date-time";
import { prisma } from "@/lib/prisma";
import styles from "@/app/admin/member-detail-dashboard.module.css";

// 管理者が出席状況を最新で確認できるよう動的描画にします。
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ memberId: string }>;
};

// 部員ごとの出席履歴ページです。
export default async function MemberAttendancePage({ params }: PageProps) {
  const { memberId } = await params;
  const adminMember = await getAuthorizedAdminMember();

  if (!adminMember) {
    return (
      <main className={styles.page}><section className={styles.card}><h1>アクセス権限が必要です</h1></section></main>
    );
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      attendances: {
        include: { event: true },
        orderBy: { event: { scheduledAt: "desc" } },
      },
    },
  });

  if (!member) {
    notFound();
  }

  const counts = {
    attend: member.attendances.filter((record) => record.status === AttendanceStatus.ATTEND).length,
    late: member.attendances.filter((record) => record.status === AttendanceStatus.LATE).length,
    absent: member.attendances.filter((record) => record.status === AttendanceStatus.ABSENT).length,
    unknown: member.attendances.filter((record) => record.status === AttendanceStatus.UNKNOWN).length,
  };

  const total = Math.max(member.attendances.length, 1);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{member.name} の出席確認</h1>
        <p>イベントごとの出席状況を一覧と比率で確認します。</p>
      </header>

      <nav className={styles.nav}>
        <Link className={styles.secondaryLink} href={`/admin/members/${member.id}`}>部員概要へ</Link>
      </nav>

      <section className={styles.chartGrid}>
        {[
          ["出席", counts.attend, styles.attend],
          ["遅刻", counts.late, styles.late],
          ["欠席", counts.absent, styles.absent],
          ["未回答", counts.unknown, styles.unknown],
        ].map(([label, value, tone]) => (
          <article key={String(label)} className={styles.chartCard}>
            <div className={styles.barHeader}><span>{label}</span><span>{value}件</span></div>
            <div className={styles.barTrack}><div className={`${styles.barFill} ${tone}`} style={{ width: `${(Number(value) / total) * 100}%` }} /></div>
          </article>
        ))}
      </section>

      <section className={styles.card}>
        <h2>出席履歴</h2>
        <ul className={styles.tableList}>
          {member.attendances.map((record) => (
            <li key={record.id}>
              <LocalDateTimeRange startValue={record.event.scheduledAt} endValue={record.event.endAt} /> / {record.event.title} / {record.status}
            </li>
          ))}
          {member.attendances.length === 0 ? <li className={styles.empty}>まだ出席記録はありません。</li> : null}
        </ul>
      </section>
    </main>
  );
}
