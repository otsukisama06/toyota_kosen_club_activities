import { toDateKey } from "@/lib/date-format";

type AttendanceRateEventType = "PRACTICE" | "MATCH";

function isAttendanceRateEventType(eventType: string): eventType is AttendanceRateEventType {
  return eventType === "PRACTICE" || eventType === "MATCH";
}

export function shouldCountForAttendanceRate(eventType: string, scheduledAt: Date, attendanceRateStartAt: Date): boolean {
  if (!isAttendanceRateEventType(eventType)) {
    return false;
  }

  // 出席率は「投票日時」ではなく「イベント開催日」を基準に集計します。
  return toDateKey(scheduledAt) >= toDateKey(attendanceRateStartAt);
}
