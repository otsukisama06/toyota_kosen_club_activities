// サーバーコンポーネント
import { BulkDatePicker } from "./bulk-date-picker";
import styles from "../events-management.module.css";

// 初期表示の日付がビルド日で固定されないよう、アクセスのたびに描画します。
export const dynamic = "force-dynamic";

// デフォルトの日付を計算
function getDefaultDate(): string {
  const today = new Date();
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(today);
}

// サーバーコンポーネントとしてデフォルトエクスポート
export default function BulkPage() {
  const today = getDefaultDate();
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>複数予定作成</h1>
        <p>カレンダーから日付を複数選択して、予定をまとめて作成します。</p>
      </header>
      <section className={styles.card}>
        <BulkDatePicker defaultDate={today} />
      </section>
    </main>
  );
}