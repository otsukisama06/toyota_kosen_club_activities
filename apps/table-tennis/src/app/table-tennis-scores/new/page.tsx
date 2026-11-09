'use client';

import { useState, useReducer, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "@/app/home-dashboard.module.css";
import { toDateTimeLocalValue, nowInJst } from "@/lib/date-format";

interface SetScore {
  ourScore: string;
  theirScore: string;
  winner: string;
  comment: string;
}

type SetsState = SetScore[];

function updateSet(state: SetsState, action: { index: number; field: keyof SetScore; value: string }): SetsState {
  const newState = state.map((set, i) => {
    if (i !== action.index) return set;
    
    const updated = { ...set, [action.field]: action.value };
    
    // winnerを自動更新
    if (action.field === "ourScore" || action.field === "theirScore") {
      const our = parseInt(updated.ourScore) || 0;
      const their = parseInt(updated.theirScore) || 0;
      updated.winner = our > their ? "OUR" : our < their ? "OPPONENT" : "";
    }
    
    return updated;
  });
  return newState;
}

function calcSetRecord(sets: SetsState): { our: number; their: number } {
  let our = 0;
  let their = 0;
  for (const set of sets) {
    if (set.winner === "OUR") our++;
    else if (set.winner === "OPPONENT") their++;
  }
  return { our, their };
}

const INITIAL_SETS: SetsState = Array.from({ length: 5 }, () => ({
  ourScore: "",
  theirScore: "",
  winner: "",
  comment: "",
}));

export default function NewTableTennisScorePage() {
  const router = useRouter();
  const [opponent, setOpponent] = useState("");
  const [matchDate, setMatchDate] = useState(() => {
    return toDateTimeLocalValue(nowInJst());
  });
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [sets, dispatch] = useReducer(updateSet, INITIAL_SETS);

  const [setCount, setSetCount] = useState(1);

  const setRecord = useMemo(() => calcSetRecord(sets), [sets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const activeCount = sets.slice(0, setCount).filter(s => s.ourScore || s.theirScore || s.comment).length;
    if (activeCount === 0) {
      alert("少なくとも1セットのスコアを入力してください。");
      setLoading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("opponent", opponent);
      formData.append("matchDate", matchDate);
      formData.append("comment", comment);
      sets.forEach((set, index) => {
        formData.append(`set_${index + 1}_ourScore`, set.ourScore);
        formData.append(`set_${index + 1}_theirScore`, set.theirScore);
        formData.append(`set_${index + 1}_winner`, set.winner);
        formData.append(`set_${index + 1}_comment`, set.comment);
      });

      const response = await fetch("/api/table-tennis-scores", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        router.push("/table-tennis-scores");
      } else {
        const error = await response.text();
        alert("エラーが発生しました: " + error);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>新しい試合結果</h1>
        <p>セットスコアを入力してください。（1セット以上の入力で提出できます）</p>
      </header>

      <nav className={styles.nav}>
        <Link href="/table-tennis-scores" className={styles.secondaryLink}>試合結果一覧へ戻る</Link>
      </nav>

      <section className={styles.grid}>
        <article className={styles.card}>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label className={styles.label}>対戦相手</label>
              <input
                type="text"
                className={styles.input}
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>試合日時</label>
              <input
                type="datetime-local"
                className={styles.input}
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>コメント</label>
              <textarea
                className={styles.textarea}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>

            <h3 className={styles.sectionTitle}>各セットのスコア</h3>

            {/* セット勝敗表示 */}
            <div className={styles.setResultBar}>
              <span className={styles.setResultLabel}>私たちの勝敗</span>
              <span className={styles.setResultScore}>{setRecord.our} 対 {setRecord.their}</span>
            </div>

            {sets.slice(0, setCount).map((set, index) => (
              <div key={index} className={styles.setCard}>
                <h4 className={styles.setLabel}>第{index + 1}セット</h4>
               
                <div className={styles.scoreRow}>
                  <input
                    type="number"
                    className={styles.scoreInput}
                    value={set.ourScore}
                    onChange={(e) => dispatch({ index, field: "ourScore" as keyof SetScore, value: e.target.value })}
                    min="0"
                    max="30"
                    placeholder="私たちのスコア"
                  />
                  <span className={styles.scoreSeparator}>-</span>
                  <input
                    type="number"
                    className={styles.scoreInput}
                    value={set.theirScore}
                    onChange={(e) => dispatch({ index, field: "theirScore" as keyof SetScore, value: e.target.value })}
                    min="0"
                    max="30"
                    placeholder="相手のスコア"
                  />
                  {set.winner && (
                    <span className={styles.winnerBadge}>
                      {set.winner === "OUR" ? "私たちの勝ち" : "相手の勝ち"}
                    </span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>セットコメント（任意）</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={set.comment}
                    onChange={(e) => dispatch({ index, field: "comment" as keyof SetScore, value: e.target.value })}
                    placeholder="セットのコメント"
                  />
                </div>
              </div>
            ))}

            {setCount < 5 && (
              <button
                type="button"
                className={styles.secondaryLink}
                onClick={() => setSetCount(prev => prev + 1)}
              >
                + セットを追加
              </button>
            )}

            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? "送信中..." : "提出"}
            </button>
          </form>
        </article>
      </section>
    </main>
  );
}