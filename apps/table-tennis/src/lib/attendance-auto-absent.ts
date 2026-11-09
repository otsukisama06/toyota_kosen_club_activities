import { AttendanceEventType, AttendanceStatus } from "@prisma/client";
import { createJstDate, getJstDateParts, nowInJst } from "@/lib/date-format";
import { prisma } from "@/lib/prisma";

// 前日までの未回答イベントを全員分まとめて出席にします。
export async function autoMarkPreviousDayUnansweredAsAbsent(_triggerMemberId?: string) {
  const now = nowInJst();
  const todayParts = getJstDateParts(now);
  const todayStartUtc = createJstDate(todayParts.year, todayParts.month - 1, todayParts.day);

  const previousEvents = await prisma.attendanceEvent.findMany({
    where: {
      eventType: {
        in: [AttendanceEventType.PRACTICE, AttendanceEventType.MATCH],
      },
      scheduledAt: {
        lt: todayStartUtc,
      },
    },
    select: {
      id: true,
      scheduledAt: true,
    },
  });

  if (previousEvents.length === 0) {
    return;
  }

  const eventIds = previousEvents.map((event) => event.id);

  const members = await prisma.member.findMany({
    select: { id: true, createdAt: true },
  });

  if (members.length === 0) {
    return;
  }

  const existingRecords = await prisma.attendanceRecord.findMany({
    where: {
      eventId: {
        in: eventIds,
      },
    },
    select: {
      memberId: true,
      eventId: true,
      status: true,
    },
  });

  const existingKeySet = new Set(existingRecords.map((record) => `${record.memberId}:${record.eventId}`));
  const missingRecords: Array<{ memberId: string; eventId: string; status: AttendanceStatus; submittedAt: Date }> = [];

  for (const m of members) {
    for (const event of previousEvents) {
      // 入部（登録）前のイベントは対象外にします。
      if (event.scheduledAt < m.createdAt) {
        continue;
      }
      const eventId = event.id;
      const key = `${m.id}:${eventId}`;
      if (!existingKeySet.has(key)) {
        missingRecords.push({
          memberId: m.id,
          eventId,
          status: AttendanceStatus.ATTEND,
          submittedAt: now,
        });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.attendanceRecord.updateMany({
      where: {
        eventId: {
          in: eventIds,
        },
        status: AttendanceStatus.UNKNOWN,
      },
      data: {
        status: AttendanceStatus.ATTEND,
        submittedAt: now,
      },
    });

    if (missingRecords.length > 0) {
      // 同時アクセスで同じレコードを作ろうとしても一意制約エラーにならないようにします。
      await tx.attendanceRecord.createMany({
        data: missingRecords,
        skipDuplicates: true,
      });
    }
  });
}