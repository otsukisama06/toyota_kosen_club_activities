"use client";

import { useState, useEffect, useCallback } from "react";
import { AttendanceStatus } from "@prisma/client";
import styles from "@/app/member-page-shared.module.css";

type AttendanceSubmitFormProps = {
  eventId: string;
  redirectTo: string;
  initialStatus: AttendanceStatus;
  initialComment: string;
};

export function AttendanceSubmitForm({
  eventId,
  redirectTo,
  initialStatus,
  initialComment,
}: AttendanceSubmitFormProps) {
  const [status, setStatus] = useState<AttendanceStatus>(initialStatus);
  const [comment, setComment] = useState(initialComment);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newNotes, setNewNotes] = useState<Array<{ id: string; title: string; content: string; date: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);

  // モーダルを閉じてlocalStorageに現在の時刻を保存
  const closeModal = useCallback(async () => {
    setIsModalOpen(false);
    // localStorageに現在時刻を保存（次回以降、このリリースノートを表示しないようにするため）
    localStorage.setItem('lastReleaseNoteCheck', new Date().toISOString());
    
    // DBにもアクティビティ時刻を保存（オプション）
    try {
      await fetch('/api/user-last-activity', { method: 'POST' });
    } catch (e) {
      console.error('Failed to save last activity to DB:', e);
    }
  }, []);

  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        closeModal();
      }
    };
    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [isModalOpen, closeModal]);

  // モーダル開封時にボディのスクロールを防止
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isModalOpen]);

  useEffect(() => {
    // 少し遅れてリリースノートをチェック（ページの初期表示を待機）
    const timer = setTimeout(async () => {
      try {
        // localStorageから最後のアクティビティ時刻を取得
        const lastActivityFromStorage = localStorage.getItem('lastReleaseNoteCheck');
        let compareDate: Date;
        
        if (lastActivityFromStorage) {
          compareDate = new Date(lastActivityFromStorage);
        } else {
          // 初回アクセスの場合は現在時刻を基準に（過去のリリースノートは表示しない）
          compareDate = new Date();
          // 5分前に設定（デプロイ直後のリリースノートを見逃さないように）
          compareDate = new Date(Date.now() - 5 * 60 * 1000);
        }

        console.log('[ReleaseNotes] compareDate:', compareDate);

        // キャッシュを無効化してAPIからリリースノートを取得
        const response = await fetch('/api/release-notes', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!response.ok) {
          throw new Error('リリースノートの取得に失敗しました');
        }
        const apiResponse = await response.json();
        // APIは { releaseNotes: [...] } 形式で返す
        const apiReleaseNotes: Array<{ id: string; version: string; title: string; content: string; createdBy: { nickname: string | null }; createdAt: Date }> = (apiResponse?.releaseNotes) || [];

        console.log('[ReleaseNotes] total release notes:', apiReleaseNotes.length);
        if (apiReleaseNotes.length > 0) {
          console.log('[ReleaseNotes] first note createdAt:', apiReleaseNotes[0].createdAt);
        }

        // 新しいリリースノートをフィルタリング（最終アクティビティ時刻以降のもの）
        const recentNotes = apiReleaseNotes.filter((note) => {
          const noteDate = new Date(note.createdAt).getTime();
          return noteDate > compareDate.getTime();
        });

        console.log('[ReleaseNotes] recent notes count:', recentNotes.length);

        // version, title, content, date 形式に変換
        const formattedNotes: Array<{ id: string; title: string; content: string; date: string }> = recentNotes.map((note) => ({
          id: note.id,
          title: note.title,
          content: note.content,
          date: new Date(note.createdAt).toISOString(),
        }));

        if (formattedNotes.length > 0) {
          console.log('[ReleaseNotes] showing modal with', formattedNotes.length, 'notes');
          setNewNotes(formattedNotes);
          setIsModalOpen(true);
        } else {
          console.log('[ReleaseNotes] no new notes to show');
        }
      } catch (error) {
        console.error('[ReleaseNotes] Error:', error);
        // エラーが発生してもローディングは解除（フォームを表示するため）
      } finally {
        setIsLoading(false);
      }
    }, 1000);

    // 3秒タイムアウト：APIが応答しない場合でもフォームを表示
    const timeoutTimer = setTimeout(() => {
      console.log('[ReleaseNotes] Timeout - forcing loading to false');
      setIsLoading(false);
    }, 3000);

    return () => {
      clearTimeout(timer);
      clearTimeout(timeoutTimer);
    };
  }, []);

  // フォーム提出時
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isFormSubmitting) return;
    
    // 遅刻・欠席の場合、コメントチェック
    if (status !== 'ATTEND' && !comment.trim()) {
      alert('理由を記入してください');
      return;
    }

    setIsFormSubmitting(true);
    
    const formData = new FormData();
    formData.append('eventId', eventId);
    formData.append('status', status);
    formData.append('comment', comment);
    formData.append('redirectTo', redirectTo);

    try {
      const response = await fetch('/api/self-attendance', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Attendance] API error:', errorText);
        throw new Error('提出に失敗しました');
      }

      // 成功後、ページをリロードして新しい状態を表示
      window.location.href = redirectTo + '?ok=attendance';
    } catch (error) {
      console.error('[Attendance] Submit error:', error);
      alert('提出に失敗しました。もう一度お試しください。');
      setIsFormSubmitting(false);
    }
  };

  const showCommentField = status !== AttendanceStatus.ATTEND;

  // ロード中に表示するローディング画面
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className={styles.form}>
        <label>
          自分の出席状況
          <select
            value={status}
            onChange={(event) => setStatus(event.currentTarget.value as AttendanceStatus)}
          >
            <option value="ATTEND">出席</option>
            <option value="LATE">遅刻</option>
            <option value="EARLY_LEAVE">早退</option>
            <option value="ABSENT">欠席</option>
          </select>
        </label>

        {showCommentField ? (
          <label>
            コメント
            <textarea
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.currentTarget.value)}
              required
              placeholder="理由を記入"
            />
          </label>
        ) : null}

        {showCommentField ? (
          <p className={styles.meta}>遅刻・欠席の場合はコメントの入力が必要です。</p>
        ) : null}

        <button 
          type="submit" 
          className={styles.button}
          disabled={isFormSubmitting}
        >
          {isFormSubmitting ? '提出中...' : 'このイベントに提出する'}
        </button>
      </form>

      {/* リリースノートモーダル（カスタム実装） */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="release-notes-title"
        >
          <div
            style={{
              maxWidth: '600px',
              margin: '20px',
              padding: '24px',
              backgroundColor: 'white',
              borderRadius: '12px',
              maxHeight: '80vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
              animation: 'slideUp 0.3s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 
                id="release-notes-title" 
                style={{ 
                  margin: 0, 
                  fontSize: '20px', 
                  fontWeight: 'bold',
                  color: '#1a1a1a'
                }}
              >
                🎉 新しいリリースノート
              </h2>
              <button
                onClick={closeModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666',
                  padding: '0 4px',
                  lineHeight: 1
                }}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {newNotes.map((note) => (
                <div 
                  key={note.id} 
                  style={{ 
                    marginBottom: '20px', 
                    paddingBottom: '20px', 
                    borderBottom: '1px solid #eee' 
                  }}
                >
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#007bff' }}>
                    {note.title}
                  </h3>
                  <p style={{ margin: '0 0 8px 0', lineHeight: 1.6 }}>{note.content}</p>
                  <small style={{ color: '#888' }}>{note.date}</small>
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={closeModal}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f8f9fa',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                × 後で見る
              </button>
              <button
                onClick={closeModal}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                OK ・確認する
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}