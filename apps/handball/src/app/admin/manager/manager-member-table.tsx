"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "../admin-dashboard.module.css";

type ManagerMemberRow = {
  id: string;
  name: string;
  nickname: string | null;
  grade: string | null;
  role: "PLAYER" | "MANAGER" | "COACH" | "ADMIN";
  attendanceRateStartAt: string;
  yearlyGoal: string | null;
  monthlyGoal: string | null;
  attendanceRate: number | null;
  scoringRate: number | null;
};

type ManagerMemberTableProps = {
  members: ManagerMemberRow[];
};

function roleLabel(role: ManagerMemberRow["role"]): string {
  if (role === "ADMIN") return "管理者";
  if (role === "COACH") return "コーチ";
  if (role === "MANAGER") return "マネージャー";
  return "プレイヤー";
}

export function ManagerMemberTable({ members: initialMembers }: ManagerMemberTableProps) {
  const [members, setMembers] = useState<ManagerMemberRow[]>(initialMembers);
  const [showAttendanceRate, setShowAttendanceRate] = useState(false);
  const [showAttendanceRateStartAt, setShowAttendanceRateStartAt] = useState(false);
  const [showYearlyGoal, setShowYearlyGoal] = useState(false);
  const [showMonthlyGoal, setShowMonthlyGoal] = useState(false);

  // ページロード時に出席率を再計算
  useEffect(() => {
    const fetchAttendanceRates = async () => {
      try {
        const response = await fetch("/api/admin/manager-attendance-rates");
        if (!response.ok) {
          console.error("Failed to fetch attendance rates:", response.statusText);
          return;
        }

        const data = await response.json() as {
          results: Array<{ memberId: string; attendanceRate: number | null }>;
        };

        // 初期データに API で取得した出席率を反映させる
        setMembers((prev) =>
          prev.map((member) => {
            const rateResult = data.results.find((r) => r.memberId === member.id);
            return rateResult
              ? { ...member, attendanceRate: rateResult.attendanceRate }
              : member;
          })
        );
      } catch (error) {
        console.error("Error fetching attendance rates:", error);
      }
    };

    fetchAttendanceRates();
  }, []);

  const colSpan = useMemo(() => {
    let count = 4;
    if (showAttendanceRate) count += 1;
    if (showAttendanceRateStartAt) count += 1;
    if (showYearlyGoal) count += 1;
    if (showMonthlyGoal) count += 1;
    return count;
  }, [showAttendanceRate, showAttendanceRateStartAt, showYearlyGoal, showMonthlyGoal]);

  function formatJstDate(isoString: string): string {
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(isoString));
  }

  return (
    <>
      <div className={styles.managerFilters}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={showAttendanceRate}
            onChange={(event) => setShowAttendanceRate(event.target.checked)}
          />
          <span>出席率</span>
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={showAttendanceRateStartAt}
            onChange={(event) => setShowAttendanceRateStartAt(event.target.checked)}
          />
          <span>出席率計算開始日</span>
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={showYearlyGoal}
            onChange={(event) => setShowYearlyGoal(event.target.checked)}
          />
          <span>一年の目標</span>
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={showMonthlyGoal}
            onChange={(event) => setShowMonthlyGoal(event.target.checked)}
          />
          <span>その月の目標</span>
        </label>
      </div>

      <div className={styles.memberTableWrap}>
        <table className={styles.memberTable}>
          <thead>
            <tr>
              <th>ニックネーム</th>
              <th>学年</th>
              <th>役職</th>
              {showAttendanceRate ? <th>出席率</th> : null}
              {showAttendanceRateStartAt ? <th>出席率計算開始日</th> : null}
              {showYearlyGoal ? <th>一年の目標</th> : null}
              {showMonthlyGoal ? <th>その月の目標</th> : null}
              <th>アクション</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td>
                  <Link className={styles.memberLink} href={`/admin/members/${member.id}`}>
                    {member.nickname || member.name}
                  </Link>
                </td>
                <td>{member.grade || "-"}</td>
                <td>{roleLabel(member.role)}</td>
                {showAttendanceRate ? (
                  <td>
                    {member.attendanceRate == null ? "-" : `${member.attendanceRate.toFixed(1)}%`}
                  </td>
                ) : null}
                {showAttendanceRateStartAt ? <td>{formatJstDate(member.attendanceRateStartAt)}</td> : null}
                {showYearlyGoal ? <td>{member.yearlyGoal || "-"}</td> : null}
                {showMonthlyGoal ? <td>{member.monthlyGoal || "-"}</td> : null}
                <td>
                  <Link className={styles.tableLinkButton} href={`/admin/members/${member.id}`}>
                    詳細
                  </Link>
                </td>
              </tr>
            ))}
            {members.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>部員データがありません。</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
