import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionMember } from "@/lib/member-session";
import { isSuperAdminNickname } from "@/lib/admin-access";
import { CLUB_EMAIL_LABEL } from "@/lib/email-notification";
import { SuperAdminNav } from "./super-admin-nav";
import styles from "./super-admin.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "スーパーアドミン",
};

// スーパーアドミン専用コンソールの共通レイアウトです。admin 以外は中身を表示しません。
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const member = await getSessionMember();
  if (!member) {
    redirect("/auth");
  }

  if (!isSuperAdminNickname(member.nickname)) {
    return (
      <main className={styles.denied}>
        <section className={styles.card}>
          <h1>このページは admin ユーザーのみ利用できます</h1>
          <p className={styles.meta}>スーパーアドミン機能を使うには、admin アカウントでログインしてください。</p>
          <div className={styles.actions}>
            <Link className={styles.secondaryButton} href="/">トップへ戻る</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <strong>スーパーアドミン</strong>
          <span>{CLUB_EMAIL_LABEL}アプリ / {member.nickname} でログイン中</span>
        </div>
        <SuperAdminNav />
        <div className={styles.sidebarFooter}>
          <Link href="/admin">管理画面へ</Link>
          <Link href="/">メイン画面へ</Link>
        </div>
      </aside>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
