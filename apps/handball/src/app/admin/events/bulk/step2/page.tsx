"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WEEKDAY_DEFAULT_TIME_ROWS } from "@/lib/event-default-times";
import styles from "../../events-management.module.css";

// Prismaクライアントに依存しないようにローカルで列挙体を定義
type AttendanceEventType = "PRACTICE" | "MATCH";

const AttendanceEventType = {
  PRACTICE: "PRACTICE" as const,
  MATCH: "MATCH" as const,
} as const;

type WeekdayKey = (typeof WEEKDAY_DEFAULT_TIME_ROWS)[number]["key"];

type WeekdaySetting = {
  startTime: string;
  endTime: string;
};

function getDefaultWeekdaySettingsForDate(selectedDate: string): Record<WeekdayKey, WeekdaySetting> {
  // 選択した日付の曜日を計算
  const [yearText, monthText, dayText] = selectedDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const date = new Date(year, month, day);
  const weekday = date.getDay();

  // 曜日に合わせたデフォルト値を取得
  const weekdayKeys: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const currentWeekday = weekdayKeys[weekday];
  const currentRow = WEEKDAY_DEFAULT_TIME_ROWS.find(r => r.key === currentWeekday);

  // 全曜日の設定を初期化
  const settings: Record<WeekdayKey, WeekdaySetting> = {
    sun: { startTime: "09:15", endTime: "13:00" },
    mon: { startTime: "15:15", endTime: "18:00" },
    tue: { startTime: "16:30", endTime: "18:30" },
    wed: { startTime: "15:55", endTime: "18:30" },
    thu: { startTime: "16:30", endTime: "18:30" },
    fri: { startTime: "15:15", endTime: "18:00" },
    sat: { startTime: "09:15", endTime: "13:00" },
  };

  // 選択した日付の曜日のみデフォルト値を設定（他は空にする）
  // 実際には全曜日表示するので、全曜日にデフォルト値を設定
  if (currentRow) {
    settings[currentWeekday] = { startTime: currentRow.startTime, endTime: currentRow.endTime };
  }

  return settings;
}

export default function BulkStep2Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const datesParam = searchParams.get("dates");
  const eventTypeParam = searchParams.get("eventType");

  // グローバルナビゲーションローディングを無効化（ページ遷移エラーによる無限ローディング防止）
  useEffect(() => {
    document.body.dataset.disableGlobalNavLoading = "true";
    return () => {
      document.body.dataset.disableGlobalNavLoading = "false";
    };
  }, []);

  const selectedDates = useMemo(() => {
    if (!datesParam) return [];
    return datesParam.split(",").filter((d: string) => d).sort();
  }, [datesParam]);

  const eventType = useMemo(() => {
    if (!eventTypeParam) return AttendanceEventType.PRACTICE;
    return eventTypeParam as AttendanceEventType;
  }, [eventTypeParam]);

  // 選択した日付の曜日に合わせた初期設定を計算
  const initialWeekdaySettings = useMemo(() => {
    if (selectedDates.length === 0) {
      return getDefaultWeekdaySettingsForDate("2024-01-01"); // デフォルト（日曜日）
    }
    return getDefaultWeekdaySettingsForDate(selectedDates[0]);
  }, [selectedDates]);

  const [weekdaySettings, setWeekdaySettings] = useState<Record<WeekdayKey, WeekdaySetting>>(initialWeekdaySettings);

  const [matchOpponent, setMatchOpponent] = useState("");
  const [matchDetail, setMatchDetail] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleBack() {
    const params = new URLSearchParams();
    params.set("dates", selectedDates.join(","));
    params.set("eventType", eventType);
    router.push(`/admin/events/bulk?${params.toString()}`);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedDates.length === 0 || isSubmitting) return;

    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    // 曜日設定をFormDataに追加
    for (const row of WEEKDAY_DEFAULT_TIME_ROWS) {
      const setting = weekdaySettings[row.key];
      formData.set(`${row.key}StartTime`, setting.startTime);
      formData.set(`${row.key}EndTime`, setting.endTime);
    }

    try {
      const response = await fetch("/api/events/bulk/defaults", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        router.push("/admin/events");
      } else {
        const errorText = await response.text();
        console.error("Server error:", errorText);
        alert("エラーが発生しました。もう一度お試しください。");
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error("Submit error:", error);
      alert("ネットワークエラーが発生しました。");
      setIsSubmitting(false);
    }
  }

  if (selectedDates.length === 0) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>複数予定作成</h1>
        </header>
        <section className={styles.card}>
          <p>日付が選択されていません。最初に日付を選択してください。</p>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => router.push("/admin/events/bulk")}
          >
            日付選択へ戻る
          </button>
        </section>
      </div>
    );
  }

  // 選択した日付の曜日を計算（useMemoで最適化）
  const selectedWeekday = useMemo(() => {
    if (selectedDates.length === 0) return 0;
    const [yearText, monthText, dayText] = selectedDates[0].split("-");
    const year = Number(yearText);
    const month = Number(monthText) - 1;
    const day = Number(dayText);
    return new Date(year, month, day).getDay();
  }, [selectedDates]);

  const weekdayKeyMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>複数予定作成 - 時刻設定</h1>
        <p>選択した日付の曜日に応じて、開始・終了時刻を設定してください。</p>
        <div className={styles.topLinks}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleBack}
          >
            ← 日付選択へ戻る
          </button>
        </div>
      </header>

      <section className={styles.card}>
        <p className={styles.meta}>選択した日付: {selectedDates.join(", ")}</p>
        <p className={styles.meta}>種別: {eventType === AttendanceEventType.PRACTICE ? "練習" : "試合"}</p>

        <form onSubmit={handleSubmit}>
          <input type="hidden" name="eventDates" value={selectedDates.join(",")} />
          <input type="hidden" name="eventType" value={eventType} />
          <input type="hidden" name="redirectTo" value="/admin/events" />

          <div className={styles.weekdayTemplateWrap}>
            <table className={styles.weekdayTemplateTable}>
              <thead>
                <tr>
                  <th>曜日</th>
                  <th>開始時刻</th>
                  <th>終了時刻 (任意)</th>
                  <th>部活なし</th>
                </tr>
              </thead>
              <tbody>
                {WEEKDAY_DEFAULT_TIME_ROWS.map((row) => {
                  const currentSetting = weekdaySettings[row.key];
                  const isCurrentWeekday = weekdayKeyMap[selectedWeekday] === row.key;

                  return (
                    <tr key={row.key} style={{ backgroundColor: isCurrentWeekday ? "#f0f7ff" : undefined }}>
                      <td>
                        {row.label}
                        {isCurrentWeekday && " ← 選択日"}
                      </td>
                      <td>
                        <input
                          type="time"
                          value={currentSetting.startTime}
                          onChange={(event) => {
                            const target = event.target;
                            if (target.value !== currentSetting.startTime) {
                              setWeekdaySettings((current) => ({
                                ...current,
                                [row.key]: {
                                  ...current[row.key],
                                  startTime: target.value,
                                },
                              }));
                            }
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="time"
                          value={currentSetting.endTime}
                          onChange={(event) => {
                            const target = event.target;
                            if (target.value !== currentSetting.endTime) {
                              setWeekdaySettings((current) => ({
                                ...current,
                                [row.key]: {
                                  ...current[row.key],
                                  endTime: target.value,
                                },
                              }));
                            }
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={!currentSetting.startTime && !currentSetting.endTime}
                          onChange={(event) => {
                            if (event.currentTarget.checked) {
                              setWeekdaySettings((current) => ({
                                ...current,
                                [row.key]: { startTime: "", endTime: "" },
                              }));
                            } else {
                              setWeekdaySettings((current) => ({
                                ...current,
                                [row.key]: { startTime: row.startTime, endTime: row.endTime },
                              }));
                            }
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {eventType === AttendanceEventType.MATCH && (
            <>
              <div className={styles.formGroup}>
                <label>
                  対戦相手
                  <input
                    type="text"
                    name="matchOpponent"
                    value={matchOpponent}
                    onChange={(event) => setMatchOpponent(event.currentTarget.value)}
                    placeholder="例: 豊田北高校"
                  />
                </label>
              </div>

              <div className={styles.formGroup}>
                <label>
                  試合詳細
                  <textarea
                    name="matchDetail"
                    value={matchDetail}
                    onChange={(event) => setMatchDetail(event.currentTarget.value)}
                    rows={2}
                    placeholder="例: 会場、集合時刻、ユニフォーム情報"
                  />
                </label>
              </div>
            </>
          )}

          <div className={styles.formGroup}>
            <label>
              補足
              <textarea
                name="note"
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
                rows={2}
              />
            </label>
          </div>

          <div className={styles.inlineRow}>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? "作成中..." : "予定を作成する"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleBack}
            >
              日付選択へ戻る
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}