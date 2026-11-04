type WeightRecordItem = {
  id: string;
  weightKg: number;
  recordedOn: Date;
  note: string | null;
};

type WeightHistoryChartProps = {
  records: WeightRecordItem[];
  graphTitle?: string;
};

export function WeightHistoryChart({ records, graphTitle = "体重推移" }: WeightHistoryChartProps) {
  if (records.length === 0) {
    return <p>体重データがまだありません。</p>;
  }

  return (
    <section>
      <h2>{graphTitle}</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 4px" }}>日付</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 4px" }}>体重(kg)</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 4px" }}>メモ</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 4px" }}>
                {new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(
                  record.recordedOn
                )}
              </td>
              <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 4px" }}>{record.weightKg.toFixed(1)}</td>
              <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 4px" }}>{record.note || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
