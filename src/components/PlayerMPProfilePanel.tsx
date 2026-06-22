import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerConfig, Party } from '../types';
import {
  PERSONALITY_TRAIT_LABELS,
  POLITICAL_IDEOLOGY_LABELS,
  derivePlayerAbilities,
} from '../types';

/**
 * 国会局势界面用的玩家资料弹窗。
 * 与 CommitteeDashboard 中其他议员的 MPProfilePanel 视觉保持一致（440px 居中弹窗），
 * 区别于事务所的全屏 PlayerProfilePanel。
 */

interface PlayerMPProfilePanelProps {
  playerConfig: PlayerConfig;
  party: Party | undefined;
  playerStress: number;
  playerHealth: number;
  onClose: () => void;
}

const FONT_SERIF = '"Noto Serif SC", "Source Han Serif SC", Georgia, serif';
const COLOR_BORDER = 'rgba(192, 168, 130, 0.18)';
// 与游戏其它面板标题（委员会一览、法案追踪、推演日志条目等）保持同色系
const COLOR_GOLD = '#C0A882';
const COLOR_GOLD_DIM = '#B8A47C';

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    backdropFilter: 'blur(4px)',
  },
  panel: {
    width: 440,
    maxHeight: '85vh',
    background: 'rgba(0,0,0,0.65)',
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER}`,
    overflowY: 'auto',
    padding: 20,
    backdropFilter: 'blur(12px)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    // 弹窗通过 Portal 挂到 body，不会继承 .sit-app 的字体；这里显式声明，
    // 让姓名、标签、能力名、目标等所有子节点都使用与主界面一致的衬线字体
    fontFamily: FONT_SERIF,
  },
  header: { display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: 'rgba(0,0,0,0.3)',
  },
  headerInfo: { flex: 1, minWidth: 0 },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#666',
    fontSize: 20,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 4,
  },
  partyTag: {
    padding: '2px 10px',
    borderRadius: 3,
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
  },
  roleRow: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  roleBadge: {
    padding: '2px 8px',
    borderRadius: 3,
    border: '1px solid #FFD600',
    color: '#FFD600',
    fontSize: 11,
    fontWeight: 600,
  },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 12,
    color: COLOR_GOLD_DIM,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    marginBottom: 8,
    fontFamily: FONT_SERIF,
  },
  narrative: {
    fontSize: 13,
    color: '#bbb',
    lineHeight: 1.7,
    background: 'rgba(0,0,0,0.2)',
    padding: '8px 12px',
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER}`,
  },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' },
  detailItem: { display: 'flex', gap: 6, fontSize: 12 },
  detailLabel: { color: '#666', fontWeight: 600, minWidth: 48 },
  detailValue: { color: '#bbb' },
  traitRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  traitLabel: { fontSize: 11, color: '#777', fontWeight: 600, width: 55, flexShrink: 0 },
  traitBarWrap: {
    flex: 1,
    height: 6,
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  traitBar: { height: '100%', borderRadius: 3, transition: 'width 0.3s' },
  traitValue: {
    fontSize: 11,
    color: '#aaa',
    fontWeight: 700,
    width: 24,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  traitDesc: { fontSize: 10, color: '#555', width: 24, flexShrink: 0 },
  goalList: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  goalTag: {
    padding: '3px 10px',
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER}`,
    background: 'rgba(0,0,0,0.3)',
    color: '#8ab4ff',
    fontSize: 11,
  },
  // 可展开行：截断文本 + ▼ 按钮
  expandableRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
  },
  expandArrowBtn: {
    background: 'none',
    border: 'none',
    color: COLOR_GOLD,
    fontSize: 11,
    cursor: 'pointer',
    padding: '8px 4px 8px 0',
    flexShrink: 0,
    lineHeight: 1,
    fontFamily: FONT_SERIF,
  },
  // 展开后的二级弹窗（z-index 高于外层面板）
  popupOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2100,
    backdropFilter: 'blur(2px)',
    fontFamily: FONT_SERIF,
  },
  popupBox: {
    width: 380,
    maxHeight: '60vh',
    background: 'rgba(0,0,0,0.85)',
    borderRadius: 6,
    border: `1px solid ${COLOR_BORDER}`,
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  popupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: `1px solid ${COLOR_BORDER}`,
  },
  popupTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: COLOR_GOLD,
    letterSpacing: 1,
  },
  popupCloseBtn: {
    background: 'none',
    border: 'none',
    color: '#666',
    fontSize: 16,
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: 4,
    fontFamily: FONT_SERIF,
  },
  popupBody: {
    padding: '16px',
    fontSize: 13,
    color: '#bbb',
    lineHeight: 1.8,
    overflowY: 'auto',
    maxHeight: '50vh',
    whiteSpace: 'pre-wrap' as const,
  },
};

function traitBar(label: string, value: number, color: string): React.ReactNode {
  const desc = value >= 80 ? '极高' : value >= 60 ? '高' : value >= 40 ? '中' : value >= 20 ? '低' : '极低';
  const formattedValue = Math.round(value * 10) / 10;
  return (
    <div style={styles.traitRow} key={label}>
      <span style={styles.traitLabel}>{label}</span>
      <div style={styles.traitBarWrap}>
        <div style={{ ...styles.traitBar, width: `${value}%`, background: color }} />
      </div>
      <span style={styles.traitValue}>{formattedValue.toFixed(1)}</span>
      <span style={styles.traitDesc}>{desc}</span>
    </div>
  );
}

const economicLabel = (v: number) =>
  v < -50 ? '极左' : v < -10 ? '左' : v < 10 ? '中间' : v < 50 ? '右' : '极右';

const socialLabel = (v: number) =>
  v < -50 ? '威权' : v < -10 ? '保守' : v < 10 ? '自由' : v < 50 ? '进步' : '激进自由';

/**
 * 可展开文本：截断显示一行 + 右侧 ▼ 按钮，点击弹出完整内容到独立二级弹窗。
 * 还原旧版 PlayerProfilePanel 的交互（背景 / 政治目标不直接占满，点击才展开）。
 */
const ExpandableText: React.FC<{
  title: string;
  text: string;
  maxLen: number;
}> = ({ title, text, maxLen }) => {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const truncated = text.length > maxLen ? text.slice(0, maxLen) + '...' : text;

  return (
    <>
      <div style={styles.expandableRow}>
        <div style={{ ...styles.narrative, flex: 1 }}>{truncated}</div>
        <button
          style={styles.expandArrowBtn}
          onClick={() => setExpanded(true)}
          title={`展开${title}`}
          aria-label={`展开${title}`}
        >
          ▼
        </button>
      </div>
      {expanded && (
        <div style={styles.popupOverlay} onClick={() => setExpanded(false)}>
          <div style={styles.popupBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.popupHeader}>
              <span style={styles.popupTitle}>{title}</span>
              <button style={styles.popupCloseBtn} onClick={() => setExpanded(false)}>✕</button>
            </div>
            <div style={styles.popupBody}>{text}</div>
          </div>
        </div>
      )}
    </>
  );
};

export const PlayerMPProfilePanel: React.FC<PlayerMPProfilePanelProps> = ({
  playerConfig,
  party,
  playerStress,
  playerHealth,
  onClose,
}) => {
  const partyColor = party?.color ?? '#5c8aff';
  const abilities = derivePlayerAbilities(playerConfig);
  const initials = (playerConfig.lastName[0] ?? '') + (playerConfig.firstName[0] ?? '');

  const content = (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div style={styles.header}>
          <div style={{ ...styles.avatar, borderColor: partyColor }}>
            <span style={{ color: partyColor, fontWeight: 800, fontSize: 20 }}>{initials}</span>
          </div>
          <div style={styles.headerInfo}>
            <div style={{ fontSize: 20, fontWeight: 800, color: COLOR_GOLD, fontFamily: FONT_SERIF, letterSpacing: 1 }}>
              {playerConfig.lastName} {playerConfig.firstName}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              {party && (
                <span style={{ ...styles.partyTag, background: partyColor }}>{party.abbreviation}</span>
              )}
              {party && <span style={{ color: '#888', fontSize: 13 }}>{party.name}</span>}
              <span style={{ color: '#666', fontSize: 12 }}>·</span>
              <span style={{ color: '#aaa', fontSize: 13 }}>{playerConfig.age}岁</span>
              <span style={{ color: '#666', fontSize: 12 }}>·</span>
              <span style={{ color: '#aaa', fontSize: 13 }}>{playerConfig.gender === 'male' ? '男' : '女'}</span>
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* 角色标签 */}
        <div style={styles.roleRow}>
          <span style={styles.roleBadge}>新晋议员</span>
        </div>

        {/* 背景故事（截断显示 + 点击展开二级弹窗） */}
        {playerConfig.background && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>背景</div>
            <ExpandableText title="背景" text={playerConfig.background} maxLen={30} />
          </div>
        )}

        {/* 履历（玩家无详细背景对象，仅展示基础信息） */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>履历</div>
          <div style={styles.detailGrid}>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>年龄</span>
              <span style={styles.detailValue}>{playerConfig.age} 岁</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>性别</span>
              <span style={styles.detailValue}>{playerConfig.gender === 'male' ? '男' : '女'}</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>所属党派</span>
              <span style={styles.detailValue}>{party?.name ?? '未知'}</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>党派简称</span>
              <span style={styles.detailValue}>{party?.abbreviation ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* 政治意识形态 */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>政治意识形态</div>
          <div style={styles.detailGrid}>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>主要意识形态</span>
              <span style={styles.detailValue}>
                {POLITICAL_IDEOLOGY_LABELS[playerConfig.politicalIdeology] ?? playerConfig.politicalIdeology}
              </span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>经济立场</span>
              <span style={styles.detailValue}>{economicLabel(playerConfig.economicAxis)}</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>社会立场</span>
              <span style={styles.detailValue}>{socialLabel(playerConfig.socialAxis)}</span>
            </div>
          </div>
        </div>

        {/* 性格特质 */}
        {playerConfig.personalityTraits.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>性格特质</div>
            <div style={styles.goalList}>
              {playerConfig.personalityTraits.map((t, i) => (
                <span
                  key={i}
                  style={{
                    ...styles.goalTag,
                    background: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336'][i % 5],
                    color: 'white',
                  }}
                >
                  {PERSONALITY_TRAIT_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 政治能力 */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>政治能力</div>
          {traitBar('野心', abilities.ambition, partyColor)}
          {traitBar('忠诚', abilities.loyalty, '#66BB6A')}
          {traitBar('腐败倾向', abilities.corruption, '#EF5350')}
          {traitBar('知名度', abilities.popularity, '#42A5F5')}
          {traitBar('媒体技巧', abilities.mediaSkill, '#AB47BC')}
          {traitBar('谈判技巧', abilities.negotiationSkill, '#26A69A')}
        </div>

        {/* 当前状态 */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>当前状态</div>
          <div style={{ display: 'flex', gap: 16, flexDirection: 'column' }}>
            {traitBar('压力指数', playerStress, '#EF5350')}
            {traitBar('健康指数', playerHealth, '#66BB6A')}
          </div>
        </div>

        {/* 政治目标（截断显示 + 点击展开二级弹窗） */}
        {playerConfig.politicalGoal && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>政治目标</div>
            <ExpandableText title="政治目标" text={playerConfig.politicalGoal} maxLen={15} />
          </div>
        )}
      </div>
    </div>
  );

  // 通过 Portal 挂到 body，避免国会局势界面 backdrop-filter 堆叠上下文问题
  return createPortal(content, document.body);
};
