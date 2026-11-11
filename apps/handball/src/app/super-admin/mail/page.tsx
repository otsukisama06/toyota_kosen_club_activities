import { prisma } from "@/lib/prisma";
import { LocalDateTime } from "@/components/local-date-time";
import { isAttendanceReminderEmailEnabled } from "@/lib/email-notification";
import {
  MEMBER_ROLE_LABELS,
  buildPasswordSetupTemplate,
  describeOkParam,
  listConsoleMembers,
  requireSuperAdminPage,
} from "@/lib/super-admin";
import { BroadcastForm } from "./broadcast-form";
import styles from "../super-admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ok?: string; error?: string; template?: string }>;
};

export default async function SuperAdminMailPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const admin = await requireSuperAdminPage();

  const [members, broadcasts] = await Promise.all([
    listConsoleMembers(),
    prisma.emailBroadcast.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { createdBy: { select: { nickname: true } } },
    }),
  ]);
  const template = params.template === "password-setup" ? await buildPasswordSetupTemplate() : null;
  const okMessage = describeOkParam(params.ok);

  return (
    <>
      <header className={styles.pageHeader}>
        <h1>メール一斉送信</h1>
        <p>アプリのメールアドレスから、登録済みの部員へメールを送ります。宛先は1通ずつ個別に送信されるため、他の部員のアドレスは見えません。</p>
      </header>

      {okMessage ? <p className={styles.ok}>{okMessage}</p> : null}
      {params.error ? <p className={styles.error}>エラー: {params.error}</p> : null}

      <section className={styles.card}>
        <h2>新規作成</h2>
        <div className={styles.actions}>
          <a className={styles.smallButton} href="/super-admin/mail?template=password-setup">テンプレート: パスワード設定のお願い</a>
          <a className={styles.smallButton} href="/super-admin/mail">白紙に戻す</a>
        </div>
        <BroadcastForm
          key={params.template || "blank"}
          members={members}
          roleLabels={MEMBER_ROLE_LABELS}
          initialSubject={template?.subject || ""}
          initialBody={template?.body || ""}
          initialTarget={template ? "no-password" : "all"}
          adminEmail={admin.email}
          emailEnabled={isAttendanceReminderEmailEnabled()}
        />
      </section>

      <section className={styles.card}>
        <h2>出欠確認 LINE 通知のテスト送信</h2>
        <p className={styles.meta}>弓道部の出欠確認はメールではなく LINE で行います。練習・試合の開始45分前に届くのと同じ LINE グループへ、テストメッセージを1通送信します。</p>
        <form action="/api/admin-reminders/test" method="post" className={styles.form}>
          <input type="hidden" name="redirectTo" value="/super-admin/mail" />
          <div className={styles.actions}>
            <button type="submit" className={styles.secondaryButton}>LINE へテスト送信する</button>
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <h2>送信履歴（最新20件）</h2>
        {broadcasts.length === 0 ? (
          <p className={styles.meta}>まだ一斉送信はありません。</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>送信日時</th>
                  <th>件名・本文</th>
                  <th>対象</th>
                  <th>結果</th>
                  <th>送信者</th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((broadcast) => (
                  <tr key={broadcast.id}>
                    <td><LocalDateTime value={broadcast.createdAt} /></td>
                    <td>
                      <details>
                        <summary>{broadcast.subject}</summary>
                        <div className={styles.preview}>{broadcast.body}</div>
                      </details>
                    </td>
                    <td>{broadcast.targetSummary}</td>
                    <td>
                      {broadcast.failedCount > 0 ? (
                        <span className={styles.badgeDanger}>失敗 {broadcast.failedCount}</span>
                      ) : null}{" "}
                      <span className={styles.badgeOk}>{broadcast.sentCount}/{broadcast.recipientCount} 件</span>
                    </td>
                    <td>{broadcast.createdBy?.nickname || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
