import { redirect } from "next/navigation";
import { nowInJst, toDateKey } from "@/lib/date-format";

// ビルド時の日付で固定されないよう、アクセスのたびに今日の日付を計算します。
export const dynamic = "force-dynamic";

export default function TodayTableTennisNotePage() {
  const todayKey = toDateKey(nowInJst());
  redirect(`/table-tennis-notes/${todayKey}`);
}
