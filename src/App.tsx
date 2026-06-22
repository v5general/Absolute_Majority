import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { GameProvider, useGame } from './hooks/useGameState';
import { BackgroundImage } from './components/BackgroundImage';
import { RelationMatrix } from './components/RelationMatrix';
import { MarketDashboard } from './components/MarketDashboard';
import { GovernmentPanel } from './components/GovernmentPanel';
import { CommitteeDashboard } from './components/CommitteeDashboard';
import { GalgameDialog } from './components/GalgameDialog';
import { CharacterCreation } from './components/CharacterCreation';
import { PlayerProfilePanel } from './components/PlayerProfilePanel';
import { PlayerMPProfilePanel } from './components/PlayerMPProfilePanel';
import { PartyOverview } from './components/PartyOverview';
import { MainHall } from './components/MainHall';
import { MainMenu, saveGame, loadGame, hasSave, deleteSave } from './components/MainMenu';
import { GAME_START_TIME } from './config/ruleConfig';
import type { GameState, ThinkingLogEntry } from './types';

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
  const [showParties, setShowParties] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  // 主界面（事务所）与局势界面之间切换；角色创建后默认进入事务所
  const [view, setView] = useState<'hall' | 'situation'>('hall');

  // 任意界面切换时都滚动到顶部
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [state.playerConfig, activeTab, view]);

  // 党派一览 / 个人档案 打开时，锁定底层事务所的滚动（但蒙层自身仍可滚动）
  // 不能用 body{position:fixed}，那会丢失滚动位置；用 overflow:hidden 即可，
  // 因为蒙层是 position:fixed 自带独立滚动容器，不受 body overflow 影响。
  useEffect(() => {
    if (showProfile || showParties) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [showProfile, showParties]);

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

  // GameInner 仅在有玩家角色时渲染；类型守卫确保后续 playerConfig 访问安全
  if (!state.playerConfig) return null;

  // ===== 主界面（事务所）=====
  // 角色创建后默认进入；提供进入下一回合、打开局势/党派一览/个人档案的入口。
  // 党派一览 / 个人档案 以"模糊蒙层"形式浮在事务所之上（事务所仍可见但被模糊化）。
  if (view === 'hall') {
    return (
      <div className="sit-app">
        <MainHall
          onOpenSituation={() => setView('situation')}
          onOpenProfile={() => setShowProfile(true)}
          onOpenParties={() => setShowParties(true)}
          onNextTurn={nextTurn}
          isThinking={isThinking}
        />

        {/* 党派一览：模糊蒙层覆盖在事务所之上 */}
        {showParties && (
          <PartyOverview onBack={() => setShowParties(false)} />
        )}

        {/* 个人档案：模糊蒙层覆盖在事务所之上 */}
        {showProfile && state.playerConfig && (
          <PlayerProfilePanel
            playerConfig={state.playerConfig}
            party={state.parties.find(p => p.id === state.playerConfig?.partyId)}
            playerStress={state.playerStress ?? 15}
            playerHealth={state.playerHealth ?? 85}
            onClose={() => setShowProfile(false)}
          />
        )}

        {/* 回合推演中：全屏加载占位 */}
        {isThinking && <LoadingScreen label="AI 推演中" subLabel="COMPUTING" />}

        {/* 事件对话弹窗（任何视图都需要存在以承接 AI 事件） */}
        <GalgameDialog />
      </div>
    );
  }

  // ===== 局势界面（国会局势仪表盘）=====
  // 不再有"下一回合"按钮（移到事务所），用"返回事务所"按钮取代。
  return (
    <div className="sit-app">
      {/* 全屏背景图（移动端 WebP 优先，桌面端 PNG 优先） */}
      <BackgroundImage image="game_bg" className="game-bgImage" />
      {/* 暗角渐变遮罩 */}
      <div className="sit-vignette" />
      {/* 回合推演中：全屏加载占位，复用启动加载界面风格 */}
      {isThinking && <LoadingScreen label="AI 推演中" subLabel="COMPUTING" />}
      <header className="sit-headerRow">
        <div className="sit-headerLeft">
          <button
            className="sit-backBtn"
            onClick={() => setView('hall')}
            title="返回主界面"
          >
            ◀ 返回事务所
          </button>
        </div>
        <div className="sit-headerCenter">
          <h1 className="sit-headerTitle">国会局势</h1>
          <div className="sit-headerInfo">
            <span className="sit-turnBadge">{getMonthLabel(state.turn)}</span>
            <span className="sit-turnNumBadge">第 {state.turn} 回合</span>
            {gov && (
              <span
                className={`sit-coalitionBadge${
                  hasSupermajority ? ' sit-coalitionBadge--supermajority' : isMinority ? ' sit-coalitionBadge--minority' : ''
                }`}
              >
                {hasSupermajority ? `★ 绝对多数 ${coalitionSeats}/200` : `${coalitionSeats}/200 席`}
              </span>
            )}
            <span className="sit-playerBadge">
              {state.playerConfig.lastName} {state.playerConfig.firstName} · {state.parties.find(p => p.id === state.playerConfig?.partyId)?.abbreviation ?? ''}
            </span>
          </div>
        </div>
        <div className="sit-headerRight">
          <button
            className="sit-avatarBtn"
            style={{
              border: `2px solid ${state.parties.find(p => p.id === state.playerConfig?.partyId)?.color ?? '#5c8aff'}`,
              color: state.parties.find(p => p.id === state.playerConfig?.partyId)?.color ?? '#5c8aff',
            }}
            onClick={() => setShowProfile(true)}
            title="查看个人资料"
          >
            {state.playerConfig.lastName[0] ?? ''}
          </button>
        </div>
      </header>

      {showProfile && state.playerConfig && (
        <PlayerMPProfilePanel
          playerConfig={state.playerConfig}
          party={state.parties.find(p => p.id === state.playerConfig?.partyId)}
          playerStress={state.playerStress ?? 15}
          playerHealth={state.playerHealth ?? 85}
          onClose={() => setShowProfile(false)}
        />
      )}

      <nav className="sit-navBar">
        <div className="sit-navTabs">
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              className={`sit-navTab${i === activeTab ? ' sit-navTab--active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* 推演日志条：始终显示在主界面 */}
      {thinkingLogs.length > 0 && (
        <div className="sit-logBar">
          <div className="sit-logBarHeader">
            <span className="sit-logBarTitle">
              {isThinking ? '⏳ AI 推演进行中' : '✓ 本回合推演完成'}
            </span>
          </div>
          <div className="sit-logBarContent">
            {thinkingLogs.map((log, i) => (
              <LogRow key={i} log={log} />
            ))}
          </div>
        </div>
      )}

      <main className="sit-main">
        {activeTab === 0 && state.government && (
          <section>
            <GovernmentPanel
              government={state.government}
              parties={state.parties}
              relations={state.relations}
            />
          </section>
        )}

        {activeTab === 1 && (
          <section>
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
          <section>
            <MarketDashboard
              parties={state.parties}
              metrics={state.metrics}
              districts={state.districts}
              turnsUntilElection={state.turnsUntilElection ?? 48}
            />
          </section>
        )}

        {activeTab === 3 && (
          <section>
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
  // 备用 / 规则引擎路径产生的行动标签
  error: '出错',
  fundraise: '政治筹款',
  undermine: '打压对手',
  propose_bill: '提出法案',
  bill_proposal: '法案提案',
  no_confidence: '不信任案',
  support_change: '支持率变动',
  relation_change: '关系变动',
  funds_change: '资金变动',
  metrics_change: '大盘变动',
  challenge_leader: '挑战党首',
  seek_cabinet: '谋求入阁',
  form_faction: '组建派阀',
  lobby_support: '游说支持',
  media_campaign: '媒体攻势',
  backroom_deal: '密室交易',
  faction_defect: '派系叛离',
  stress_event: '议员失态',
};

/** 把日志的 action 字段渲染为中文。支持单个行动与逗号分隔的多个行动。 */
function formatAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (action.includes(',')) {
    return action.split(',').map(a => ACTION_LABELS[a.trim()] ?? a.trim()).join('、');
  }
  return action;
}

/** 单条推演日志：思考过长时可点击展开/收起，避免被截断无法查看。 */
const LogRow: React.FC<{ log: ThinkingLogEntry }> = ({ log }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = log.reasoning.length > 80;
  const text = expanded || !isLong ? log.reasoning : log.reasoning.slice(0, 80) + '...';
  return (
    <div className="sit-logBarItem">
      <span
        className="sit-logBarRole"
        style={{ color: ROLE_COLORS[log.role] ?? '#5c8aff' }}
      >
        {ROLE_ICONS[log.role] ?? '◆'} {log.name}
      </span>
      <span className="sit-logBarAction">{formatAction(log.action)}</span>
      <span
        className={`sit-logBarReasoning${expanded ? ' sit-logBarReasoning--expanded' : ''}`}
        style={{ cursor: isLong ? 'pointer' : 'default' }}
        onClick={isLong ? () => setExpanded(e => !e) : undefined}
        title={isLong ? (expanded ? '点击收起' : '点击展开全部') : undefined}
      >
        {text}
        {isLong && (
          <span style={{ color: '#B8A47C', marginLeft: 8, fontSize: 11, whiteSpace: 'nowrap' as const }}>
            {expanded ? '〔收起〕' : '〔展开〕'}
          </span>
        )}
      </span>
    </div>
  );
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

// ===== 启动前资源预加载 =====

/** 移动端用 WebP（更小），桌面端用 PNG（更高质量）。仅在启动时根据当前设备选一次。 */
function pickBgExtension(): 'webp' | 'png' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(max-width: 768px)').matches ? 'webp' : 'png';
  }
  return 'png';
}

/** 需要预加载的全屏背景图（启动界面、角色创建、事务所、局势界面） */
const PRELOAD_BG_NAMES = [
  'main_menu_bg',
  'character-create-bg',
  'main_hall_bg',
  'game_bg',
];
const PRELOAD_BACKGROUNDS = (() => {
  const ext = pickBgExtension();
  return PRELOAD_BG_NAMES.map(name => `/${name}.${ext}`);
})();

/** 预加载单张图片，加载完成或失败均 resolve（失败不阻塞启动） */
function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

/** 加载占位界面（黑底金色衬线，与整体风格一致）。可复用于启动预加载与回合推演。 */
const LoadingScreen: React.FC<{ label?: string; subLabel?: string }> = ({
  label = '加载中',
  subLabel = 'LOADING',
}) => (
  <div className="sit-loadingScreen">
    <div className="sit-loadingScreen__label">{label}</div>
    <div className="sit-loadingScreen__subLabel">{subLabel}</div>
  </div>
);

const App: React.FC = () => {
  const [route, setRoute] = useState<Route>(getHashRoute);
  const [assetsReady, setAssetsReady] = useState(false);

  // 启动时预加载所有界面背景；设安全超时（8s）避免网络问题阻塞启动
  useEffect(() => {
    const preload = Promise.all(PRELOAD_BACKGROUNDS.map(preloadImage));
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 8000));
    Promise.race([preload, timeout]).then(() => setAssetsReady(true));
  }, []);

  useEffect(() => {
    const onHashChange = () => setRoute(getHashRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((r: Route) => {
    window.location.hash = '#/' + r;
  }, []);

  if (!assetsReady) return <LoadingScreen />;

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

export default App;
