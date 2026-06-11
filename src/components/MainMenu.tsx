import React, { useState, useEffect } from 'react';

// ===== localStorage 存档工具 =====

const SAVE_KEY = 'absolute_majority_save';

interface SaveData {
  playerConfig: unknown;
  gameState: unknown;
  timestamp: number;
  turn: number;
}

export function saveGame(playerConfig: unknown, gameState: unknown, turn: number): void {
  const data: SaveData = {
    playerConfig,
    gameState,
    timestamp: Date.now(),
    turn,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('[Save] Failed:', e);
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SaveData;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

// ===== Toast 组件 =====

const Toast: React.FC<{
  message: string;
  onClose: () => void;
}> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={toastStyles.overlay}>
      <div style={toastStyles.box}>
        <div style={toastStyles.text}>{message}</div>
      </div>
    </div>
  );
};

// ===== MainMenu 主组件 =====

interface MainMenuProps {
  onStartNew: () => void;
  onResume: (save: SaveData) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStartNew, onResume }) => {
  const [hasExistingSave, setHasExistingSave] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    setHasExistingSave(hasSave());
    // 延迟触发入场动画
    requestAnimationFrame(() => setAnimateIn(true));
  }, []);

  const handleNewGame = () => {
    deleteSave();
    onStartNew();
  };

  const handleResume = () => {
    const save = loadGame();
    if (save) {
      onResume(save);
    } else {
      setToast('存档损坏或不存在');
      setHasExistingSave(false);
    }
  };

  const handleRestart = () => {
    deleteSave();
    onStartNew();
  };

  const handleExit = () => {
    const closed = window.close();
    // window.close() 在非脚本打开的标签页中返回 undefined / 抛出异常
    if (!closed) {
      setToast('请手动关闭标签页');
    }
  };

  const showToast = (msg: string) => setToast(msg);

  return (
    <div style={styles.screen}>
      {/* 背景遮罩 + 暗角 */}
      <div style={styles.bgOverlay} />
      <div style={styles.vignette} />

      {/* 内容 */}
      <div style={{
        ...styles.content,
        opacity: animateIn ? 1 : 0,
        transform: animateIn ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.8s ease-out, transform 0.8s ease-out',
      }}>
        {/* 标题区域 */}
        <div style={styles.titleSection}>
          <h1 style={styles.title}>绝对多数</h1>
          <div style={styles.titleEn}>ABSOLUTE MAJORITY</div>
          <div style={styles.subtitle}>2058 · 架空日本政治模拟</div>
        </div>

        {/* 按钮区域 */}
        <div style={styles.buttonGroup}>
          {hasExistingSave ? (
            <MenuButton label="继续游戏" accent onClick={handleResume} />
          ) : (
            <MenuButton label="开始游戏" accent onClick={handleNewGame} />
          )}
          <MenuButton label="重新开始" onClick={handleRestart} />
          <MenuButton label="历史存档" onClick={() => showToast('功能开发中')} />
          <MenuButton label="设置" onClick={() => showToast('功能开发中')} />
          <MenuButton label="退出游戏" onClick={handleExit} />
        </div>

        {/* 底部 */}
        <div style={styles.footer}>
          <span style={styles.version}>v0.1.0 Alpha</span>
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

// ===== 菜单按钮 =====

const MenuButton: React.FC<{
  label: string;
  accent?: boolean;
  onClick: () => void;
}> = ({ label, accent, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        ...styles.menuBtn,
        ...(accent ? styles.menuBtnAccent : {}),
        ...(hovered ? styles.menuBtnHover : {}),
        ...(accent && hovered ? styles.menuBtnAccentHover : {}),
        transform: pressed ? 'scale(0.97)' : hovered ? 'scale(1.02)' : 'scale(1)',
        transition: 'all 0.15s ease',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
};

// ===== 样式 =====

const styles: Record<string, React.CSSProperties> = {
  screen: {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1b2a 30%, #1b2838 60%, #0a0a1a 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  bgOverlay: {
    position: 'absolute',
    inset: 0,
    background: `
      radial-gradient(ellipse at 20% 50%, rgba(30, 60, 120, 0.15) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 30%, rgba(120, 40, 30, 0.1) 0%, transparent 50%),
      radial-gradient(ellipse at 50% 80%, rgba(20, 80, 60, 0.08) 0%, transparent 40%)
    `,
    pointerEvents: 'none',
  },
  vignette: {
    position: 'absolute',
    inset: 0,
    boxShadow: 'inset 0 0 200px 60px rgba(0, 0, 0, 0.6)',
    pointerEvents: 'none',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    padding: 40,
  },
  titleSection: {
    textAlign: 'center',
    marginBottom: 60,
  },
  title: {
    margin: 0,
    fontSize: 72,
    fontWeight: 900,
    letterSpacing: 12,
    background: 'linear-gradient(180deg, #FFD700 0%, #FFA000 40%, #FF8F00 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    textShadow: '0 4px 30px rgba(255, 215, 0, 0.2)',
    lineHeight: 1.2,
  },
  titleEn: {
    fontSize: 16,
    letterSpacing: 10,
    color: 'rgba(200, 200, 220, 0.5)',
    marginTop: 8,
    fontWeight: 300,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(200, 200, 220, 0.6)',
    marginTop: 16,
    letterSpacing: 4,
    fontWeight: 400,
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 320,
  },
  menuBtn: {
    width: '100%',
    padding: '14px 0',
    borderRadius: 6,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.04)',
    color: 'rgba(220, 220, 230, 0.85)',
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: 4,
    cursor: 'pointer',
    textAlign: 'center' as const,
    backdropFilter: 'blur(8px)',
  },
  menuBtnAccent: {
    background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.12), rgba(255, 160, 0, 0.08))',
    border: '1px solid rgba(255, 215, 0, 0.3)',
    color: '#FFD54F',
    fontWeight: 700,
    fontSize: 18,
  },
  menuBtnHover: {
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#fff',
    boxShadow: '0 0 20px rgba(200, 200, 255, 0.08)',
  },
  menuBtnAccentHover: {
    background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 160, 0, 0.15))',
    border: '1px solid rgba(255, 215, 0, 0.5)',
    color: '#FFE082',
    boxShadow: '0 0 30px rgba(255, 215, 0, 0.15)',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    textAlign: 'center',
  },
  version: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.2)',
    letterSpacing: 2,
  },
};

const toastStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    bottom: 80,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
  },
  box: {
    background: 'rgba(20, 20, 40, 0.95)',
    border: '1px solid rgba(100, 100, 200, 0.3)',
    borderRadius: 8,
    padding: '12px 28px',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
  },
  text: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  },
};
