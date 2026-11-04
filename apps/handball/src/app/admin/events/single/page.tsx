import Link from "next/link";
import { getAuthorizedAdminMember } from "@/lib/admin-access";
import { nowInJst, toDateTimeLocalValue } from "@/lib/date-format";
import { getDefaultEventTimesForDateKey } from "@/lib/event-default-times";
import styles from "../events-management.module.css";
import { SingleEventCreateForm } from "./single-event-create-form";

export const dynamic = "force-dynamic";

type SingleEventCreatePageProps = {
  searchParams: Promise<{
    date?: string;
  }>;
};

function normalizeDateParam(value?: string): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return value;
}

export default async function SingleEventCreatePage({ searchParams }: SingleEventCreatePageProps) {
  const params = await searchParams;
  const adminMember = await getAuthorizedAdminMember();

  if (!adminMember) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>単体予定作成へのアクセス権限がありません</h1>
          <p>役職が管理者・コーチ・マネージャーのユーザーのみ利用できます。</p>
          <Link className={styles.linkButton} href="/admin/events">
            予定管理へ戻る
          </Link>
        </section>
      </main>
    );
  }

  const now = nowInJst();
  const fallbackDate = toDateTimeLocalValue(now).slice(0, 10);
  const defaultDate = normalizeDateParam(params.date) || fallbackDate;
  const defaultTimes = getDefaultEventTimesForDateKey(defaultDate);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>単体予定作成</h1>
        <p>1件ずつ予定を作成します。時刻は5分単位で指定できます。</p>
        <div className={styles.topLinks}>
          <Link className={styles.linkButton} href="/admin/events">
            予定管理へ戻る
          </Link>
          <Link className={styles.secondaryLink} href="/admin/events/bulk">
            複数予定作成へ
          </Link>
        </div>
      </header>

      <section className={styles.card}>
        <h2>入力フォーム</h2>
        <SingleEventCreateForm
          defaultDate={defaultDate}
          defaultStartTime={defaultTimes.startTime}
          defaultEndTime={defaultTimes.endTime}
        />
      </section>
    </main>
  );
}
