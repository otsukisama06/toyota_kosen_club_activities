export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const [attendanceReminderScheduler, dailyAdminStatusScheduler, taskDeadlineReminderScheduler] = await Promise.all([
    import("@/lib/attendance-reminder-scheduler"),
    import("@/lib/admin-daily-status-scheduler"),
    import("@/lib/task-deadline-reminder-scheduler"),
  ]);

  attendanceReminderScheduler.startAttendanceReminderScheduler();
  dailyAdminStatusScheduler.startDailyAdminStatusScheduler();
  taskDeadlineReminderScheduler.startTaskDeadlineReminderScheduler();
}
