import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionMember } from "@/lib/member-session";
import styles from "@/app/home-dashboard.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function KyudoScoreDetailPage({ params }: PageProps) {
  const { id } = await params;
  const member = await getSessionMember();

  const sheet = await prisma.kyudoScoreSheet.findUnique({
    where: { id },
    include: {
      member: { select: { name: true, nickname: true } },
      entries: { orderBy: { setNumber: "asc" } },
    },
  });

  if (!sheet) {
    notFound();
  }

  const isOwner = member?.id === sheet.memberId;
  const isAdmin = member?.canAccessAdmin === true;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>試合詳細</h1>
      </header>

      <nav className={styles.nav}>
        <Link href="/kyudo-scores" className={styles.secondaryLink}>試合結果一覧へ戻る</Link>
      </nav>

      <section className={styles.card}>
        <div className={styles.meta}>
          <span>作成者: {sheet.member.name}{sheet.member.nickname ? ` (${sheet.member.nickname})` : ""}</span>
           <span>日時: {new Date(sheet.matchDate).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>
        </div>

        <h2>対戦相手: {sheet.opponent}</h2>

        {sheet.comment && <p className={styles.content}>{sheet.comment}</p>}

        <h3 className={styles.sectionTitle}>各セットのスコア</h3>
        <ul className={styles.entryList}>
          {sheet.entries.map((entry) => (
            <li key={entry.id} className={styles.entryItem}>
              <span className={styles.setLabel}>第{entry.setNumber}セット</span>
              <span className={styles.score}>
                {sheet.member.name}{sheet.member.nickname ? ` (${sheet.member.nickname})` : ""}: {entry.ourScore} - {entry.theirScore}: {sheet.opponent}
              </span>
              {entry.comment && <p className={styles.setComment}>{entry.comment}</p>}
            </li>
          ))}
        </ul>

        {isOwner && (
          <Link href={`/kyudo-scores/${id}/edit`} className={styles.button}>
            編集する
          </Link>
        )}
      </section>
    </main>
  );
}