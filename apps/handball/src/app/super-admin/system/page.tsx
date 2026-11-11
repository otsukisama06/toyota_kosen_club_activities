import { formatBytes, formatUptimeDhms, getRaspberryPiStatus } from "@/lib/system-status";
import { isAttendanceReminderEmailEnabled } from "@/lib/email-notification";
import { requireSuperAdminPage } from "@/lib/super-admin";
import styles from "../super-admin.module.css";

export const dynamic = "force-dynamic";

export default async function SuperAdminSystemPage() {
  await requireSuperAdminPage();
  const status = await getRaspberryPiStatus();
  const emailEnabled = isAttendanceReminderEmailEnabled();

  return (
    <>
      <header className={styles.pageHeader}>
        <h1>サーバ状態</h1>
        <p>アプリが動作しているサーバ（ラズパイ）と Docker コンテナの状態を表示します。</p>
      </header>

      <section className={styles.statGrid}>
        <div className={styles.stat}><span>稼働時間</span><strong style={{ fontSize: 18 }}>{formatUptimeDhms(status.uptimeSeconds)}</strong></div>
        <div className={styles.stat}><span>負荷平均（1/5/15分）</span><strong style={{ fontSize: 18 }}>{status.loadAverage.map((value) => value.toFixed(2)).join(" / ")}</strong></div>
        <div className={styles.stat}><span>メモリ空き</span><strong style={{ fontSize: 18 }}>{(status.memory.freeBytes / 1024 / 1024).toFixed(0)} / {(status.memory.totalBytes / 1024 / 1024).toFixed(0)} MB</strong></div>
        <div className={`${styles.stat} ${(status.disk.usagePercent ?? 0) >= 90 ? styles.statAlert : ""}`}><span>ディスク使用率</span><strong>{status.disk.usagePercent !== null ? `${status.disk.usagePercent}%` : "N/A"}</strong></div>
        <div className={`${styles.stat} ${emailEnabled ? "" : styles.statAlert}`}><span>メール送信設定</span><strong style={{ fontSize: 18 }}>{emailEnabled ? "設定済み" : "未設定"}</strong></div>
      </section>

      <section className={styles.card}>
        <h2>ホスト情報</h2>
        <div className={styles.notice}>
          <strong>ホスト</strong>: {status.hostname}
          <br />
          <strong>OS</strong>: {status.platform} {status.release} ({status.arch})
          <br />
          <strong>ディスク ({status.disk.path})</strong>: free {formatBytes(status.disk.freeBytes)} / available {formatBytes(status.disk.availableBytes)} / total {formatBytes(status.disk.totalBytes)} / used {formatBytes(status.disk.usedBytes)}
          <br />
          <strong>Docker</strong>: {status.docker.available ? `${status.docker.runningContainers ?? 0}/${status.docker.totalContainers ?? 0} 実行中` : `利用不可 (${status.docker.error || "unknown"})`}
        </div>
      </section>

      <section className={styles.card}>
        <h2>コンテナ</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>コンテナ</th><th>イメージ</th><th>状態</th><th>詳細</th></tr>
            </thead>
            <tbody>
              {status.docker.containers.map((container) => (
                <tr key={container.name}>
                  <td>{container.name}</td>
                  <td>{container.image}</td>
                  <td>
                    <span className={container.state === "running" ? styles.badgeOk : styles.badgeDanger}>{container.state}</span>
                  </td>
                  <td>{container.status}</td>
                </tr>
              ))}
              {status.docker.containers.length === 0 ? (
                <tr><td colSpan={4}>コンテナ情報を取得できませんでした。</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
