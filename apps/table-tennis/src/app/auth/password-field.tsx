"use client";

import { useState } from "react";
import styles from "./auth.module.css";

type PasswordFieldProps = {
  name?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
};

export function PasswordField({
  name = "password",
  placeholder = "パスワード",
  required = true,
  autoComplete = "current-password",
  minLength,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className={styles.passwordFieldRow}>
      <input
        name={name}
        type={isVisible ? "text" : "password"}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={128}
      />
      <button
        type="button"
        className={styles.togglePasswordButton}
        onClick={() => setIsVisible((previous) => !previous)}
        aria-label={isVisible ? "パスワードを隠す" : "パスワードを表示する"}
      >
        {isVisible ? "非表示" : "表示"}
      </button>
    </div>
  );
}