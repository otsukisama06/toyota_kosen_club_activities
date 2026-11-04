export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  // 毎朝のラズパイ状態レポートは卓球アプリからのみ送信するため、弓道側では起動しません。
  const [attendanceReminderScheduler, taskDeadlineReminderScheduler] = await Promise.all([
    import("@/lib/attendance-reminder-scheduler"),
    import("@/lib/task-deadline-reminder-scheduler"),
  ]);

  attendanceReminderScheduler.startAttendanceReminderScheduler();
  taskDeadlineReminderScheduler.startTaskDeadlineReminderScheduler();
}
