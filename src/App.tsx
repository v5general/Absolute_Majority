import React, { useState } from 'react';
import { GameProvider, useGame } from './hooks/useGameState';
import { RelationMatrix } from './components/RelationMatrix';
import { MarketDashboard } from './components/MarketDashboard';
import { GovernmentPanel } from './components/GovernmentPanel';
import { CommitteeDashboard } from './components/CommitteeDashboard';
import { GalgameDialog } from './components/GalgameDialog';
import { CharacterCreation } from './components/CharacterCreation';
import { PlayerProfilePanel } from './components/PlayerProfilePanel';
import type { ThinkingLogEntry } from './types';

const GameInner: React.FC = () => {
  const { state, setPlayerConfig, nextTurn, isThinking, thinkingLogs } = useGame();
  const [showProfile, setShowProfile] = useState(false);

  // 未创建角色时显示角色创建界面
  if (!state.playerConfig) {
    return <CharacterCreation onComplete={setPlayerConfig} />;
  }

  const pendingCount = state.currentAIEvents.length;

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
      <header style={styles.headerRow}>
        <div style={styles.headerLeft}>
          <h1 style={styles.headerTitle}>绝对多数</h1>
          <div style={styles.headerSub}>ABSOLUTE MAJORITY · 政治选举模拟 · 2058年</div>
          <div style={styles.headerInfo}>
            <span style={styles.turnBadge}>第 {state.turn} 回合</span>
            <span style={styles.dayBadge}>第 {state.currentDay} 日</span>
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
              borderColor: state.parties.find(p => p.id === state.playerConfig?.partyId)?.color ?? '#5c8aff',
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

      <div style={styles.actionBar}>
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
        <span style={styles.actionHint}>
          {isThinking
            ? `正在推演... (${thinkingLogs.length}/${10 + state.parties.length} 个角色已完成)`
            : pendingCount > 0
              ? `${pendingCount} 个事件待处理`
              : state.events.length > 0
                ? `已处理 ${state.events.length} 个事件`
                : '点击下一回合，让政治世界运转'}
        </span>
      </div>

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
        {state.government && (
          <section style={styles.section}>
            <GovernmentPanel
              government={state.government}
              parties={state.parties}
              relations={state.relations}
            />
          </section>
        )}

        <section style={styles.section}>
          <CommitteeDashboard
            committees={state.committees}
            bills={state.bills}
            parties={state.parties}
            relations={state.relations}
            mpPersonalities={state.mpPersonalities}
          />
        </section>

        <section style={styles.section}>
          <MarketDashboard
            parties={state.parties}
            metrics={state.metrics}
            districts={state.districts}
          />
        </section>

        <section style={styles.section}>
          <RelationMatrix
            parties={state.parties}
            relations={state.relations}
          />
        </section>
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

const App: React.FC = () => (
  <GameProvider>
    <GameInner />
  </GameProvider>
);

const styles: Record<string, React.CSSProperties> = {
  app: {
    minHeight: '100vh',
    background: '#0f0f23',
    color: '#e0e0e0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    textAlign: 'center',
    padding: '32px 16px 8px',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '24px 16px 8px',
    maxWidth: 1200,
    margin: '0 auto',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexShrink: 0,
    paddingLeft: 16,
    paddingTop: 8,
  },
  avatarBtn: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    border: '2px solid',
    background: 'rgba(0,0,0,0.3)',
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
    fontSize: 36,
    fontWeight: 800,
    background: 'linear-gradient(135deg, #E53935, #1E88E5, #43A047)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  headerSub: {
    fontSize: 12,
    color: '#666',
    letterSpacing: 4,
    marginTop: 4,
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
    background: '#1a2540',
    border: '1px solid #2a3a5c',
    color: '#5c8aff',
    fontSize: 13,
    fontWeight: 700,
  },
  dayBadge: {
    padding: '3px 14px',
    borderRadius: 4,
    background: '#1a2540',
    border: '1px solid #2a3a5c',
    color: '#aaa',
    fontSize: 13,
    fontWeight: 600,
  },
  playerBadge: {
    padding: '3px 14px',
    borderRadius: 4,
    background: '#1a2540',
    border: '1px solid #3a5a3c',
    color: '#8aff5c',
    fontSize: 13,
    fontWeight: 600,
  },
  coalitionBadge: {
    padding: '3px 14px',
    borderRadius: 4,
    background: '#1a2540',
    border: '1px solid #2a3a5c',
    color: '#5c8aff',
    fontSize: 13,
    fontWeight: 600,
  },
  supermajorityBadge: {
    background: 'linear-gradient(135deg, #4A148C, #7B1FA2)',
    border: '1px solid #CE93D8',
    color: '#E1BEE7',
    fontWeight: 700,
    boxShadow: '0 0 12px rgba(206,147,216,0.3)',
  },
  minorityHeaderBadge: {
    border: '1px solid #E65100',
    color: '#FFB74D',
  },
  actionBar: {
    maxWidth: 1200,
    margin: '12px auto',
    padding: '0 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  nextTurnBtn: {
    padding: '10px 28px',
    borderRadius: 6,
    background: 'linear-gradient(135deg, #1E88E5, #42A5F5)',
    border: 'none',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 2,
    boxShadow: '0 2px 12px rgba(30,136,229,0.3)',
    transition: 'all 0.15s',
  },
  nextTurnBtnDisabled: {
    background: 'linear-gradient(135deg, #555, #666)',
    boxShadow: 'none',
    opacity: 0.8,
  },
  actionHint: {
    fontSize: 13,
    color: '#666',
  },
  // 推演日志条
  logBar: {
    maxWidth: 1200,
    margin: '0 auto 12px',
    background: '#111827',
    borderRadius: 8,
    border: '1px solid #2a3a5c',
    overflow: 'hidden',
  },
  logBarHeader: {
    padding: '8px 14px',
    borderBottom: '1px solid #1a2540',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  logBarTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#aaa',
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
    background: '#1a2540',
    padding: '1px 6px',
    borderRadius: 3,
    color: '#666',
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
