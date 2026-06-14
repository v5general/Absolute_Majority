import React, { useState, useEffect, useRef } from 'react';
import { BackgroundImage } from './BackgroundImage';
import { preloadGameScene } from '../utils/imagePreloader';
import './MainMenu.css';

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
    <div className="mainMenu-toastOverlay">
      <div className="mainMenu-toastBox">
        <div className="mainMenu-toastText">{message}</div>
      </div>
    </div>
  );
};

// ===== SVG 图标 =====

const Icons: Record<string, React.FC<{ color?: string }>> = {
  continue: ({ color = '#C0A882' }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M3 7v14M21 7v14M6 11h12M6 15h12M6 7h12" />
      <path d="M6 3h12l3 4H3l3-4z" />
    </svg>
  ),
  newGame: ({ color = '#C0A882' }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" />
    </svg>
  ),
  load: ({ color = '#C0A882' }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  settings: ({ color = '#C0A882' }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  exit: ({ color = '#C0A882' }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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

  // ===== 滚动弹回机制 =====
  const screenRef = useRef<HTMLDivElement>(null);
  const [bounceOffset, setBounceOffset] = useState(0);
  const [entranceDone, setEntranceDone] = useState(false);
  const MAX_BOUNCE = 30;

  useEffect(() => {
    setHasExistingSave(hasSave());
    // 锁定 body 滚动，让 .screen 自身做滚动容器，避免滚动条出现/消失导致布局宽度跳变
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimateIn(true));
    });

    // 预加载游戏场景资源（在菜单显示时后台加载）
    preloadGameScene().then(results => {
      const successCount = results.filter(r => r.success).length;
      console.log(`预加载游戏场景: ${successCount}/${results.length} 张图片成功`);
    });

    return () => { document.body.style.overflow = ''; };
  }, []);

  // 入场动画完成后启用弹回
  useEffect(() => {
    if (animateIn) {
      const timer = setTimeout(() => setEntranceDone(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [animateIn]);

  // RAF 驱动的滚动弹回：追踪本次手势的峰值 deltaY，
  // 当 delta 跌破峰值 30% 时判定为惯性衰减，立即启动回弹。
  // 回弹归位后进入冷却期：小 delta 事件视为惯性残留忽略，
  // 大 delta 事件（>50）视为新意图立即放行。鼠标不受影响。
  useEffect(() => {
    const el = screenRef.current;
    if (!el || !entranceDone) return;

    let target = 0;
    let display = 0;
    let lastWheelTime = 0;
    let isReturning = false;
    let peakDelta = 0;
    let lastDir = 0;
    let ignoreUntil = 0;
    let rafId: number;

    const onWheel = (e: WheelEvent) => {
      if (isReturning) return;
      const absDelta = Math.abs(e.deltaY);

      // 冷却期：小幅 delta 视为惯性残留忽略，大幅 delta 视为新意图放行
      if (performance.now() < ignoreUntil) {
        if (absDelta < 50) return;
        ignoreUntil = 0;
      }

      const dir = Math.sign(e.deltaY);

      // 方向切换时重置峰值
      if (dir !== lastDir && lastDir !== 0) {
        peakDelta = absDelta;
      }
      lastDir = dir;
      if (absDelta > peakDelta) peakDelta = absDelta;

      // 当前 delta 跌破峰值 30% → 惯性衰减，立即回弹
      if (peakDelta > 15 && absDelta < peakDelta * 0.3) {
        isReturning = true;
        peakDelta = 0;
        lastDir = 0;
        return;
      }

      const step = dir * Math.min(absDelta * 0.4, 12);
      target = Math.max(-MAX_BOUNCE, Math.min(MAX_BOUNCE, target - step));
      lastWheelTime = performance.now();
    };

    const tick = () => {
      const now = performance.now();

      // 超时兜底（鼠标：事件稀疏，60ms 无新事件即回弹）
      if (!isReturning && lastWheelTime > 0 && (now - lastWheelTime) > 60) {
        isReturning = true;
      }

      if (isReturning) {
        const diff = 0 - display;
        if (Math.abs(diff) > 0.3) {
          display += diff * 0.15;
          setBounceOffset(display);
        } else {
          display = 0;
          target = 0;
          isReturning = false;
          peakDelta = 0;
          lastDir = 0;
          ignoreUntil = performance.now() + 500;
          setBounceOffset(0);
        }
      } else {
        const diff = target - display;
        if (Math.abs(diff) > 0.3) {
          display += diff * 0.15;
          setBounceOffset(display);
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    el.addEventListener('wheel', onWheel, { passive: true });
    rafId = requestAnimationFrame(tick);

    return () => {
      el.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(rafId);
    };
  }, [entranceDone]);

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
    <div ref={screenRef} className="mainMenu-screen">
      {/* 背景图 - 慢速缩放动画（WebP优先，PNG回退，响应式） */}
      <BackgroundImage image="main_menu_bg" className="mainMenu-bgImage" />

      {/* 整体内容容器 */}
      <div
        className="mainMenu-content"
        style={{
          opacity: animateIn ? 1 : 0,
          transform: entranceDone
            ? `translateY(${bounceOffset}px)`
            : animateIn ? 'translateY(0)' : 'translateY(20px)',
          transition: entranceDone
            ? 'none'
            : 'opacity 0.8s ease-out, transform 0.8s ease-out',
        }}
      >
        {/* 标题区域 - 左上 */}
        <div className="mainMenu-titleSection">
          {/* 上方金色装饰线 */}
          <div className="mainMenu-decorLineTop" />
          <h1 className="mainMenu-title" data-text="绝对多数">绝对多数</h1>
          <div className="mainMenu-subtitle">2058 · 架空政治模拟</div>
          <div className="mainMenu-subtitleEn">ABSOLUTE MAJORITY</div>
          {/* 下方金色装饰线 */}
          <div className="mainMenu-decorLineBottom" />
        </div>

        {/* 菜单按钮组 - 居中 */}
        <div className="mainMenu-buttonGroup">
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
      <div className="mainMenu-footer">
        <span className="mainMenu-version">v0.1.0 Alpha</span>
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
      className="mainMenu-btn"
    >
      {/* 图标框 */}
      <span className="mainMenu-btnIcon">{icon}</span>
      <div className="mainMenu-btnTextWrap">
        <span className="mainMenu-btnLabel">{label}</span>
        <span className="mainMenu-btnSub">{subLabel}</span>
      </div>
    </button>
  );
};
