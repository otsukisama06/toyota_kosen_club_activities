import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthorizedAdminMember } from "@/lib/admin-access";
import { LocalDate } from "@/components/local-date-time";
import { prisma } from "@/lib/prisma";
import styles from "@/app/admin/member-detail-dashboard.module.css";

// 個別部員ページも最新情報をそのまま反映します。
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{
    error?: string;
    ok?: string;
  }>;
};

// 部員ごとの概要をまとめて確認する管理ページです。
export default async function MemberOverviewPage({ params, searchParams }: PageProps) {
  const { memberId } = await params;
  const sp = await searchParams;
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
    include: {
      attendances: true,
    },
  });

  if (!member) {
    notFound();
  }

  const attendCount = member.attendances.filter((record) => record.status === "ATTEND").length;
  const absentCount = member.attendances.filter((record) => record.status === "ABSENT").length;
  const lateCount = member.attendances.filter((record) => record.status === "LATE").length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{member.name} の管理ページ</h1>
        <p>{member.grade || "学年未設定"} / {member.role}</p>
        <p>メールアドレス: {member.email || "未登録"}</p>
      </header>

      <nav className={styles.nav}>
        <Link className={styles.secondaryLink} href="/admin">管理画面へ戻る</Link>
        <Link className={styles.primaryLink} href={`/admin/members/${member.id}/attendance`}>出席確認</Link>
        <Link className={styles.primaryLink} href={`/admin/members/${member.id}/kyudo-notes`}>弓道ノート一覧</Link>
      </nav>

      {sp.error && (
        <section className={styles.card} style={{ borderColor: "#d32f2f" }}>
          <p style={{ color: "#d32f2f" }}>{sp.error}</p>
        </section>
      )}

      {sp.ok && (
        <section className={styles.card} style={{ borderColor: "#388e3c" }}>
          <p style={{ color: "#388e3c" }}>保存しました</p>
        </section>
      )}

      <section className={styles.card}>
        <h2>基本情報</h2>
        <form action={`/api/members/${member.id}`} method="post" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="redirectTo" value={`/admin/members/${member.id}`} />
          
          <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span>ニックネーム</span>
            <input
              type="text"
              name="nickname"
              minLength={2}
              maxLength={20}
              defaultValue={member.nickname || member.name}
              required
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontFamily: "inherit",
                fontSize: "14px"
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span>学年</span>
            <input
              type="text"
              name="grade"
              maxLength={20}
              defaultValue={member.grade || ""}
              placeholder="例: 1年"
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontFamily: "inherit",
                fontSize: "14px"
              }}
            />
          </label>

          <button
            type="submit"
            style={{
              padding: "10px 20px",
              backgroundColor: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "bold"
            }}
          >
            保存
          </button>
        </form>
      </section>

      <section className={styles.metrics}>
        <article className={styles.metricCard}>
          <div className={styles.metricValue}>{attendCount}</div>
          <div className={styles.metricLabel}>出席回数</div>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricValue}>{absentCount}</div>
          <div className={styles.metricLabel}>欠席回数</div>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricValue}>{lateCount}</div>
          <div className={styles.metricLabel}>遅刻回数</div>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.chartCard}>
          <h2>出席サマリー</h2>
          <div className={styles.statusStack}>
            <span className={`${styles.statusBadge} ${styles.attend}`}>出席 {attendCount}</span>
            <span className={`${styles.statusBadge} ${styles.late}`}>遅刻 {lateCount}</span>
            <span className={`${styles.statusBadge} ${styles.absent}`}>欠席 {absentCount}</span>
          </div>
        </article>

        <article className={styles.chartCard}>
          <h2>最近の更新</h2>
          <ul className={styles.tableList}>
            <li>部員登録日: <LocalDate value={member.createdAt} /></li>
            <li>出席記録数: {member.attendances.length}件</li>
          </ul>
        </article>

        <article className={styles.chartCard}>
          <h2>個人目標</h2>
          <ul className={styles.tableList}>
            <li>
              <strong>一年の目標:</strong> {member.yearlyGoal || "未設定"}
            </li>
            <li>
              <strong>その月の目標:</strong> {member.monthlyGoal || "未設定"}
            </li>
          </ul>
        </article>
      </section>

      <section className={styles.card} style={{ marginTop: "24px", borderTopWidth: "2px", borderTopColor: "#d73939", paddingTop: "16px" }}>
        <h2 style={{ color: "#8f1d1d" }}>危険なアクション</h2>
        <p className={styles.meta}>この部員を削除すると、関連するすべてのデータが削除されます。この操作は取り消せません。</p>
        <form action={`/api/members/${member.id}`} method="post" style={{ marginTop: "16px" }}>
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="redirectTo" value="/admin" />
          <button type="submit" className={styles.dangerButton} style={{ marginTop: "8px" }}>この部員を削除する</button>
        </form>
      </section>
    </main>
  );
}
