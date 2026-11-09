"use client";

import { useState, useEffect, useCallback } from 'react';

export function GlobalReleaseNotesPopup() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newNotes, setNewNotes] = useState<Array<{ id: string; version: string; title: string; content: string; createdAt: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // モーダルを閉じてlocalStorageに現在の時刻を保存
  const closeModal = useCallback(async () => {
    setIsModalOpen(false);
    // localStorageに現在時刻を保存（次回以降、このリリースノートを表示しないようにするため）
    localStorage.setItem('lastReleaseNoteCheck', new Date().toISOString());
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

  // ページ読み込み時にリリースノートをチェック
  useEffect(() => {
    const checkReleaseNotes = async () => {
      try {
        // localStorageから最後のチェック時刻を取得
        const lastCheckFromStorage = localStorage.getItem('lastReleaseNoteCheck');
        let compareDate: Date;
        
        if (lastCheckFromStorage) {
          compareDate = new Date(lastCheckFromStorage);
        } else {
          // 初回アクセスの場合は現在時刻を基準に（過去のリリースノートは表示しない）
          compareDate = new Date(Date.now() - 5 * 60 * 1000);
        }

        console.log('[GlobalReleaseNotes] compareDate:', compareDate);

        // キャッシュを無効化してAPIからリリースノートを取得
        const response = await fetch('/api/release-notes', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!response.ok) {
          throw new Error('リリースノートの取得に失敗しました');
        }
        const apiResponse = await response.json();
        const apiReleaseNotes: Array<{ id: string; version: string; title: string; content: string; createdBy: { nickname: string | null }; createdAt: string }> = (apiResponse.releaseNotes) || [];

        console.log('[GlobalReleaseNotes] total release notes:', apiReleaseNotes.length);
        if (apiReleaseNotes.length > 0) {
          console.log('[GlobalReleaseNotes] first note createdAt:', apiReleaseNotes[0].createdAt);
        }

        // 新しいリリースノートをフィルタリング（最終チェック時刻以降のもの）
        const recentNotes = apiReleaseNotes.filter((note) => {
          const noteDate = new Date(note.createdAt).getTime();
          return noteDate > compareDate.getTime();
        });

        console.log('[GlobalReleaseNotes] recent notes count:', recentNotes.length);

        if (recentNotes.length > 0) {
          setNewNotes(recentNotes);
          setIsModalOpen(true);
        } else {
          console.log('[GlobalReleaseNotes] no new notes to show');
        }
      } catch (error) {
        console.error('[GlobalReleaseNotes] Error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // 少し遅れて実行（ページの初期表示を待機）
    const timer = setTimeout(checkReleaseNotes, 1000);
    return () => clearTimeout(timer);
  }, []);

  // ローディング中は何も表示しない
  if (isLoading || !isModalOpen) {
    return null;
  }

  return (
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
        zIndex: 10000,
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
                {note.version} - {note.title}
              </h3>
              <p style={{ margin: '0 0 8px 0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{note.content}</p>
              <small style={{ color: '#888' }}>{new Date(note.createdAt).toLocaleString('ja-JP')}</small>
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