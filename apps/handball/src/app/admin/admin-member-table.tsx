"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./admin-dashboard.module.css";

interface Member {
  id: string;
  name: string;
  nickname: string | null;
  grade: string | null;
  role: "PLAYER" | "MANAGER" | "COACH" | "ADMIN";
}

interface AdminMemberTableProps {
  members: Member[];
  canManageRoles: boolean;
}

// クライアント側でのスーパーアドミンニックネーム判定
function isSuperAdminNickname(nickname: string | null): boolean {
  if (!nickname) return false;
  return nickname === "admin";
}

export function AdminMemberTable({ members, canManageRoles }: AdminMemberTableProps) {
  const [roleState, setRoleState] = useState<Map<string, "PLAYER" | "MANAGER" | "COACH" | "ADMIN">>(
    new Map(
      members.map((m) => [m.id, isSuperAdminNickname(m.nickname) ? "ADMIN" : m.role])
    )
  );

  const handleRoleChange = (
    memberId: string,
    currentValue: "PLAYER" | "MANAGER" | "COACH" | "ADMIN",
    nextValue: "PLAYER" | "MANAGER" | "COACH" | "ADMIN",
    memberNickname: string | null
  ) => {
    if (memberNickname && isSuperAdminNickname(memberNickname)) {
      return;
    }

    if (!canManageRoles) {
      alert("役職変更は admin ユーザーのみ可能です");
      return;
    }

    setRoleState((prev) => new Map(prev).set(memberId, nextValue));

    (async () => {
      try {
        const formData = new FormData();
        formData.append("intent", "update-role");
        formData.append("role", nextValue);

        const response = await fetch(`/api/members/${memberId}`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          setRoleState((prev) => new Map(prev).set(memberId, currentValue));
          const errorData = await response.json().catch(() => ({}));
          alert(errorData.error || "役職変更に失敗しました");
        }
      } catch (error) {
        setRoleState((prev) => new Map(prev).set(memberId, currentValue));
        console.error("Error updating role:", error);
        alert("通信エラーが発生しました");
      }
    })();
  };

  return (
    <div className={styles.memberTableWrap}>
      <table className={styles.memberTable}>
        <thead>
          <tr>
            <th>ニックネーム</th>
            <th>学年</th>
            <th>役職</th>
            <th>アクション</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const currentRole = isSuperAdminNickname(member.nickname)
              ? "ADMIN"
              : (roleState.get(member.id) ?? member.role);

            return (
              <tr key={member.id}>
                <td>
                  <Link className={styles.memberLink} href={`/admin/members/${member.id}`}>
                    {member.nickname || member.name}
                  </Link>
                </td>
                <td>{member.grade || "-"}</td>
                <td>
                  <select
                    className={styles.tableSelect}
                    value={currentRole}
                    disabled={!canManageRoles || isSuperAdminNickname(member.nickname || "")}
                    onChange={(event) =>
                      handleRoleChange(
                        member.id,
                        currentRole,
                        event.target.value as "PLAYER" | "MANAGER" | "COACH" | "ADMIN",
                        member.nickname
                      )
                    }
                  >
                    <option value="PLAYER">プレイヤー</option>
                    <option value="MANAGER">マネージャー（管理画面可）</option>
                    <option value="COACH">コーチ（管理画面可）</option>
                    <option value="ADMIN">管理者（管理画面可）</option>
                  </select>
                </td>
                <td>
                  <Link className={styles.tableLinkButton} href={`/admin/members/${member.id}`}>
                    詳細
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
