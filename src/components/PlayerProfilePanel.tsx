import React from 'react';
import type { PlayerConfig, Party } from '../types';
import { PERSONALITY_TRAIT_LABELS, POLITICAL_IDEOLOGY_LABELS, derivePlayerAbilities } from '../types';

interface PlayerProfilePanelProps {
  playerConfig: PlayerConfig;
  party: Party | undefined;
  playerStress: number;
  playerHealth: number;
  onClose: () => void;
}

function traitBar(label: string, value: number, color: string): React.ReactNode {
  const desc = value >= 80 ? '极高' : value >= 60 ? '高' : value >= 40 ? '中' : value >= 20 ? '低' : '极低';
  const formattedValue = Math.round(value * 10) / 10;
  return (
    <div style={mpStyles.traitRow} key={label}>
      <span style={mpStyles.traitLabel}>{label}</span>
      <div style={mpStyles.traitBarWrap}>
        <div style={{ ...mpStyles.traitBar, width: `${value}%`, background: color }} />
      </div>
      <span style={mpStyles.traitValue}>{formattedValue.toFixed(1)}</span>
      <span style={mpStyles.traitDesc}>{desc}</span>
    </div>
  );
}

const getEconomicLabel = (v: number) => {
  if (v < -50) return '极左';
  if (v < -10) return '左';
  if (v < 10) return '中间';
  if (v < 50) return '右';
  return '极右';
};

const getSocialLabel = (v: number) => {
  if (v < -50) return '威权';
  if (v < -10) return '保守';
  if (v < 10) return '自由';
  if (v < 50) return '进步';
  return '激进自由';
};

export const PlayerProfilePanel: React.FC<PlayerProfilePanelProps> = ({
  playerConfig,
  party,
  playerStress,
  playerHealth,
  onClose,
}) => {
  const partyColor = party?.color ?? '#5c8aff';
  const abilities = derivePlayerAbilities(playerConfig);

  // 背景超30字简化
  const shortBackground = playerConfig.background.length > 30
    ? playerConfig.background.slice(0, 30) + '...'
    : playerConfig.background;

  // 政治目标超15字简化
  const shortGoal = playerConfig.politicalGoal.length > 15
    ? playerConfig.politicalGoal.slice(0, 15) + '...'
    : playerConfig.politicalGoal;

  return (
    <div style={mpStyles.overlay} onClick={onClose}>
      <div style={mpStyles.panel} onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div style={mpStyles.header}>
          <div style={{ ...mpStyles.avatar, borderColor: partyColor }}>
            <span style={{ color: partyColor, fontWeight: 800, fontSize: 20 }}>
              {(playerConfig.lastName[0] ?? '') + (playerConfig.firstName[0] ?? '')}
            </span>
          </div>
          <div style={mpStyles.headerInfo}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#e0e0e0' }}>
              {playerConfig.lastName} {playerConfig.firstName}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              {party && <span style={{ ...mpStyles.partyTag, background: partyColor }}>{party.abbreviation}</span>}
              {party && <span style={{ color: '#888', fontSize: 13 }}>{party.name}</span>}
              <span style={{ color: '#666', fontSize: 12 }}>·</span>
              <span style={{ color: '#aaa', fontSize: 13 }}>{playerConfig.age}岁</span>
              <span style={{ color: '#666', fontSize: 12 }}>·</span>
              <span style={{ color: '#aaa', fontSize: 13 }}>{playerConfig.gender === 'male' ? '男' : '女'}</span>
            </div>
          </div>
          <button style={mpStyles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* 角色标签 */}
        <div style={mpStyles.roleRow}>
          <span style={mpStyles.roleBadge}>新晋议员</span>
        </div>

        {/* 背景 */}
        {shortBackground && (
          <div style={mpStyles.section}>
            <div style={mpStyles.sectionTitle}>背景</div>
            <div style={mpStyles.narrative}>{shortBackground}</div>
          </div>
        )}

        {/* 履历（简化版） */}
        <div style={mpStyles.section}>
          <div style={mpStyles.sectionTitle}>履历</div>
          <div style={mpStyles.detailGrid}>
            <div style={mpStyles.detailItem}>
              <span style={mpStyles.detailLabel}>年龄</span>
              <span style={mpStyles.detailValue}>{playerConfig.age}岁</span>
            </div>
            <div style={mpStyles.detailItem}>
              <span style={mpStyles.detailLabel}>性别</span>
              <span style={mpStyles.detailValue}>{playerConfig.gender === 'male' ? '男' : '女'}</span>
            </div>
            <div style={mpStyles.detailItem}>
              <span style={mpStyles.detailLabel}>党派</span>
              <span style={mpStyles.detailValue}>{party?.name ?? '未知'}</span>
            </div>
          </div>
        </div>

        {/* 政治意识形态 */}
        <div style={mpStyles.section}>
          <div style={mpStyles.sectionTitle}>政治意识形态</div>
          <div style={mpStyles.detailGrid}>
            <div style={mpStyles.detailItem}>
              <span style={mpStyles.detailLabel}>主要意识形态</span>
              <span style={mpStyles.detailValue}>
                {POLITICAL_IDEOLOGY_LABELS[playerConfig.politicalIdeology] ?? playerConfig.politicalIdeology}
              </span>
            </div>
            <div style={mpStyles.detailItem}>
              <span style={mpStyles.detailLabel}>经济立场</span>
              <span style={mpStyles.detailValue}>
                {getEconomicLabel(playerConfig.economicAxis)}
              </span>
            </div>
            <div style={mpStyles.detailItem}>
              <span style={mpStyles.detailLabel}>社会立场</span>
              <span style={mpStyles.detailValue}>
                {getSocialLabel(playerConfig.socialAxis)}
              </span>
            </div>
          </div>
        </div>

        {/* 性格特质 */}
        {playerConfig.personalityTraits.length > 0 && (
          <div style={mpStyles.section}>
            <div style={mpStyles.sectionTitle}>性格特质</div>
            <div style={mpStyles.goalList}>
              {playerConfig.personalityTraits.map((t, i) => (
                <span key={i} style={{
                  ...mpStyles.goalTag,
                  background: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336'][i % 5],
                  color: 'white',
                }}>
                  {PERSONALITY_TRAIT_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 政治能力 */}
        <div style={mpStyles.section}>
          <div style={mpStyles.sectionTitle}>政治能力</div>
          {traitBar('野心', abilities.ambition, partyColor)}
          {traitBar('忠诚', abilities.loyalty, '#66BB6A')}
          {traitBar('腐败倾向', abilities.corruption, '#EF5350')}
          {traitBar('知名度', abilities.popularity, '#42A5F5')}
          {traitBar('媒体技巧', abilities.mediaSkill, '#AB47BC')}
          {traitBar('谈判技巧', abilities.negotiationSkill, '#26A69A')}
        </div>

        {/* 当前状态 */}
        <div style={mpStyles.section}>
          <div style={mpStyles.sectionTitle}>当前状态</div>
          <div style={{ display: 'flex', gap: 16, flexDirection: 'column' }}>
            {traitBar('压力指数', playerStress, '#EF5350')}
            {traitBar('健康指数', playerHealth, '#66BB6A')}
          </div>
        </div>

        {/* 政治目标 */}
        {shortGoal && (
          <div style={mpStyles.section}>
            <div style={mpStyles.sectionTitle}>政治目标</div>
            <div style={mpStyles.narrative}>{shortGoal}</div>
          </div>
        )}
      </div>
    </div>
  );
};

const mpStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)',
  },
  panel: {
    width: 440, maxHeight: '85vh', background: 'linear-gradient(180deg, #0d1b2a 0%, #1b2838 100%)',
    borderRadius: 12, border: '1px solid #2a3a5c', overflowY: 'auto', padding: 20,
  },
  header: { display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 },
  avatar: {
    width: 52, height: 52, borderRadius: '50%', border: '2px solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    background: 'rgba(0,0,0,0.3)',
  },
  headerInfo: { flex: 1, minWidth: 0 },
  closeBtn: {
    background: 'none', border: 'none', color: '#666', fontSize: 20, cursor: 'pointer',
    padding: '4px 8px', borderRadius: 4,
  },
  partyTag: {
    padding: '2px 10px', borderRadius: 3, color: '#fff', fontSize: 11, fontWeight: 700,
  },
  roleRow: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  roleBadge: {
    padding: '2px 8px', borderRadius: 3, border: '1px solid #FFD600', color: '#FFD600',
    fontSize: 11, fontWeight: 600,
  },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 12, color: '#888', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 8 },
  narrative: { fontSize: 13, color: '#bbb', lineHeight: 1.7, background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 6 },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' },
  detailItem: { display: 'flex', gap: 6, fontSize: 12 },
  detailLabel: { color: '#666', fontWeight: 600, minWidth: 48 },
  detailValue: { color: '#bbb' },
  traitRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  traitLabel: { fontSize: 11, color: '#777', fontWeight: 600, width: 55, flexShrink: 0 },
  traitBarWrap: { flex: 1, height: 6, background: '#1a1a2e', borderRadius: 3, overflow: 'hidden' },
  traitBar: { height: '100%', borderRadius: 3, transition: 'width 0.3s' },
  traitValue: { fontSize: 11, color: '#aaa', fontWeight: 700, width: 24, textAlign: 'right' as const, flexShrink: 0 },
  traitDesc: { fontSize: 10, color: '#555', width: 24, flexShrink: 0 },
  goalList: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  goalTag: {
    padding: '3px 10px', borderRadius: 4, border: '1px solid #3a4a6a', background: '#1a2540',
    color: '#8ab4ff', fontSize: 11,
  },
};
