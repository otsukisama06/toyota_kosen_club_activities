"use client";

import { useState } from "react";
import styles from "./admin-dashboard.module.css";

export function AttendanceRateResetButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (isSubmitting) {
      event.preventDefault();
      return;
    }

    const confirmed = window.confirm("出席率の計算開始日を本日にリセットします。\n本当にリセットしていいですか？");
    if (!confirmed) {
      event.preventDefault();
      return;
    }

    setIsSubmitting(true);
  }

  return (
    <form action="/api/members" method="post" onSubmit={handleSubmit} className={styles.inlineForm}>
      <input type="hidden" name="intent" value="reset-attendance-rate" />
      <button type="submit" className={styles.dangerButton} disabled={isSubmitting}>
        {isSubmitting ? "リセット中..." : "出席率リセット（本日から再計算）"}
      </button>
    </form>
  );
}
