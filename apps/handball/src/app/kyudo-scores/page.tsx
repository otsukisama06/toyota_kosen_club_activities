import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionMember } from "@/lib/member-session";
import { prisma } from "@/lib/prisma";
import { LocalDateTime } from "@/components/local-date-time";
import styles from "@/app/home-dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function KyudoScoresPage() {
  const member = await getSessionMember();

  if (!member) {
    redirect("/auth");
  }

  const sheets = await prisma.kyudoScoreSheet.findMany({
    where: { memberId: member.id },
    include: { entries: { orderBy: { setNumber: "asc" } } },
    orderBy: { matchDate: "desc" },
  });

  // 勝敗数を計算（データベースのスコアから直接計算）
  const calcSetRecord = (entries: any[]) => {
    let our = 0;
    let their = 0;
    for (const entry of entries) {
      if (entry.ourScore > entry.theirScore) our++;
      else if (entry.ourScore < entry.theirScore) their++;
    }
    return { our, their };
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>試合結果入力</h1>
        <p>弓道の試合結果を入力・確認できます。</p>
      </header>

      <nav className={styles.nav}>
        <Link href="/" className={styles.secondaryLink}>ホームへ戻る</Link>
        <Link href="/kyudo-scores/new" className={styles.button}>新しい試合結果</Link>
      </nav>

      <section className={styles.grid}>
        <article className={styles.card}>
          <h2>過去の試合結果</h2>
          {sheets.length === 0 ? (
            <p className={styles.empty}>まだ試合結果が登録されていません。</p>
          ) : (
            <div className={styles.scoresListWrap}>
              <ul className={styles.scoresList}>
                {sheets.map((sheet) => {
                  const record = calcSetRecord(sheet.entries);
                  return (
                    <li key={sheet.id} className={styles.scoreItem}>
                      <div className={styles.scoreItemHeader}>
                        <Link href={`/kyudo-scores/${sheet.id}`} className={styles.scoreOpponent}>
                          {sheet.opponent}
                        </Link>
                        <span className={styles.scoreDate}>
                          <LocalDateTime value={sheet.matchDate} />
                        </span>
                      </div>
                      <div className={styles.scoreSetCount}>
                        {record.our}-{record.their}
                      </div>
                      <Link href={`/kyudo-scores/${sheet.id}`} className={styles.scoreDetailLink}>
                        詳細を見る →
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}