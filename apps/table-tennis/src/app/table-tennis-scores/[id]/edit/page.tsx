'use client';

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import styles from "@/app/home-dashboard.module.css";
import { toDateTimeLocalValue } from "@/lib/date-format";

export default function EditTableTennisScorePage() {
  const params = useParams();
  const id = params.id as string;
  
  const [sheet, setSheet] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [matchDate, setMatchDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 勝敗数を計算（データベースのスコアから直接計算）
  const calcSetRecord = (entries: any[]) => {
    let our = 0;
    let their = 0;
    for (const entry of entries) {
      if (entry.ourScore > entry.theirScore) our++;
      else if (entry.ourScore < entry.theirScore) their++;
    }
    return { our, their };
  };

  const setRecord = useMemo(() => calcSetRecord(entries), [entries]);

  useEffect(() => {
    if (!id) return;
    
    (async () => {
      try {
        const res = await fetch(`/api/table-tennis-scores/${id}`);
        if (!res.ok) throw new Error('データ取得に失敗しました');
        const data = await res.json();
        
        // memberデータが未定義の場合のデフォ値
        if (!data.sheet.member) {
          data.sheet.member = { name: "未知の人", nickname: "" };
        }
        
        setSheet(data.sheet);
        
        // 既存のデータにwinnerフィールドがない場合に計算して補完
        const entriesWithWinner = (data.sheet.entries || []).map((entry: any) => {
          if (entry.winner) return entry;
          // winnerがない場合はスコアから計算
          if (entry.ourScore > entry.theirScore) {
            return { ...entry, winner: "OUR" };
          } else if (entry.ourScore < entry.theirScore) {
            return { ...entry, winner: "OPPONENT" };
          }
          return { ...entry, winner: "" };
        });
        
        setEntries(entriesWithWinner);
        
        // DBのUTC日時をJST日付に変換してからdatetime-local形式に
        const utcDate = new Date(data.sheet.matchDate);
        const formattedDate = toDateTimeLocalValue(utcDate);
        setMatchDate(formattedDate);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <main className={styles.page}><p>読み込み中...</p></main>;
  if (error) return <main className={styles.page}><p className={styles.error}>エラー: {error}</p></main>;
  if (!sheet) return <main className={styles.page}><p>データが見つかりません</p></main>;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>試合結果を編集</h1>
        <p>以下の項目を編集して提出してください。</p>
      </header>

      <nav className={styles.nav}>
        <Link href={`/table-tennis-scores/${sheet.id}`} className={styles.secondaryLink}>詳細ページに戻る</Link>
        <Link href="/table-tennis-scores" className={styles.secondaryLink}>試合結果一覧へ戻る</Link>
      </nav>

      <section className={styles.grid}>
        <article className={styles.card}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            
            const res = await fetch(`/api/table-tennis-scores/${sheet.id}/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sheetId: sheet.id,
                opponent: (e.currentTarget.elements.namedItem('opponent') as HTMLInputElement).value,
                matchDate: matchDate,  // datetime-local値（JST）
                comment: (e.currentTarget.elements.namedItem('comment') as HTMLTextAreaElement).value,
                entries,
              }),
            });
            
            if (res.ok) {
              window.location.href = '/table-tennis-scores';
            } else {
              const data = await res.json();
              alert(data.error || '更新に失敗しました');
            }
          }}>
            <div className={styles.formGroup}>
              <label className={styles.label}>対戦相手</label>
              <input
                type="text"
                className={styles.input}
                name="opponent"
                defaultValue={sheet.opponent}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>試合日時</label>
              <input
                type="datetime-local"
                className={styles.input}
                name="matchDate"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>コメント</label>
              <textarea
                className={styles.textarea}
                name="comment"
                rows={3}
              >{sheet.comment}</textarea>
            </div>

             <h3 className={styles.sectionTitle}>各セットのスコア</h3>

             {/* セット勝敗表示 */}
             <div className={styles.setResultBar}>
               <span className={styles.setResultLabel}>私たちの勝敗</span>
               <span className={styles.setResultScore}>{setRecord.our} 対 {setRecord.their}</span>
             </div>

             {entries.map((entry: any) => (
               <div key={entry.id} className={styles.setCard}>
                 <h4 className={styles.setLabel}>第{entry.setNumber}セット</h4>
                 
                 <div className={styles.scoreRow}>
                   <div className={styles.scoreInput}>
                     <label className={styles.label}>{sheet.member?.name || "未知の人"}{sheet.member?.nickname ? ` (${sheet.member.nickname})` : ""}</label>
                     <input
                       type="number"
                       className={styles.input}
                       name={`entry_${entry.id}_ourScore`}
                       value={entry.ourScore}
                       onChange={(e) => {
                         const newEntries = entries.map((item: any) => {
                           const updated = { ...item, ourScore: parseInt(e.target.value) || 0 };
                           const our = updated.ourScore;
                           const their = updated.theirScore;
                           updated.winner = our > their ? "OUR" : our < their ? "OPPONENT" : "";
                           return updated;
                         });
                         setEntries(newEntries);
                       }}
                       min="0"
                       max="30"
                       placeholder="空でも可"
                     />
                   </div>
                   <span className={styles.scoreSeparator}>-</span>
                   <div className={styles.scoreInput}>
                     <label className={styles.label}>{sheet.opponent || "相手"}</label>
                     <input
                       type="number"
                       className={styles.input}
                       name={`entry_${entry.id}_theirScore`}
                       value={entry.theirScore}
                       onChange={(e) => {
                         const newEntries = entries.map((item: any) => {
                           const updated = { ...item, theirScore: parseInt(e.target.value) || 0 };
                           const our = updated.ourScore;
                           const their = updated.theirScore;
                           updated.winner = our > their ? "OUR" : our < their ? "OPPONENT" : "";
                           return updated;
                         });
                         setEntries(newEntries);
                       }}
                       min="0"
                       max="30"
                       placeholder="空でも可"
                     />
                   </div>
                    {entry.winner && entry.winner !== "" && (
                      <span className={styles.winnerBadge}>
                        {entry.winner === "OUR" ? "私たちの勝ち" : "相手の勝ち"}
                      </span>
                    )}
                 </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>セットコメント（任意）</label>
                  <input
                    type="text"
                    className={styles.input}
                    name={`entry_${entry.id}_comment`}
                    value={entry.comment || ""}
                    onChange={(e) => {
                      const newEntries = entries.map((item: any) => 
                        item.id === entry.id ? { ...item, comment: e.target.value } : item
                      );
                      setEntries(newEntries);
                    }}
                    placeholder="セットのコメント"
                  />
                </div>
              </div>
            ))}

            <button type="submit" className={styles.button}>
              更新
            </button>
          </form>

          <form action={`/table-tennis-scores/${sheet.id}/delete`} method="DELETE" className={styles.deleteForm} onSubmit={(e) => { e.preventDefault(); if (!confirm("本当に削除しますか？")) return; fetch(`/table-tennis-scores/${sheet.id}/delete`, { method: 'DELETE' }).then(async (res) => { if (!res.ok) { const data = await res.json().catch(() => ({})); alert(data.error || '削除に失敗しました'); return; } window.location.href = '/table-tennis-scores'; }).catch(() => alert('通信エラーが発生しました')); }}>
            <button type="submit" className={styles.deleteButton}>
              削除
            </button>
          </form>
        </article>
      </section>
    </main>
  );
}