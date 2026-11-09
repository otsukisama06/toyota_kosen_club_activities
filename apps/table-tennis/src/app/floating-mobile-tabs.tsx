"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./home-dashboard.module.css";

type FloatingMobileTabsProps = {
  monthQuery: string;
};

export function FloatingMobileTabs({ monthQuery }: FloatingMobileTabsProps) {
  const [raised, setRaised] = useState(false);
  const [timerState, setTimerState] = useState<{
    presetId: string;
    label: string;
    durationSeconds: number;
    setCount: number;
    startedAt: number;
    endAt: number;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isTimerSheetOpen, setIsTimerSheetOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const BOTTOM_THRESHOLD_PX = 24;

  function isNearBottom(): boolean {
    const documentHeight = document.documentElement.scrollHeight;
    const viewportBottom = window.scrollY + window.innerHeight;
    return viewportBottom >= documentHeight - BOTTOM_THRESHOLD_PX;
  }

  function formatDuration(totalSeconds: number): string {
    const safeSeconds = Math.max(0, totalSeconds);
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    if (minutes === 0) {
      return `${seconds}秒`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  useEffect(() => {
    const update = () => setRaised(isNearBottom());
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const remainingSeconds = useMemo(() => {
    if (!timerState) return 0;
    return Math.max(0, Math.ceil((timerState.endAt - now) / 1000));
  }, [now, timerState]);

  const currentTimerDisplaySeconds = useMemo(() => {
    if (!timerState) return 0;
    if (timerState.setCount > 1) {
      const elapsedSeconds = Math.max(0, Math.floor((now - timerState.startedAt) / 1000));
      const currentSetElapsed = elapsedSeconds % timerState.durationSeconds;
      return Math.max(0, timerState.durationSeconds - currentSetElapsed);
    }
    return remainingSeconds;
  }, [remainingSeconds, now, timerState]);

  const DEFAULT_TIMER_PRESETS = [
    { id: "timer-system-break-120", label: "休憩2分", durationSeconds: 120, setCount: 1, description: "休憩" },
    { id: "timer-system-interval-120-6", label: "2:00 × 6セット", durationSeconds: 120, setCount: 6, description: "2分セットの練習" },
    { id: "timer-system-interval-150-6", label: "2:30 × 6セット", durationSeconds: 150, setCount: 6, description: "2分30秒セットの練習" },
  ];

  function startTimer(preset: typeof DEFAULT_TIMER_PRESETS[number]) {
    // クリック時のイベントハンドラ内でのみ呼ばれるため、描画中の不純な呼び出しではない
    // eslint-disable-next-line react-hooks/purity
    const startedAt = Date.now();
    const setCount = preset.setCount && preset.setCount > 0 ? preset.setCount : 1;
    setTimerState({
      presetId: preset.id,
      label: preset.label,
      durationSeconds: preset.durationSeconds,
      setCount,
      startedAt,
      endAt: startedAt + preset.durationSeconds * setCount * 1000,
    });
    setStatusMessage(`${preset.label}を開始しました`);
    setIsTimerSheetOpen(false);
  }

  function stopTimer() {
    if (!timerState) return;
    setTimerState(null);
    setStatusMessage(`${timerState.label}を停止しました`);
  }

  return (
    <>
      <nav
        className={`${styles.mobileTabs} ${raised ? styles.mobileTabsRaised : ""}`.trim()}
        aria-label="メイン操作タブ"
      >
        <Link href="/table-tennis-notes" className={styles.mobileTab}>卓球ノート</Link>
        <Link href="/match-feedbacks" className={styles.mobileTab}>試合振り返り</Link>
        <Link href="/table-tennis-scores" className={styles.mobileTab}>試合結果</Link>
        <Link href={`/self/profile${monthQuery}`} className={styles.mobileTab}>プロフィール</Link>
      </nav>

      {isTimerSheetOpen ? (
        <div className={styles.timerOverlay} role="presentation" onClick={() => setIsTimerSheetOpen(false)}>
          <section
            className={styles.timerCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-timer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.timerCardHeader}>
              <div>
                <p className={styles.timerEyebrow}>部活動タイマー</p>
                <h2 id="activity-timer-title">タイマーを選択</h2>
                <p className={styles.timerLead}>練習や休憩の切り替えに使うタイマーをすぐ起動できます。</p>
              </div>
              <button type="button" className={styles.timerCloseButton} onClick={() => setIsTimerSheetOpen(false)}>
                閉じる
              </button>
            </div>

            {timerState ? (
              <section className={styles.timerActivePanel}>
                <div>
                  <p className={styles.timerActiveLabel}>実行中</p>
                  <h3>{timerState.label}</h3>
                  <p className={styles.timerSetLabel}>残り {timerState.setCount} セット</p>
                </div>
                <div className={styles.timerCountdown}>{formatDuration(currentTimerDisplaySeconds)}</div>
                <div className={styles.timerProgressTrack} aria-hidden="true">
                  <div
                    className={styles.timerProgressFill}
                    style={{ width: `${Math.max(0, Math.min(100, (remainingSeconds / (timerState.durationSeconds * timerState.setCount)) * 100))}%` }}
                  />
                </div>
                <div className={styles.timerCardActions}>
                  <button type="button" className={styles.secondaryButton} onClick={stopTimer}>停止</button>
                </div>
              </section>
            ) : null}

            <section className={styles.timerSection}>
              <h3>プリセット</h3>
              <div className={styles.timerPresetGrid}>
                {DEFAULT_TIMER_PRESETS.map((preset) => (
                  <div key={preset.id} className={styles.timerPresetCard}>
                    <button
                      type="button"
                      className={styles.timerPresetButton}
                      onClick={() => startTimer(preset)}
                    >
                      <span className={styles.timerPresetBadge}>標準</span>
                      <span className={styles.timerPresetLabel}>{preset.label}</span>
                      <span className={styles.timerPresetDescription}>{preset.description}</span>
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {statusMessage ? <p className={styles.timerStatus}>{statusMessage}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}