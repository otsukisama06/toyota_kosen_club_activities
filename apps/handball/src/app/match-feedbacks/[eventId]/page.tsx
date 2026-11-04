import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionMember } from "@/lib/member-session";
import { prisma } from "@/lib/prisma";
import { LocalDateTime, LocalDateTimeRange } from "@/components/local-date-time";
import styles from "@/app/home-dashboard.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
};

export default async function MatchFeedbackDetailPage({ params, searchParams }: PageProps) {
  const { eventId } = await params;
  const sp = await searchParams;
  const member = await getSessionMember();

  if (!member) {
    redirect("/auth");
  }

  const event = await prisma.attendanceEvent.findFirst({
    where: {
      id: eventId,
      eventType: "MATCH",
      records: {
        some: { memberId: member.id },
      },
    },
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      endAt: true,
      matchOpponent: true,
      matchDetail: true,
      note: true,
    },
  });

  if (!event) {
    notFound();
  }

  const myFeedback = await prisma.matchFeedback.findUnique({
    where: {
      attendanceEventId_memberId: {
        attendanceEventId: event.id,
        memberId: member.id,
      },
    },
    select: {
      feedback: true,
      updatedAt: true,
    },
  });

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.card}>
          <h1>{event.title}</h1>
          <p>{event.matchOpponent || "相手未設定"}</p>
          <p className={styles.muted}><LocalDateTimeRange startValue={event.scheduledAt} endValue={event.endAt} /></p>
          {event.matchDetail ? <p className={styles.muted}>試合詳細: {event.matchDetail}</p> : null}
          {event.note ? <p className={styles.muted}>補足: {event.note}</p> : null}
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
              {sp.error === "invalid-input" ? "入力内容が不正です。" : "処理に失敗しました。"}
            </p>
          </section>
        ) : null}

        <section className={styles.card}>
          <h2>あなたの振り返り</h2>
          {myFeedback ? (
            <p style={{ margin: "0 0 10px 0", whiteSpace: "pre-wrap", color: "#3a2f33" }}>{myFeedback.feedback}</p>
          ) : (
            <p style={{ margin: "0 0 10px 0", color: "#6a585d" }}>まだ振り返りは入力されていません。</p>
          )}
          {myFeedback ? (
            <p className={styles.muted}>最終更新: <LocalDateTime value={myFeedback.updatedAt} /></p>
          ) : null}
        </section>

        <section className={styles.card}>
          <h2>{myFeedback ? "振り返りを編集" : "振り返りを入力"}</h2>
          <form action="/api/match-feedbacks" method="post" className={styles.form}>
            <input type="hidden" name="attendanceEventId" value={event.id} />
            <input type="hidden" name="intent" value="save" />
            <input type="hidden" name="redirectTo" value="/match-feedbacks" />
            <label>
              振り返り
              <textarea
                name="feedback"
                rows={8}
                defaultValue={myFeedback?.feedback || ""}
                placeholder="良かった点、改善点、次回の目標などを記入"
                required
              />
            </label>
            <button type="submit" className={styles.primary}>
              {myFeedback ? "更新する" : "保存する"}
            </button>
          </form>

          {myFeedback ? (
            <form action="/api/match-feedbacks" method="post" className={styles.inlineForm}>
              <input type="hidden" name="attendanceEventId" value={event.id} />
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="redirectTo" value="/match-feedbacks" />
              <button type="submit" className={styles.dangerSmall}>この振り返りを削除</button>
            </form>
          ) : null}
        </section>

        {member?.canAccessAdmin ? (
          <section className={styles.card}>
            <h2>管理者用</h2>
            <Link href={`/match-feedbacks/${event.id}/responses`} className={styles.button}>
              回答者の振り返りを見る
            </Link>
          </section>
        ) : null}

        <section className={styles.feedbackSection}>
          <Link href="/match-feedbacks" className={styles.secondary}>試合一覧へ戻る</Link>
        </section>
      </main>
    </div>
  );
}
