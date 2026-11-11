import Link from "next/link";
import { headers } from "next/headers";
import { filterOutSuperAdminMembers, getAuthorizedAdminMember, isSuperAdminNickname } from "@/lib/admin-access";
import { prisma } from "@/lib/prisma";
import { sortMembersByGradeAscending } from "@/lib/member-sort";
import { AdminMemberTable } from "./admin-member-table";
import { AttendanceRateResetButton } from "./attendance-rate-reset-button";
import styles from "./admin-dashboard.module.css";

const PRODUCTION_APP_FALLBACK_URL = "https://toyota-kyudo-notes.onrender.com";

function isLocalOnlyOrigin(value: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value);
}

// 管理画面は最新の登録結果を即座に反映します。
export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams: Promise<{
    error?: string;
    ok?: string;
  }>;
};

// 管理者向けの集約ダッシュボードです。
export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const adminMember = await getAuthorizedAdminMember();
  const headerStore = await headers();

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

  const canManageRoles = true;
  const canManageSuperAdminFeatures = isSuperAdminNickname(adminMember.nickname);

  interface AdminMember {
    id: string;
    name: string;
    nickname: string | null;
    grade: string | null;
    role: "PLAYER" | "MANAGER" | "COACH" | "ADMIN";
  }

  const membersRaw = await prisma.member.findMany({
    select: {
      id: true,
      name: true,
      nickname: true,
      grade: true,
      role: true,
    },
  });

  const members = filterOutSuperAdminMembers(sortMembersByGradeAscending(membersRaw) as AdminMember[]);

  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || "";
  const forwardedProto = headerStore.get("x-forwarded-proto") || "https";
  const forwardedHost = headerStore.get("x-forwarded-host") || headerStore.get("host") || "localhost:3000";
  const appBaseUrl = configuredBaseUrl && !(process.env.NODE_ENV === "production" && isLocalOnlyOrigin(configuredBaseUrl))
    ? configuredBaseUrl.replace(/\/$/, "")
    : process.env.NODE_ENV === "production"
      ? PRODUCTION_APP_FALLBACK_URL
      : `${forwardedProto}://${forwardedHost}`;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>弓道部 管理画面</h1>
        <p>部員/マネージャー/コーチ向けの入力データを一元管理します。</p>
        <div className={styles.topLinks}>
          <Link className={styles.linkButton} href="/">
            メイン画面へ
          </Link>
          <Link className={styles.secondaryLink} href="/">
            部員ホームへ
          </Link>
        </div>
      </header>

      {params.error ? <p className={styles.error}>エラー: {params.error}</p> : null}
      {params.ok ? <p className={styles.ok}>保存しました: {params.ok}</p> : null}

      <section className={styles.card}>
        <h2>予定管理</h2>
        <p className={styles.meta}>単体予定作成、複数予定作成、予定削除をまとめて管理します。</p>
        <div className={styles.inlineActions}>
          <Link className={styles.linkButton} href="/admin/events">
            予定管理へ
          </Link>
        </div>
      </section>

      <section className={styles.card}>
        <h2>部員マネージャー</h2>
        <p className={styles.meta}>出席率、得点率、部員の目標を確認できます。</p>
        <div className={styles.inlineActions}>
          <Link className={styles.linkButton} href="/admin/manager">
            部員マネージャーウィンドウへ
          </Link>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>部員一覧</h2>
            <p className={styles.meta}>ニックネーム、学年、役職を編集できます。</p>
          </div>
        </div>

        <AdminMemberTable members={members} canManageRoles={canManageRoles} />
        <div className={styles.inlineActions}>
          <AttendanceRateResetButton />
        </div>
      </section>

      <section className={styles.card}>
        <h2>管理者専用機能</h2>
        <div className={styles.inlineActions}>
          {canManageSuperAdminFeatures ? (
            <>
              <Link className={styles.linkButton} href="/super-admin">
                スーパーアドミン画面
              </Link>
            </>
          ) : null}
        </div>
      </section>

    </main>
  );
}

