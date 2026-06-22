import React from 'react';
import type { PlayerConfig, Party } from '../types';
import { PERSONALITY_TRAIT_LABELS, POLITICAL_IDEOLOGY_LABELS, derivePlayerAbilities } from '../types';
import './PlayerProfilePanel.css';

interface PlayerProfilePanelProps {
  playerConfig: PlayerConfig;
  party: Party | undefined;
  playerStress: number;
  playerHealth: number;
  onClose: () => void;
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

const TRAIT_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'];

export const PlayerProfilePanel: React.FC<PlayerProfilePanelProps> = ({
  playerConfig,
  party,
  playerStress,
  playerHealth,
  onClose,
}) => {
  const partyColor = party?.color ?? '#5c8aff';
  const abilities = derivePlayerAbilities(playerConfig);

  const renderTraitBar = (label: string, value: number, color: string) => {
    const desc = value >= 80 ? '极高' : value >= 60 ? '高' : value >= 40 ? '中' : value >= 20 ? '低' : '极低';
    const formattedValue = Math.round(value * 10) / 10;
    return (
      <div className="playerProfile-traitRow" key={label}>
        <span className="playerProfile-traitLabel">{label}</span>
        <div className="playerProfile-traitBarWrap">
          <div className="playerProfile-traitBar" style={{ width: `${value}%`, background: color }} />
        </div>
        <span className="playerProfile-traitValue">{formattedValue.toFixed(1)}</span>
        <span className="playerProfile-traitDesc">{desc}</span>
      </div>
    );
  };

  return (
    <>
    <div className="playerProfile-overlay">
      {/* 顶部占位条 */}
      <div className="playerProfile-topRow" />

      {/* 标题区 */}
      <div className="playerProfile-titleSection">
        <div className="playerProfile-decorLine playerProfile-decorLineTop" />
        <h1 className="playerProfile-title" data-text="个人档案">个人档案</h1>
        <div className="playerProfile-subtitle">ABSOLUTE MAJORITY · PROFILE</div>
        <div className="playerProfile-decorLine playerProfile-decorLineBottom" />
      </div>

      {/* 主内容区 */}
      <div className="playerProfile-content">
        {/* 头部卡片 */}
        <div className="playerProfile-headerCard" style={{ ['--party-color' as string]: partyColor }}>
          <div className="playerProfile-headerLeft">
            <div
              className="playerProfile-avatar"
              style={{ borderColor: partyColor, boxShadow: `0 0 28px ${partyColor}55` }}
            >
              <span style={{ color: partyColor }}>
                {(playerConfig.lastName[0] ?? '') + (playerConfig.firstName[0] ?? '')}
              </span>
            </div>
            <div className="playerProfile-headerInfo">
              <div className="playerProfile-playerTitle">众议院议员 · MEMBER OF THE DIET</div>
              <div className="playerProfile-playerName">
                {playerConfig.lastName} {playerConfig.firstName}
              </div>
              <div className="playerProfile-metaRow">
                {party && (
                  <span className="playerProfile-partyChip" style={{ background: partyColor }}>
                    {party.abbreviation}
                  </span>
                )}
                {party && <span className="playerProfile-partyName">{party.name}</span>}
                <span className="playerProfile-divider">·</span>
                <span className="playerProfile-metaValue">{playerConfig.age}岁</span>
                <span className="playerProfile-divider">·</span>
                <span className="playerProfile-metaValue">{playerConfig.gender === 'male' ? '男' : '女'}</span>
              </div>
              <div className="playerProfile-roleRow">
                <span className="playerProfile-roleBadge">新晋议员 · FRESHMAN</span>
              </div>
            </div>
          </div>
        </div>

        {/* 两栏布局 */}
        <div className="playerProfile-grid">
          {/* 左栏 */}
          <div className="playerProfile-col">
            <div className="playerProfile-section">
              <div className="playerProfile-sectionTitle">
                <span className="playerProfile-sectionBullet" />
                背景 · BACKGROUND
              </div>
              <div className="playerProfile-narrative">{playerConfig.background}</div>
            </div>

            <div className="playerProfile-section">
              <div className="playerProfile-sectionTitle">
                <span className="playerProfile-sectionBullet" />
                履历 · CAREER
              </div>
              <div className="playerProfile-detailGrid">
                <div className="playerProfile-detailItem">
                  <span className="playerProfile-detailLabel">年龄</span>
                  <span className="playerProfile-detailValue">{playerConfig.age} 岁</span>
                </div>
                <div className="playerProfile-detailItem">
                  <span className="playerProfile-detailLabel">性别</span>
                  <span className="playerProfile-detailValue">{playerConfig.gender === 'male' ? '男' : '女'}</span>
                </div>
                <div className="playerProfile-detailItem">
                  <span className="playerProfile-detailLabel">所属党派</span>
                  <span className="playerProfile-detailValue">{party?.name ?? '未知'}</span>
                </div>
                <div className="playerProfile-detailItem">
                  <span className="playerProfile-detailLabel">党派简称</span>
                  <span className="playerProfile-detailValue">{party?.abbreviation ?? '—'}</span>
                </div>
              </div>
            </div>

            <div className="playerProfile-section">
              <div className="playerProfile-sectionTitle">
                <span className="playerProfile-sectionBullet" />
                政治意识形态 · IDEOLOGY
              </div>
              <div className="playerProfile-detailGrid">
                <div className="playerProfile-detailItem">
                  <span className="playerProfile-detailLabel">主要意识形态</span>
                  <span className="playerProfile-detailValue">
                    {POLITICAL_IDEOLOGY_LABELS[playerConfig.politicalIdeology] ?? playerConfig.politicalIdeology}
                  </span>
                </div>
                <div className="playerProfile-detailItem">
                  <span className="playerProfile-detailLabel">经济立场</span>
                  <span className="playerProfile-detailValue">
                    {getEconomicLabel(playerConfig.economicAxis)}（{playerConfig.economicAxis}）
                  </span>
                </div>
                <div className="playerProfile-detailItem">
                  <span className="playerProfile-detailLabel">社会立场</span>
                  <span className="playerProfile-detailValue">
                    {getSocialLabel(playerConfig.socialAxis)}（{playerConfig.socialAxis}）
                  </span>
                </div>
              </div>
            </div>

            {playerConfig.personalityTraits.length > 0 && (
              <div className="playerProfile-section">
                <div className="playerProfile-sectionTitle">
                  <span className="playerProfile-sectionBullet" />
                  性格特质 · TRAITS
                </div>
                <div className="playerProfile-traitList">
                  {playerConfig.personalityTraits.map((t, i) => (
                    <span
                      key={i}
                      className="playerProfile-traitChip"
                      style={{
                        background: `${TRAIT_COLORS[i % TRAIT_COLORS.length]}33`,
                        borderColor: TRAIT_COLORS[i % TRAIT_COLORS.length],
                        color: TRAIT_COLORS[i % TRAIT_COLORS.length],
                      }}
                    >
                      {PERSONALITY_TRAIT_LABELS[t] ?? t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右栏 */}
          <div className="playerProfile-col">
            <div className="playerProfile-section">
              <div className="playerProfile-sectionTitle">
                <span className="playerProfile-sectionBullet" />
                政治目标 · GOAL
              </div>
              <div className="playerProfile-narrative">{playerConfig.politicalGoal}</div>
            </div>

            <div className="playerProfile-section">
              <div className="playerProfile-sectionTitle">
                <span className="playerProfile-sectionBullet" />
                政治能力 · ABILITIES
              </div>
              <div className="playerProfile-traitBlock">
                {renderTraitBar('野心', abilities.ambition, partyColor)}
                {renderTraitBar('忠诚', abilities.loyalty, '#66BB6A')}
                {renderTraitBar('腐败倾向', abilities.corruption, '#EF5350')}
                {renderTraitBar('知名度', abilities.popularity, '#42A5F5')}
                {renderTraitBar('媒体技巧', abilities.mediaSkill, '#AB47BC')}
                {renderTraitBar('谈判技巧', abilities.negotiationSkill, '#26A69A')}
              </div>
            </div>

            <div className="playerProfile-section">
              <div className="playerProfile-sectionTitle">
                <span className="playerProfile-sectionBullet" />
                当前状态 · STATUS
              </div>
              <div className="playerProfile-traitBlock">
                {renderTraitBar('压力指数', playerStress, '#EF5350')}
                {renderTraitBar('健康指数', playerHealth, '#66BB6A')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* 关闭按钮：作为 overlay 的兄弟节点（而非子节点），脱离 backdrop-filter 包含块，
        确保 position:fixed 相对视口定位，不随内容滚动 */}
    <button className="playerProfile-closeBtn" onClick={onClose} title="关闭" aria-label="关闭">
      ✕
    </button>
    </>
  );
};
