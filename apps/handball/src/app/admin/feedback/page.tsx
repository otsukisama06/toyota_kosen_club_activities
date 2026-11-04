import Link from "next/link";
import { getAuthorizedAdminMember, isSuperAdminNickname } from "@/lib/admin-access";
import { LocalDateTime } from "@/components/local-date-time";
import { prisma } from "@/lib/prisma";
import { fetchPeerFeedbacks } from "@/lib/dual-db-content";
import styles from "./feedback-admin.module.css";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type AdminFeedbackPageProps = {
  searchParams: Promise<{ page?: string }>;
};

type SharedFeedback = {
  id: string;
  memberNameSnapshot: string;
  content: string;
  createdAt: Date;
};

export default async function AdminFeedbackPage({ searchParams }: AdminFeedbackPageProps) {
  const params = await searchParams;
  const parsedPage = Number.parseInt(params.page || "1", 10);
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const skip = (currentPage - 1) * PAGE_SIZE;

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

  if (!isSuperAdminNickname(adminMember.nickname)) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>このページは admin ユーザーのみ閲覧できます</h1>
          <p>フィードバック一覧の確認は、ユーザー名 admin のアカウントだけに許可されています。</p>
          <Link className={styles.linkButton} href="/admin">
            管理画面へ戻る
          </Link>
        </section>
      </main>
    );
  }

  const [localFeedbacks, peerFeedbacksRaw] = await Promise.all([
    prisma.feedback.findMany({
      select: {
        id: true,
        memberNameSnapshot: true,
        content: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    fetchPeerFeedbacks(),
  ]);
  const peerFeedbacks = peerFeedbacksRaw as SharedFeedback[];

  const mergedFeedbacks = [
    ...localFeedbacks.map((item) => ({ ...item, source: "弓道" })),
    ...peerFeedbacks.map((item) => ({ ...item, source: "卓球" })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const totalCount = mergedFeedbacks.length;
  const feedbacks = mergedFeedbacks.slice(skip, skip + PAGE_SIZE);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>フィードバック一覧</h1>
        <p>メイン画面から送られたフィードバックを新しい順で表示します。</p>
        <Link className={styles.linkButton} href="/admin">
          管理画面へ戻る
        </Link>
      </header>

      <section className={styles.card}>
        <p className={styles.pagerMeta}>
          {totalCount} 件中 {skip + 1} - {Math.min(skip + feedbacks.length, totalCount)} 件を表示
        </p>
        {feedbacks.length === 0 ? (
          <p className={styles.empty}>まだフィードバックは送信されていません。</p>
        ) : (
          <ul className={styles.list}>
            {feedbacks.map((feedback) => (
              <li key={feedback.id} className={styles.item}>
                <div className={styles.meta}>
                  <span>種別: {feedback.source}</span>
                  <span>送信者: {feedback.memberNameSnapshot}</span>
                  <span>日時: <LocalDateTime value={feedback.createdAt} /></span>
                </div>
                <p className={styles.content}>{feedback.content}</p>
                <form action="/api/feedback" method="post" style={{ display: "inline" }}>
                  <input type="hidden" name="intent" value="complete" />
                  <input type="hidden" name="feedbackId" value={feedback.id} />
                  <input type="hidden" name="redirectTo" value="/admin/feedback" />
                  <button type="submit" className={styles.completeButton}>完了</button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.pager}>
          {hasPrev ? (
            <Link className={styles.pagerButton} href={`/admin/feedback?page=${currentPage - 1}`}>
              前へ
            </Link>
          ) : (
            <span className={styles.pagerButtonDisabled}>前へ</span>
          )}
          <span className={styles.pagerCurrent}>{currentPage} / {totalPages}</span>
          {hasNext ? (
            <Link className={styles.pagerButton} href={`/admin/feedback?page=${currentPage + 1}`}>
              次へ
            </Link>
          ) : (
            <span className={styles.pagerButtonDisabled}>次へ</span>
          )}
        </div>
      </section>
    </main>
  );
}
