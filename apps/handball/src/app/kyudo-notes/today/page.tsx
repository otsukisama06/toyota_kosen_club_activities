import { redirect } from "next/navigation";
import { nowInJst, toDateKey } from "@/lib/date-format";

export default function TodayKyudoNotePage() {
  const todayKey = toDateKey(nowInJst());
  redirect(`/kyudo-notes/${todayKey}`);
}
