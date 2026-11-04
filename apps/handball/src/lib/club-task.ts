import { getJstDayRangeFromDateKey, nowInJst, toDateKey } from "@/lib/date-format";
import { prisma } from "@/lib/prisma";

// 締め切り日の翌日以降かつ完了済みのタスクを自動削除します。
export async function cleanupCompletedExpiredClubTasks(): Promise<number> {
  const todayKey = toDateKey(nowInJst());
  const { startUtc: todayStartUtc } = getJstDayRangeFromDateKey(todayKey);

  if (Number.isNaN(todayStartUtc.getTime())) {
    return 0;
  }

  const result = await prisma.clubTask.deleteMany({
    where: {
      isCompleted: true,
      deadlineOn: {
        lt: todayStartUtc,
      },
    },
  });

  return result.count;
}