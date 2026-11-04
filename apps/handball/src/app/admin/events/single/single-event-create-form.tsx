"use client";

import { useState } from "react";
import { AttendanceEventType } from "@prisma/client";
import { getDefaultEventTimesForDateKey } from "@/lib/event-default-times";
import styles from "../events-management.module.css";

type SingleEventCreateFormProps = {
  defaultDate: string;
  defaultStartTime: string;
  defaultEndTime: string;
};

export function SingleEventCreateForm({
  defaultDate,
  defaultStartTime,
  defaultEndTime,
}: SingleEventCreateFormProps) {
  const [eventType, setEventType] = useState<AttendanceEventType>(AttendanceEventType.PRACTICE);
  const [eventDate, setEventDate] = useState(defaultDate);
  const [eventTime, setEventTime] = useState(defaultStartTime);
  const [eventEndTime, setEventEndTime] = useState(defaultEndTime);

  function handleDateChange(nextDate: string) {
    setEventDate(nextDate);
    const nextDefaults = getDefaultEventTimesForDateKey(nextDate);
    setEventTime(nextDefaults.startTime);
    setEventEndTime(nextDefaults.endTime);
  }

  return (
    <form action="/api/events" method="post" className={styles.form}>
      <input type="hidden" name="redirectTo" value="/admin/events/single" />
      <label>
        種別
        <select
          name="eventType"
          value={eventType}
          onChange={(event) => setEventType(event.currentTarget.value as AttendanceEventType)}
        >
          <option value={AttendanceEventType.PRACTICE}>練習</option>
          <option value={AttendanceEventType.MATCH}>試合</option>
        </select>
      </label>
      <label>
        日付
        <input
          type="date"
          name="eventDate"
          value={eventDate}
          onChange={(event) => handleDateChange(event.currentTarget.value)}
          required
        />
      </label>
      <label>
        時刻 (5分単位)
        <input
          type="time"
          name="eventTime"
          step={300}
          value={eventTime}
          onChange={(event) => setEventTime(event.currentTarget.value)}
          required
        />
      </label>
      <label>
        終了時刻 (任意・5分単位)
        <input
          type="time"
          name="eventEndTime"
          step={300}
          value={eventEndTime}
          onChange={(event) => setEventEndTime(event.currentTarget.value)}
        />
      </label>
      {eventType === AttendanceEventType.MATCH ? (
        <>
          <label>
            試合名 (試合の場合)
            <input type="text" name="matchOpponent" placeholder="例: 豊田北高校" />
          </label>
          <label>
            試合詳細 (試合の場合)
            <textarea name="matchDetail" rows={2} placeholder="例: 会場、集合時刻、ユニフォーム情報" />
          </label>
        </>
      ) : null}
      <label>
        補足
        <textarea name="note" rows={2} />
      </label>
      <button type="submit">単体予定を作成</button>
    </form>
  );
}
