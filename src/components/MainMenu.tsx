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

// ===== SVG 图标 =====

const Icons: Record<string, React.FC<{ color?: string }>> = {
  continue: ({ color = '#D4AF37' }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M3 7v14M21 7v14M6 11h12M6 15h12M6 7h12" />
      <path d="M6 3h12l3 4H3l3-4z" />
    </svg>
  ),
  newGame: ({ color = '#D4AF37' }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" />
    </svg>
  ),
  load: ({ color = '#D4AF37' }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  settings: ({ color = '#D4AF37' }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  exit: ({ color = '#D4AF37' }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16,17 21,12 16,7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

// ===== MainMenu 主组件 =====

interface MainMenuProps {
  onStartNew: () => void;
  onResume: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStartNew, onResume }) => {
  const [hasExistingSave, setHasExistingSave] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    setHasExistingSave(hasSave());
    requestAnimationFrame(() => setAnimateIn(true));
  }, []);

  const handleNewGame = () => {
    deleteSave();
    onStartNew();
  };

  const handleResume = () => {
    const save = loadGame();
    if (save) {
      onResume();
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
    try {
      window.close();
    } catch {
      // 非脚本打开的标签页中可能抛异常
    }
    setToast('请手动关闭标签页');
  };

  const showToast = (msg: string) => setToast(msg);

  return (
    <div style={styles.screen}>
      {/* 背景图 */}
      <div style={styles.bgImage} />

      {/* 整体内容容器 - 靠上居中 */}
      <div style={{
        ...styles.content,
        opacity: animateIn ? 0.995 : 0,
        transform: animateIn ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.8s ease-out, transform 0.8s ease-out',
      }}>
        {/* 标题区域 - 屏幕上方 */}
        <div style={styles.titleSection}>
          {/* 上方金色装饰线 */}
          <div style={styles.decorLineTop} />
          <h1 style={styles.title}>绝对多数</h1>
          <div style={styles.subtitle}>2058 · 架空政治模拟</div>
          <div style={styles.tagline}>民意、权力、未来——一切取决于你的决断</div>
          {/* 下方金色装饰线 */}
          <div style={styles.decorLineBottom} />
        </div>

        {/* 菜单按钮组 - 居中 */}
        <div style={{
          ...styles.buttonGroup,
          alignSelf: 'center',
        }}>
          {hasExistingSave ? (
            <MenuButton
              icon={<Icons.continue />}
              label="继续游戏"
              subLabel="CONTINUE"
              onClick={handleResume}
            />
          ) : (
            <MenuButton
              icon={<Icons.newGame />}
              label="开始游戏"
              subLabel="NEW GAME"
              onClick={handleNewGame}
            />
          )}
          <MenuButton
            icon={<Icons.newGame />}
            label="重新开始"
            subLabel="RESTART"
            onClick={handleRestart}
          />
          <MenuButton
            icon={<Icons.load />}
            label="历史存档"
            subLabel="LOAD GAME"
            onClick={() => showToast('功能开发中')}
          />
          <MenuButton
            icon={<Icons.settings />}
            label="设置"
            subLabel="SETTINGS"
            onClick={() => showToast('功能开发中')}
          />
          <MenuButton
            icon={<Icons.exit />}
            label="退出游戏"
            subLabel="EXIT GAME"
            onClick={handleExit}
          />
        </div>
      </div>

      {/* 底部版本号 */}
      <div style={styles.footer}>
        <span style={styles.version}>v0.1.0 Alpha</span>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

// ===== 菜单按钮 =====

const MenuButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  subLabel: string;
  onClick: () => void;
}> = ({ icon, label, subLabel, onClick }) => {
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
        ...(hovered ? styles.menuBtnHover : {}),
        transform: pressed ? 'scale(0.98)' : hovered ? 'scale(1.01)' : 'scale(1)',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      }}
    >
      <span style={styles.menuBtnIcon}>{icon}</span>
      <div style={styles.menuBtnTextWrap}>
        <span style={styles.menuBtnLabel}>{label}</span>
        <span style={styles.menuBtnSub}>{subLabel}</span>
      </div>
    </button>
  );
};

// ===== 样式 =====

const styles: Record<string, React.CSSProperties> = {
  screen: {
    position: 'relative',
    width: '100%',
    minHeight: '100vh',
    overflowX: 'hidden',
    background: '#000',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Noto Serif SC", serif',
  },
  bgImage: {
    position: 'fixed',
    inset: 0,
    backgroundImage: 'url(/main_menu_bg.png)',
    backgroundSize: 'cover',
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat',
    zIndex: 0,
  },
  content: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    width: '100%',
    boxSizing: 'border-box',
    padding: '3vh 0 6vh',
  },
  titleSection: {
    textAlign: 'left' as const,
    marginBottom: '6vh',
    paddingLeft: '5vw',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  decorLineTop: {
    width: '20%',
    height: 1,
    background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.6), transparent)',
    marginBottom: 28,
  },
  title: {
    margin: 0,
    fontSize: 'clamp(48px, 6vw, 80px)',
    fontWeight: 900,
    letterSpacing: 20,
    fontFamily: '"Noto Serif SC", "Source Han Serif SC", Georgia, serif',
    color: '#D4AF37',
    textShadow: '0 0 40px rgba(212, 175, 55, 0.3), 0 2px 4px rgba(0, 0, 0, 0.5)',
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 'clamp(14px, 1.5vw, 18px)',
    color: 'rgba(240, 240, 250, 0.8)',
    marginTop: 16,
    letterSpacing: 6,
    fontWeight: 400,
  },
  tagline: {
    fontSize: 'clamp(11px, 1vw, 14px)',
    color: 'rgba(200, 200, 215, 0.45)',
    marginTop: 8,
    letterSpacing: 3,
    fontWeight: 300,
    fontStyle: 'italic',
  },
  decorLineBottom: {
    width: '15%',
    height: 1,
    background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.5), transparent)',
    marginTop: 24,
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
    width: '100%',
    maxWidth: 380,
  },
  menuBtn: {
    width: '100%',
    padding: '14px 20px',
    borderRadius: 2,
    border: '1px solid rgba(212, 175, 55, 0.25)',
    background: 'rgba(0, 0, 0, 0.6)',
    color: '#e0e0e8',
    textAlign: 'left' as const,
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    lineHeight: 1.3,
  },
  menuBtnHover: {
    background: 'rgba(0, 0, 0, 0.75)',
    border: '1px solid rgba(212, 175, 55, 0.55)',
    boxShadow: '0 0 20px rgba(212, 175, 55, 0.1)',
  },
  menuBtnIcon: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    border: '1px solid rgba(212, 175, 55, 0.2)',
    borderRadius: 2,
    background: 'rgba(212, 175, 55, 0.06)',
  },
  menuBtnTextWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  menuBtnLabel: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 6,
    color: '#f0f0f5',
  },
  menuBtnSub: {
    fontSize: 9,
    letterSpacing: 4,
    color: 'rgba(212, 175, 55, 0.45)',
    fontWeight: 400,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  footer: {
    position: 'fixed',
    bottom: 20,
    right: 30,
    zIndex: 2,
  },
  version: {
    fontSize: 11,
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
    background: 'rgba(10, 10, 25, 0.92)',
    border: '1px solid rgba(212, 175, 55, 0.25)',
    borderRadius: 4,
    padding: '12px 28px',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
  },
  text: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
    letterSpacing: 1,
  },
};
