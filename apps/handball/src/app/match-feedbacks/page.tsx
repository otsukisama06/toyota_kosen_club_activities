import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionMember } from "@/lib/member-session";
import { prisma } from "@/lib/prisma";
import { LocalDateTimeRange } from "@/components/local-date-time";
import { FloatingMobileTabs } from "@/app/floating-mobile-tabs";
import styles from "@/app/home-dashboard.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ok?: string; error?: string }>;
};

export default async function MatchFeedbacksPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const member = await getSessionMember();

  if (!member) {
    redirect("/auth");
  }

  // ユーザーが出席登録した試合を取得
  const attendedMatches = await prisma.attendanceEvent.findMany({
    where: {
      eventType: "MATCH",
      records: {
        some: {
          memberId: member.id,
        },
      },
    },
    include: {
      records: {
        where: { memberId: member.id },
      },
    },
    orderBy: { scheduledAt: "desc" },
  });

  // 各試合の振り返りを取得
  const eventIds = attendedMatches.map((m: { id: string }) => m.id);
  const feedbackMap = new Map();
  if (eventIds.length > 0) {
    const feedbacks = await prisma.matchFeedback.findMany({
      where: {
        attendanceEventId: { in: eventIds },
        memberId: member.id,
      },
    });
    feedbacks.forEach((f: { attendanceEventId: string; feedback: string }) => {
      feedbackMap.set(f.attendanceEventId, f.feedback);
    });
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.card}>
          <h1>試合の振り返り</h1>
          <p>出席した試合について、振り返りを記入できます。</p>
        </section>

        {sp.ok ? (
          <section className={styles.card} style={{ borderColor: "#2e7d32" }}>
            <p style={{ color: "#2e7d32", margin: 0 }}>
              {sp.ok === "updated"
                ? "振り返りを更新しました。"
                : sp.ok === "deleted"
                  ? "振り返りを削除しました。"
                  : "振り返りを保存しました。"}
            </p>
          </section>
        ) : null}

        {sp.error ? (
          <section className={styles.card} style={{ borderColor: "#c62828" }}>
            <p style={{ color: "#c62828", margin: 0 }}>
              {sp.error === "match-event-not-found"
                ? "対象の試合が見つかりませんでした。"
                : sp.error === "invalid-input"
                  ? "入力内容が不正です。"
                  : "保存に失敗しました。もう一度お試しください。"}
            </p>
          </section>
        ) : null}

        {attendedMatches.length === 0 ? (
          <section className={styles.card}>
            <p>出席登録した試合がまだありません。</p>
          </section>
        ) : (
          <section className={styles.card}>
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {attendedMatches.map((match: { id: string; title: string; matchOpponent: string | null; scheduledAt: Date; endAt: Date | null }) => {
                const existingFeedback = feedbackMap.get(match.id) as string | undefined;
                return (
                  <article
                    key={match.id}
                    style={{
                      padding: "16px",
                      border: "1px solid #ddc9ce",
                      borderRadius: "8px",
                      backgroundColor: existingFeedback ? "#fef9fa" : "#fff2f4",
                    }}
                  >
                    <div style={{ marginBottom: "12px" }}>
                      <h3 style={{ margin: "0 0 8px 0" }}>
                        {match.title}
                      </h3>
                      <p style={{ margin: "0", fontSize: "14px", color: "#666" }}>
                        {match.matchOpponent ? `対手: ${match.matchOpponent}` : ""}
                        <LocalDateTimeRange startValue={match.scheduledAt} endValue={match.endAt} />
                      </p>
                      {existingFeedback && (
                        <p
                          style={{
                            margin: "8px 0 0 0",
                            fontSize: "12px",
                            color: "#d3132a",
                            fontWeight: "bold",
                          }}
                        >
                          ✓ 振り返り済み
                        </p>
                      )}
                    </div>

                    <p style={{ margin: "0 0 12px 0", color: "#4a3f42", whiteSpace: "pre-wrap" }}>
                      {existingFeedback
                        ? `${existingFeedback.slice(0, 100)}${existingFeedback.length > 100 ? "..." : ""}`
                        : "まだ振り返りは入力されていません。"}
                    </p>

                    <Link className={styles.primary} href={`/match-feedbacks/${match.id}`}>
                      {existingFeedback ? "振り返りを見る / 編集" : "振り返りを入力"}
                    </Link>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className={styles.feedbackSection}>
          <Link href="/feedback" className={styles.feedbackButton}>
            アプリへのフィードバックを送る
          </Link>
        </section>

        <FloatingMobileTabs monthQuery="" />
      </main>
    </div>
  );
}
