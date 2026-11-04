"use client";

import { useState } from "react";
import styles from "@/app/member-page-shared.module.css";

type EventDeleteButtonProps = {
  eventId: string;
  eventLabel: string;
  redirectTo: string;
};

export function EventDeleteButton({ eventId, eventLabel, redirectTo }: EventDeleteButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (isSubmitting) {
      event.preventDefault();
      return;
    }

    const confirmed = window.confirm(`警告: 「${eventLabel}」を削除します。\nこの操作は取り消せません。\n本当に削除しますか？`);
    if (!confirmed) {
      event.preventDefault();
      return;
    }

    setIsSubmitting(true);
  }

  return (
    <form action={`/api/events/${eventId}`} method="post" onSubmit={handleSubmit} className={styles.inlineForm}>
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button type="submit" className={styles.dangerButton} disabled={isSubmitting}>
        {isSubmitting ? "削除中..." : "予定を削除"}
      </button>
    </form>
  );
}
