import { formatDate, toDateKey } from "@/lib/date-format";
import styles from "./home-dashboard.module.css";

type ClubTask = {
  id: string;
  title: string;
  deadlineOn: Date;
  isCompleted: boolean;
  completedAt: Date | null;
  createdBy: { id: string; nickname: string | null } | null;
  createdAt: Date;
};

type ClubTaskBoardProps = {
  tasks: ClubTask[];
  redirectTo: string;
};

function formatTaskStatus(task: ClubTask): string {
  if (task.isCompleted) {
    return task.completedAt ? `完了 (${formatDate(task.completedAt)})` : "完了";
  }
  return "未完了";
}

export function ClubTaskBoard({ tasks, redirectTo }: ClubTaskBoardProps) {
  return (
    <section className={styles.taskCard}>
      <div className={styles.taskHeader}>
        <div>
          <h2>部活タスク</h2>
          <p>管理者権限のあるプレイヤー向けの共有タスクです。</p>
        </div>
      </div>

      <form action="/api/club-tasks" method="post" className={styles.taskCreateForm}>
        <input type="hidden" name="intent" value="create" />
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <label>
          タスク名
          <input type="text" name="title" placeholder="例: 次回大会の連絡を確認する" maxLength={100} required />
        </label>
        <label>
          締め切り日
          <input type="date" name="deadlineOn" defaultValue={toDateKey(new Date())} required />
        </label>
        <label>
          通知期間（締め切り前日数）
          <input
            type="number"
            name="notificationDaysBefore"
            defaultValue="14"
            min="1"
            max="30"
            placeholder="例: 14"
            required
          />
          <span className={styles.taskHelpText}>1〜30日の範囲で指定（デフォルト: 2週間前）</span>
        </label>
        <button type="submit" className={styles.taskPrimaryButton}>タスクを追加</button>
      </form>

      {tasks.length > 0 ? (
        <div className={styles.taskTableWrap}>
          <table className={styles.taskTable}>
            <thead>
              <tr>
                <th>状態</th>
                <th>タスク</th>
                <th>締め切り</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const deadlineKey = toDateKey(task.deadlineOn);
                return (
                  <tr key={task.id} className={task.isCompleted ? styles.taskRowCompleted : ""}>
                    <td data-label="状態">
                      <span className={`${styles.taskStatusPill} ${task.isCompleted ? styles.taskStatusDone : styles.taskStatusTodo}`}>
                        {formatTaskStatus(task)}
                      </span>
                    </td>
                    <td data-label="タスク">
                      <div className={styles.taskTitle}>{task.title}</div>
                      <div className={styles.taskMeta}>
                        {task.createdBy?.nickname ? `作成者: ${task.createdBy.nickname}` : "作成者: 不明"}
                      </div>
                    </td>
                    <td data-label="締め切り">
                      <form action="/api/club-tasks" method="post" className={styles.taskInlineForm}>
                        <input type="hidden" name="intent" value="update-deadline" />
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="redirectTo" value={redirectTo} />
                        <div className={styles.taskDeadlineForm}>
                          <input type="date" name="deadlineOn" defaultValue={deadlineKey} required />
                          <button type="submit" className={styles.taskSecondaryButton}>更新</button>
                        </div>
                      </form>
                    </td>
                    <td data-label="操作">
                      <div className={styles.taskActions}>
                        <form action="/api/club-tasks" method="post" className={styles.taskInlineForm}>
                          <input type="hidden" name="intent" value="toggle-complete" />
                          <input type="hidden" name="taskId" value={task.id} />
                          <input type="hidden" name="redirectTo" value={redirectTo} />
                          <button type="submit" className={styles.taskSecondaryButton}>
                            {task.isCompleted ? "未完了に戻す" : "完了にする"}
                          </button>
                        </form>
                        <form action="/api/club-tasks" method="post" className={styles.taskInlineForm}>
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="taskId" value={task.id} />
                          <input type="hidden" name="redirectTo" value={redirectTo} />
                          <button type="submit" className={styles.taskDangerButton}>削除</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.taskEmptyState}>
          <p>まだタスクがありません。上のフォームから最初のタスクを追加してください。</p>
        </div>
      )}
    </section>
  );
}