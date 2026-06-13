import React, { useState, useEffect, useCallback } from 'react';
import { GameProvider, useGame } from './hooks/useGameState';
import { RelationMatrix } from './components/RelationMatrix';
import { MarketDashboard } from './components/MarketDashboard';
import { GovernmentPanel } from './components/GovernmentPanel';
import { CommitteeDashboard } from './components/CommitteeDashboard';
import { GalgameDialog } from './components/GalgameDialog';
import { CharacterCreation } from './components/CharacterCreation';
import { PlayerProfilePanel } from './components/PlayerProfilePanel';
import { MainMenu, saveGame, loadGame, hasSave, deleteSave } from './components/MainMenu';
import { GAME_START_TIME } from './config/ruleConfig';
import type { ThinkingLogEntry, GameState } from './types';

/** 根据回合数计算月份标签（回合1=大选后第一个月） */
const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
function getMonthLabel(turn: number): string {
  // 回合1对应起始年月（默认 2058 年 1 月，即国会预算决战期起始）
  const { startYear, startMonth } = GAME_START_TIME;
  const totalMonths = startMonth - 1 + (turn - 1);
  const year = startYear + Math.floor(totalMonths / 12);
  const month = totalMonths % 12;
  return `${year}年${MONTH_NAMES[month]}`;
}

/** 主界面卡片导航标签（每张卡片单独一屏，通过标签切换） */
const TABS = [
  { id: 'cabinet', label: '内阁' },
  { id: 'committee', label: '委员会' },
  { id: 'market', label: '大盘' },
  { id: 'relations', label: '关系' },
] as const;

const GameInner: React.FC = () => {
  const { state, setPlayerConfig, nextTurn, isThinking, thinkingLogs } = useGame();
  const [showProfile, setShowProfile] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  // 任意界面切换时都滚动到顶部
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [state.playerConfig, activeTab]);

  // 玩家资料面板打开时锁定页面滚动
  useEffect(() => {
    if (showProfile) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [showProfile]);

  // 执政联盟席位计算
  const gov = state.government;
  const coalitionSeats = gov
    ? gov.rulingCoalition.reduce((sum, pid) => {
        const r = gov.electionResult.partyResults.find(er => er.partyId === pid);
        return sum + (r?.seats ?? 0);
      }, 0)
    : 0;
  const hasSupermajority = coalitionSeats >= 134;
  const isMinority = gov?.isMinority ?? false;

  return (
    <div style={styles.app}>
      {/* 全屏背景图 */}
      <div style={styles.bgImage} />
      {/* 暗角渐变遮罩 */}
      <div style={styles.vignette} />
      <header style={styles.headerRow}>
        <div style={styles.headerLeft}>
          <button
            style={{
              ...styles.nextTurnBtn,
              ...(isThinking ? styles.nextTurnBtnDisabled : {}),
              cursor: isThinking ? 'wait' : 'pointer',
            }}
            onClick={nextTurn}
            disabled={isThinking}
          >
            {isThinking ? 'AI 推演中...' : '下一回合'}
          </button>
        </div>
        <div style={styles.headerCenter}>
          <h1 style={styles.headerTitle}>国会局势</h1>
          <div style={styles.headerInfo}>
            <span style={styles.turnBadge}>{getMonthLabel(state.turn)}</span>
            <span style={styles.turnNumBadge}>第 {state.turn} 回合</span>
            {gov && (
              <span style={{
                ...styles.coalitionBadge,
                ...(hasSupermajority ? styles.supermajorityBadge : isMinority ? styles.minorityHeaderBadge : {}),
              }}>
                {hasSupermajority ? `★ 绝对多数 ${coalitionSeats}/200` : `${coalitionSeats}/200 席`}
              </span>
            )}
            <span style={styles.playerBadge}>
              {state.playerConfig.lastName} {state.playerConfig.firstName} · {state.parties.find(p => p.id === state.playerConfig?.partyId)?.abbreviation ?? ''}
            </span>
          </div>
        </div>
        <div style={styles.headerRight}>
          <button
            style={{
              ...styles.avatarBtn,
              border: `2px solid ${state.parties.find(p => p.id === state.playerConfig?.partyId)?.color ?? '#5c8aff'}`,
            }}
            onClick={() => setShowProfile(true)}
            title="查看个人资料"
          >
            {state.playerConfig.lastName[0] ?? ''}
          </button>
        </div>
      </header>

      {showProfile && state.playerConfig && (
        <PlayerProfilePanel
          playerConfig={state.playerConfig}
          party={state.parties.find(p => p.id === state.playerConfig?.partyId)}
          playerStress={state.playerStress ?? 15}
          playerHealth={state.playerHealth ?? 85}
          onClose={() => setShowProfile(false)}
        />
      )}

      <nav style={styles.navBar}>
        <div style={styles.navTabs}>
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              style={{
                ...styles.navTab,
                ...(i === activeTab ? styles.navTabActive : {}),
              }}
              onClick={() => setActiveTab(i)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* 推演日志条：始终显示在主界面 */}
      {thinkingLogs.length > 0 && (
        <div style={styles.logBar}>
          <div style={styles.logBarHeader}>
            <span style={styles.logBarTitle}>
              {isThinking ? '⏳ AI 推演进行中' : '✓ 本回合推演完成'}
            </span>
          </div>
          <div style={styles.logBarContent}>
            {thinkingLogs.map((log, i) => (
              <div key={i} style={styles.logBarItem}>
                <span style={{
                  ...styles.logBarRole,
                  color: ROLE_COLORS[log.role] ?? '#5c8aff',
                }}>
                  {ROLE_ICONS[log.role] ?? '◆'} {log.name}
                </span>
                <span style={styles.logBarAction}>{ACTION_LABELS[log.action] ?? log.action}</span>
                <span style={styles.logBarReasoning}>
                  {log.reasoning.length > 80 ? log.reasoning.slice(0, 80) + '...' : log.reasoning}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <main style={styles.main}>
        {activeTab === 0 && state.government && (
          <section style={styles.section}>
            <GovernmentPanel
              government={state.government}
              parties={state.parties}
              relations={state.relations}
            />
          </section>
        )}

        {activeTab === 1 && (
          <section style={styles.section}>
            <CommitteeDashboard
              committees={state.committees}
              bills={state.bills}
              parties={state.parties}
              relations={state.relations}
              mpPersonalities={state.mpPersonalities}
            />
          </section>
        )}

        {activeTab === 2 && (
          <section style={styles.section}>
            <MarketDashboard
              parties={state.parties}
              metrics={state.metrics}
              districts={state.districts}
              turnsUntilElection={state.turnsUntilElection ?? 48}
            />
          </section>
        )}

        {activeTab === 3 && (
          <section style={styles.section}>
            <RelationMatrix
              parties={state.parties}
              relations={state.relations}
            />
          </section>
        )}
      </main>

      <GalgameDialog />
    </div>
  );
};

const ROLE_COLORS: Record<string, string> = {
  prime_minister: '#FF6D00',
  party_leader: '#5c8aff',
  faction_leader: '#ab47bc',
  media: '#66BB6A',
  interest_group: '#FFD54F',
};

const ROLE_ICONS: Record<string, string> = {
  prime_minister: '★',
  party_leader: '◆',
  faction_leader: '▲',
  media: '◆',
  interest_group: '$',
};

const ACTION_LABELS: Record<string, string> = {
  coalition_proposal: '联盟提案',
  cabinet_reshuffle: '内阁改组',
  opposition_attack: '议会质询',
  opposition_coalition: '在野联盟',
  coalition_pressure: '联盟施压',
  faction_challenge: '派系挑战',
  media_boost: '正面报道',
  media_scandal: '负面爆料',
  lobby_funds: '政治捐款',
  wait: '按兵不动',
};

/** 包装 CharacterCreation，使其在 GameProvider 内调用 setPlayerConfig */
const CharacterCreationWrapper: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const { setPlayerConfig } = useGame();
  return (
    <CharacterCreation
      onComplete={(config) => {
        setPlayerConfig(config);
        onComplete();
      }}
    />
  );
};

type Route = 'menu' | 'create' | 'game';

function getHashRoute(): Route {
  const hash = window.location.hash;
  if (hash === '#/create') return 'create';
  if (hash === '#/game') return 'game';
  return 'menu';
}

const App: React.FC = () => {
  const [route, setRoute] = useState<Route>(getHashRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(getHashRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((r: Route) => {
    window.location.hash = '#/' + r;
  }, []);

  if (route === 'menu') {
    return (
      <MainMenu
        onStartNew={() => {
          deleteSave();
          navigate('create');
        }}
        onResume={() => {
          navigate('game');
        }}
      />
    );
  }

  if (route === 'create') {
    return (
      <GameProvider>
        <CharacterCreationWrapper onComplete={() => navigate('game')} />
      </GameProvider>
    );
  }

  // route === 'game': 恢复存档，无存档则跳转主菜单
  const save = loadGame();
  if (!save || !save.gameState) {
    // 无存档，跳回主菜单
    navigate('menu');
    return null;
  }

  const savedState = save.gameState as GameState;
  return (
    <GameProvider savedState={savedState}>
      <GameInner />
    </GameProvider>
  );
};

const FONT_SERIF = '"Noto Serif SC", "Source Han Serif SC", Georgia, serif';
const COLOR_GOLD = '#C0A882';
const COLOR_GOLD_DIM = '#B8A47C';
const COLOR_BORDER = 'rgba(192, 168, 130, 0.18)';
const COLOR_BORDER_ACTIVE = 'rgba(192, 168, 130, 0.4)';

const styles: Record<string, React.CSSProperties> = {
  app: {
    position: 'relative',
    minHeight: '100vh',
    background: '#000',
    color: '#e0e0e0',
    fontFamily: `${FONT_SERIF}, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`,
  },
  bgImage: {
    position: 'fixed',
    inset: 0,
    backgroundImage: 'url(/game_bg.png)',
    backgroundSize: 'cover',
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed',
    zIndex: 0,
  },
  vignette: {
    position: 'fixed',
    inset: 0,
    zIndex: 0,
    background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.3) 100%)',
    pointerEvents: 'none',
  },
  header: {
    textAlign: 'center',
    padding: '32px 16px 8px',
  },
  headerRow: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '24px 16px 8px',
    maxWidth: 1200,
    margin: '0 auto',
  },
  headerLeft: {
    flex: 1,
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: '0 0 auto',
    textAlign: 'center',
  },
  headerRight: {
    flex: 1,
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
  },
  avatarBtn: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    border: '2px solid',
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)',
    color: '#e0e0e0',
    fontSize: 18,
    fontWeight: 800,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  headerTitle: {
    margin: 0,
    fontSize: 48,
    fontWeight: 800,
    fontFamily: FONT_SERIF,
    letterSpacing: 6,
    textAlign: 'center',
    background: 'linear-gradient(180deg, #D4C5A0, #A08B6B)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  headerInfo: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    marginTop: 10,
  },
  turnBadge: {
    padding: '3px 14px',
    borderRadius: 4,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(6px)',
    border: `1px solid ${COLOR_BORDER}`,
    color: COLOR_GOLD,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: FONT_SERIF,
  },
  turnNumBadge: {
    padding: '3px 14px',
    borderRadius: 4,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(6px)',
    border: `1px solid ${COLOR_BORDER}`,
    color: '#aaa',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: FONT_SERIF,
  },
  playerBadge: {
    padding: '3px 14px',
    borderRadius: 4,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(6px)',
    border: `1px solid ${COLOR_BORDER}`,
    color: '#8aff5c',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: FONT_SERIF,
  },
  coalitionBadge: {
    padding: '3px 14px',
    borderRadius: 4,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(6px)',
    border: `1px solid ${COLOR_BORDER}`,
    color: COLOR_GOLD,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: FONT_SERIF,
  },
  supermajorityBadge: {
    background: 'rgba(74,20,140,0.6)',
    backdropFilter: 'blur(6px)',
    border: '1px solid #CE93D8',
    color: '#E1BEE7',
    fontWeight: 700,
    boxShadow: '0 0 12px rgba(206,147,216,0.3)',
  },
  minorityHeaderBadge: {
    border: '1px solid #E65100',
    color: '#FFB74D',
  },
  navBar: {
    position: 'relative',
    zIndex: 1,
    maxWidth: 1200,
    margin: '12px auto',
    padding: '0 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  navTabs: {
    display: 'flex',
    gap: 8,
  },
  navTab: {
    minWidth: 116,
    padding: '9px 18px',
    borderRadius: 18,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)',
    border: `1px solid ${COLOR_BORDER}`,
    color: COLOR_GOLD_DIM,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 3,
    textIndent: 3,
    fontFamily: FONT_SERIF,
    transition: 'all 0.15s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
  },
  navTabActive: {
    background: 'rgba(0,0,0,0.6)',
    border: `1px solid ${COLOR_BORDER_ACTIVE}`,
    color: COLOR_GOLD,
    boxShadow: '0 0 16px rgba(192,168,130,0.15)',
  },
  nextTurnBtn: {
    padding: '10px 28px',
    borderRadius: 2,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    border: `1px solid ${COLOR_BORDER_ACTIVE}`,
    color: COLOR_GOLD,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 2,
    fontFamily: FONT_SERIF,
    boxShadow: '0 0 16px rgba(192,168,130,0.1)',
    transition: 'all 0.15s',
  },
  nextTurnBtnDisabled: {
    background: 'rgba(0,0,0,0.5)',
    border: `1px solid ${COLOR_BORDER}`,
    boxShadow: 'none',
    opacity: 0.5,
    color: '#666',
  },
  // 推演日志条
  logBar: {
    position: 'relative',
    zIndex: 1,
    maxWidth: 1200,
    margin: '0 auto 12px',
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(12px)',
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER}`,
    overflow: 'hidden',
    boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
  },
  logBarHeader: {
    padding: '8px 14px',
    borderBottom: `1px solid ${COLOR_BORDER}`,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  logBarTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: COLOR_GOLD_DIM,
    fontFamily: FONT_SERIF,
  },
  logBarContent: {
    maxHeight: 180,
    overflowY: 'auto',
    padding: '4px 8px',
  },
  logBarItem: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    padding: '4px 6px',
    borderRadius: 4,
    fontSize: 12,
    lineHeight: 1.5,
  },
  logBarRole: {
    fontWeight: 700,
    fontSize: 12,
    whiteSpace: 'nowrap' as const,
    minWidth: 80,
  },
  logBarAction: {
    background: 'rgba(0,0,0,0.3)',
    padding: '1px 6px',
    borderRadius: 3,
    color: COLOR_GOLD_DIM,
    fontSize: 11,
    whiteSpace: 'nowrap' as const,
  },
  logBarReasoning: {
    color: '#777',
    fontSize: 11,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
  },
  main: {
    position: 'relative',
    zIndex: 1,
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 16px 48px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  section: {},
};

export default App;
