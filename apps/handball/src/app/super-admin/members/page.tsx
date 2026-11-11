import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { LocalDateTime } from "@/components/local-date-time";
import { isSuperAdminNickname } from "@/lib/admin-access";
import { MEMBER_ROLE_LABELS, describeOkParam, getRequestTimeMs, requireSuperAdminPage } from "@/lib/super-admin";
import styles from "../super-admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ok?: string; error?: string }>;
};

export default async function SuperAdminMembersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  await requireSuperAdminPage();

  const members = await prisma.member.findMany({
    select: {
      id: true,
      name: true,
      nickname: true,
      grade: true,
      role: true,
      email: true,
      passwordHash: true,
      passwordUpdatedAt: true,
      loginLockedUntil: true,
      failedLoginCount: true,
      lastActivityAt: true,
    },
    orderBy: [{ grade: "asc" }, { nickname: "asc" }],
  });
  const now = getRequestTimeMs();
  const okMessage = describeOkParam(params.ok);
  const noPasswordWithEmail = members.filter((member) => member.email && !member.passwordHash).length;

  return (
    <>
      <header className={styles.pageHeader}>
        <h1>部員アカウント</h1>
        <p>メールアドレス・パスワードの設定状況とログイン制限を確認できます。ニックネームや役職の変更は管理画面の部員一覧から行います。</p>
      </header>

      {okMessage ? <p className={styles.ok}>{okMessage}</p> : null}
      {params.error ? <p className={styles.error}>エラー: {params.error}</p> : null}

      <section className={styles.card}>
        <div className={styles.actions}>
          <Link className={styles.primaryButton} href="/super-admin/mail?template=password-setup">
            パスワード未設定者へ設定依頼メールを作成（{noPasswordWithEmail} 名）
          </Link>
          <Link className={styles.secondaryButton} href="/admin">管理画面の部員一覧へ</Link>
        </div>
        <p className={styles.meta}>
          メール未登録の部員はパスワードを設定できません。管理画面の部員詳細からメールアドレスを登録してください。
          「強制ログアウト」はすべての端末のログイン状態を無効にします。
        </p>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ニックネーム</th>
                <th>学年</th>
                <th>役職</th>
                <th>メール</th>
                <th>パスワード</th>
                <th>ログイン制限</th>
                <th>最終利用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isLocked = Boolean(member.loginLockedUntil && member.loginLockedUntil.getTime() > now);
                const isSelf = isSuperAdminNickname(member.nickname);
                return (
                  <tr key={member.id}>
                    <td>
                      <Link href={`/admin/members/${member.id}`}>{member.nickname || member.name}</Link>
                      {isSelf ? <> <span className={styles.badge}>admin</span></> : null}
                    </td>
                    <td>{member.grade || "-"}</td>
                    <td>{MEMBER_ROLE_LABELS[member.role] || member.role}</td>
                    <td>
                      {member.email ? member.email : <span className={styles.badgeDanger}>未登録</span>}
                    </td>
                    <td>
                      {member.passwordHash ? (
                        <span className={styles.badgeOk}>設定済み</span>
                      ) : (
                        <span className={styles.badgeWarn}>未設定</span>
                      )}
                      {member.passwordUpdatedAt ? (
                        <div className={styles.meta}><LocalDateTime value={member.passwordUpdatedAt} /></div>
                      ) : null}
                    </td>
                    <td>
                      {isLocked ? (
                        <span className={styles.badgeDanger}>
                          制限中（<LocalDateTime value={member.loginLockedUntil!} /> まで）
                        </span>
                      ) : member.failedLoginCount > 0 ? (
                        <span className={styles.meta}>失敗 {member.failedLoginCount} 回</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{member.lastActivityAt ? <LocalDateTime value={member.lastActivityAt} /> : "-"}</td>
                    <td>
                      <div className={styles.actions}>
                        {isLocked || member.failedLoginCount > 0 ? (
                          <form action="/api/super-admin/members" method="post" className={styles.inlineForm}>
                            <input type="hidden" name="intent" value="unlock" />
                            <input type="hidden" name="memberId" value={member.id} />
                            <button type="submit" className={styles.smallButton}>制限解除</button>
                          </form>
                        ) : null}
                        {!isSelf ? (
                          <form action="/api/super-admin/members" method="post" className={styles.inlineForm}>
                            <input type="hidden" name="intent" value="force-logout" />
                            <input type="hidden" name="memberId" value={member.id} />
                            <button type="submit" className={styles.smallButton}>強制ログアウト</button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
