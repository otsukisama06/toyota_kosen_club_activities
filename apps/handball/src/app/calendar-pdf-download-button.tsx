"use client";

import { useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import styles from "./calendar-pdf-download-button.module.css";

type CalendarPdfRow = {
  dateKey: string;
  weekdayLabel: string;
  weekdayIndex: number;
  isHoliday: boolean;
  hasActivity: boolean;
  schedules: string[];
  supplements: string[];
};

type CalendarPdfDownloadButtonProps = {
  monthLabel: string;
  monthParam: string;
  rows: CalendarPdfRow[];
  className?: string;
};

function joinClassNames(...names: Array<string | undefined>): string {
  return names.filter(Boolean).join(" ");
}

export function CalendarPdfDownloadButton({
  monthLabel,
  monthParam,
  rows,
  className,
}: CalendarPdfDownloadButtonProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const rowsWithDetails = useMemo(() => rows.filter((row) => row.supplements.length > 0), [rows]);
  const calendarCells = useMemo(() => {
    const rowByDateKey = new Map(rows.map((row) => [row.dateKey, row]));
    const [yearText, monthText] = monthParam.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return [] as Array<{
        key: string;
        inMonth: boolean;
        day: number;
        weekdayIndex: number;
        row?: CalendarPdfRow;
      }>;
    }

    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    return Array.from({ length: 42 }, (_, index) => {
      const day = index - firstWeekday + 1;
      const weekdayIndex = index % 7;
      if (day < 1 || day > daysInMonth) {
        return {
          key: `outside-${index}`,
          inMonth: false,
          day,
          weekdayIndex,
        };
      }

      const dateKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return {
        key: dateKey,
        inMonth: true,
        day,
        weekdayIndex,
        row: rowByDateKey.get(dateKey),
      };
    });
  }, [monthParam, rows]);

  const todayText = useMemo(() => {
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }, []);

  async function handleDownload() {
    if (isExporting || !reportRef.current) {
      return;
    }

    setIsExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;
      const renderWidth = maxWidth;
      const renderHeight = (canvas.height * renderWidth) / canvas.width;
      let heightLeft = renderHeight;
      let positionY = margin;

      pdf.addImage(imageData, "PNG", margin, positionY, renderWidth, renderHeight);
      heightLeft -= maxHeight;

      while (heightLeft > 0) {
        pdf.addPage();
        positionY = margin - (renderHeight - heightLeft);
        pdf.addImage(imageData, "PNG", margin, positionY, renderWidth, renderHeight);
        heightLeft -= maxHeight;
      }

      pdf.save(`kyudo-calendar-${monthParam}.pdf`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={joinClassNames(styles.downloadButton, className)}
        onClick={handleDownload}
        disabled={isExporting}
      >
        {isExporting ? "PDF作成中..." : "カレンダーを保存"}
      </button>

      <div className={styles.offscreen} aria-hidden="true">
        <div ref={reportRef} className={styles.report}>
          <header className={styles.reportHeader}>
            <h1>{monthLabel} カレンダー</h1>
            <p>作成日: {todayText}</p>
          </header>

          <p className={styles.reportSubTitle}>月間カレンダー</p>
          <div className={styles.legendRow}>
            <span className={joinClassNames(styles.legendItem, styles.legendHoliday)}>日曜・祝日</span>
            <span className={joinClassNames(styles.legendItem, styles.legendSaturday)}>土曜</span>
            <span className={joinClassNames(styles.legendItem, styles.legendActivity)}>予定あり</span>
            <span className={joinClassNames(styles.legendItem, styles.legendNoActivity)}>部活なし</span>
            <span className={joinClassNames(styles.legendItem, styles.legendDetail)}>詳細あり</span>
          </div>

          <div className={styles.weekdayHeader}>
            {["日", "月", "火", "水", "木", "金", "土"].map((dayLabel, index) => (
              <span
                key={dayLabel}
                className={joinClassNames(
                  styles.weekdayCell,
                  index === 0 ? styles.weekdayHoliday : "",
                  index === 6 ? styles.weekdaySaturday : "",
                )}
              >
                {dayLabel}
              </span>
            ))}
          </div>

          <div className={styles.calendarGrid}>
            {calendarCells.map((cell) => {
              if (!cell.inMonth) {
                return <div key={cell.key} className={joinClassNames(styles.calendarCell, styles.outsideCell)} />;
              }

              const row = cell.row;
              const isSunday = cell.weekdayIndex === 0;
              const isSaturday = cell.weekdayIndex === 6;
              const isHoliday = row?.isHoliday ?? false;
              const hasActivity = row?.hasActivity ?? false;
              const scheduleTexts = row?.schedules ?? [];
              const isDetailDay = (row?.supplements.length ?? 0) > 0;

              return (
                <div
                  key={cell.key}
                  className={joinClassNames(
                    styles.calendarCell,
                    hasActivity ? styles.calendarCellActivity : styles.calendarCellNoActivity,
                    isDetailDay ? styles.calendarCellDetail : "",
                    (isSunday || isHoliday) ? styles.calendarCellHoliday : "",
                    isSaturday ? styles.calendarCellSaturday : "",
                  )}
                >
                  <div className={styles.calendarCellTop}>
                    <span className={styles.dayNumber}>{cell.day}</span>
                    <div className={styles.calendarCellTagRow}>
                      {isDetailDay ? <span className={styles.detailTag}>詳細</span> : null}
                      {isHoliday ? <span className={styles.smallTag}>祝日</span> : null}
                    </div>
                  </div>
                  <div className={styles.calendarCellBottom}>
                    {scheduleTexts.length > 0 ? (
                      <div className={styles.scheduleTextList}>
                        {scheduleTexts.map((text, index) => (
                          <span key={`${cell.key}-schedule-${index}`} className={styles.scheduleText}>
                            {text}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {!hasActivity ? <span className={styles.noActivityText}>部活なし</span> : null}
                    {isDetailDay ? <span className={styles.detailCountText}>詳細 {row?.supplements.length ?? 0}件</span> : null}
                  </div>
                </div>
              );
            })}
          </div>

          <p className={styles.reportSubTitle}>日付ごとの詳細情報</p>
          {rowsWithDetails.length > 0 ? (
            <table className={styles.detailTable}>
              <thead>
                <tr>
                  <th className={styles.detailTableHead}>日付</th>
                  <th className={styles.detailTableHead}>予定・時刻</th>
                  <th className={styles.detailTableHead}>詳細</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithDetails.map((row) => {
                  const isSunday = row.weekdayIndex === 0;
                  const isSaturday = row.weekdayIndex === 6;

                  return (
                    <tr
                      key={row.dateKey}
                      className={joinClassNames(
                        styles.detailTableRow,
                        (isSunday || row.isHoliday) ? styles.detailTableRowHoliday : "",
                        isSaturday ? styles.detailTableRowSaturday : "",
                      )}
                    >
                      <td className={styles.detailTableCell}>
                        <div className={styles.detailDateLabel}>{row.dateKey.slice(5).replace("-", "/")} ({row.weekdayLabel})</div>
                      </td>
                      <td className={styles.detailTableCell}>
                        <ul className={styles.detailCellList}>
                          {row.schedules.length > 0 ? (
                            row.schedules.map((item, index) => (
                              <li key={`${row.dateKey}-schedule-${index}`}>{item}</li>
                            ))
                          ) : (
                            <li>予定なし</li>
                          )}
                        </ul>
                      </td>
                      <td className={styles.detailTableCell}>
                        <ul className={styles.detailCellList}>
                          {row.supplements.map((item, index) => (
                            <li key={`${row.dateKey}-supplement-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className={styles.emptyDetailMessage}>詳細情報がある日はありません。</p>
          )}
        </div>
      </div>
    </>
  );
}
