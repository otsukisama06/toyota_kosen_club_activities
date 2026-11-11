"use client";

import { FormEvent, useMemo, useState } from "react";
import type { BroadcastTarget, ConsoleMember } from "@/lib/super-admin";
import styles from "../super-admin.module.css";

type BroadcastFormProps = {
  members: ConsoleMember[];
  roleLabels: Record<string, string>;
  initialSubject: string;
  initialBody: string;
  initialTarget: BroadcastTarget;
  adminEmail: string | null;
  emailEnabled: boolean;
};

const TARGET_OPTIONS: { value: BroadcastTarget; label: string }[] = [
  { value: "all", label: "全部員" },
  { value: "roles", label: "役職で指定" },
  { value: "grades", label: "学年で指定" },
  { value: "no-password", label: "パスワード未設定の部員" },
  { value: "selected", label: "個別に選択" },
];

export function BroadcastForm({
  members,
  roleLabels,
  initialSubject,
  initialBody,
  initialTarget,
  adminEmail,
  emailEnabled,
}: BroadcastFormProps) {
  const [target, setTarget] = useState<BroadcastTarget>(initialTarget);
  const [roles, setRoles] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [confirmed, setConfirmed] = useState(false);

  const gradeOptions = useMemo(
    () => Array.from(new Set(members.map((member) => member.grade || ""))).sort(),
    [members],
  );
  const roleOptions = useMemo(
    () => Object.keys(roleLabels).filter((role) => members.some((member) => member.role === role)),
    [members, roleLabels],
  );

  const recipients = useMemo(
    () =>
      members.filter((member) => {
        if (!member.hasEmail) return false;
        if (target === "all") return true;
        if (target === "roles") return roles.includes(member.role);
        if (target === "grades") return grades.includes(member.grade || "");
        if (target === "no-password") return !member.hasPassword;
        return memberIds.includes(member.id);
      }),
    [members, target, roles, grades, memberIds],
  );
  const withoutEmailCount = members.filter((member) => !member.hasEmail).length;

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (recipients.length === 0) {
      event.preventDefault();
      window.alert("送信対象の部員がいません。");
      return;
    }
    if (!window.confirm(`${recipients.length} 名にメールを送信します。よろしいですか？`)) {
      event.preventDefault();
    }
  }

  const previewName = recipients[0]?.nickname || "部員名";

  return (
    <form action="/api/super-admin/broadcast" method="post" className={styles.form} onSubmit={onSubmit}>
      <fieldset className={styles.fieldset}>
        <legend>送信対象</legend>
        <div className={styles.radioRow}>
          {TARGET_OPTIONS.map((option) => (
            <label key={option.value} className={styles.inlineLabel}>
              <input
                type="radio"
                name="target"
                value={option.value}
                checked={target === option.value}
                onChange={() => setTarget(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>

        {target === "roles" ? (
          <div className={styles.checkboxRow}>
            {roleOptions.map((role) => (
              <label key={role} className={styles.inlineLabel}>
                <input
                  type="checkbox"
                  name="roles"
                  value={role}
                  checked={roles.includes(role)}
                  onChange={() => toggle(roles, role, setRoles)}
                />
                {roleLabels[role]}
              </label>
            ))}
          </div>
        ) : null}

        {target === "grades" ? (
          <div className={styles.checkboxRow}>
            {gradeOptions.map((grade) => (
              <label key={grade || "none"} className={styles.inlineLabel}>
                <input
                  type="checkbox"
                  name="grades"
                  value={grade}
                  checked={grades.includes(grade)}
                  onChange={() => toggle(grades, grade, setGrades)}
                />
                {grade || "学年未設定"}
              </label>
            ))}
          </div>
        ) : null}

        {target === "selected" ? (
          <>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.smallButton}
                onClick={() => setMemberIds(members.filter((member) => member.hasEmail).map((member) => member.id))}
              >
                全員選択
              </button>
              <button type="button" className={styles.smallButton} onClick={() => setMemberIds([])}>
                選択解除
              </button>
            </div>
            <div className={styles.memberPicker}>
              {members.map((member) => (
                <label key={member.id} className={styles.inlineLabel} title={member.hasEmail ? "" : "メール未登録"}>
                  <input
                    type="checkbox"
                    name="memberIds"
                    value={member.id}
                    disabled={!member.hasEmail}
                    checked={memberIds.includes(member.id)}
                    onChange={() => toggle(memberIds, member.id, setMemberIds)}
                  />
                  {member.nickname}
                  {member.grade ? `（${member.grade}）` : ""}
                  {!member.hasEmail ? " ※メール未登録" : ""}
                </label>
              ))}
            </div>
          </>
        ) : null}

        <p className={styles.recipientSummary}>送信対象: {recipients.length} 名</p>
        {withoutEmailCount > 0 ? (
          <p className={styles.meta}>メールアドレス未登録の部員 {withoutEmailCount} 名には送信されません。</p>
        ) : null}
      </fieldset>

      <label>
        件名
        <input
          type="text"
          name="subject"
          maxLength={200}
          required
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="例: 【連絡】来週の練習について"
        />
      </label>
      <label>
        本文
        <textarea
          name="body"
          rows={10}
          maxLength={5000}
          required
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="本文を入力してください。{nickname} と書くと宛先ごとのニックネームに置き換わります。"
        />
      </label>
      <p className={styles.meta}>
        {"{nickname}"} は宛先ごとのニックネームに置き換わります。本文の末尾には「管理者から一斉送信しています」という一文が自動で付きます。
      </p>

      {body ? (
        <div>
          <p className={styles.meta}>プレビュー（{previewName} さん宛て）</p>
          <div className={styles.preview}>{body.replaceAll("{nickname}", previewName)}</div>
        </div>
      ) : null}

      <label className={styles.inlineLabel}>
        <input type="checkbox" name="sendCopyToSelf" value="1" disabled={!adminEmail} />
        自分（admin）にも控えを送る{adminEmail ? "" : "（admin のメールアドレスが未登録です）"}
      </label>
      <label className={styles.inlineLabel}>
        <input
          type="checkbox"
          name="confirmSend"
          value="1"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        宛先と内容を確認しました（送信後は取り消せません）
      </label>

      {!emailEnabled ? (
        <p className={styles.warning}>メール送信が未設定のため、本番環境では送信できません。</p>
      ) : null}

      <div className={styles.actions}>
        <button type="submit" className={styles.primaryButton} disabled={!confirmed || recipients.length === 0}>
          {recipients.length} 名に送信する
        </button>
      </div>
    </form>
  );
}
