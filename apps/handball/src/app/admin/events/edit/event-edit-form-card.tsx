"use client";

import { useState } from "react";
import { AttendanceEventType } from "@prisma/client";
import styles from "../events-management.module.css";

type EventEditFormCardProps = {
  eventId: string;
  defaultEventType: AttendanceEventType;
  defaultEventDate: string;
  defaultEventTime: string;
  defaultEventEndTime: string;
  defaultMatchOpponent: string;
  defaultMatchDetail: string;
  defaultNote: string;
  monthParam: string;
  selectedDateKey: string;
};

export function EventEditFormCard({
  eventId,
  defaultEventType,
  defaultEventDate,
  defaultEventTime,
  defaultEventEndTime,
  defaultMatchOpponent,
  defaultMatchDetail,
  defaultNote,
  monthParam,
  selectedDateKey,
}: EventEditFormCardProps) {
  const [eventType, setEventType] = useState<AttendanceEventType>(defaultEventType);

  return (
    <form action={`/api/events/${eventId}`} method="post" className={styles.card}>
      <input type="hidden" name="intent" value="update" />
      <input type="hidden" name="redirectTo" value={`/admin/events/edit?month=${monthParam}&date=${selectedDateKey}`} />
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
        <input type="date" name="eventDate" defaultValue={defaultEventDate} required />
      </label>
      <label>
        時刻 (5分単位)
        <input type="time" name="eventTime" step={300} defaultValue={defaultEventTime} required />
      </label>
      <label>
        終了時刻 (任意・5分単位)
        <input type="time" name="eventEndTime" step={300} defaultValue={defaultEventEndTime} />
      </label>
      {eventType === AttendanceEventType.MATCH ? (
        <>
          <label>
            対戦相手 (試合の場合)
            <input type="text" name="matchOpponent" defaultValue={defaultMatchOpponent} />
          </label>
          <label>
            試合詳細 (試合の場合)
            <textarea name="matchDetail" rows={2} defaultValue={defaultMatchDetail} />
          </label>
        </>
      ) : null}
      <label>
        メモ
        <textarea name="note" rows={2} defaultValue={defaultNote} />
      </label>
      <button type="submit">変更を保存</button>
    </form>
  );
}
