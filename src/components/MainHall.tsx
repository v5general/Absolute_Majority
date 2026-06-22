import React from 'react';
import { BackgroundImage } from './BackgroundImage';
import { useGame } from '../hooks/useGameState';
import {
  getCongressSessionByMonth,
  getMonthFromTurn,
  getYearFromTurn,
  PARLIAMENT_RULES,
} from '../config/ruleConfig';
import './MainHall.css';

interface MainHallProps {
  onOpenSituation: () => void;
  onOpenProfile: () => void;
  onOpenParties: () => void;
  onNextTurn: () => void;
  isThinking: boolean;
}

const stabilityLabel = (v: number): string => {
  if (v >= 80) return '政权稳固';
  if (v >= 60) return '基本稳定';
  if (v >= 40) return '脆弱平衡';
  if (v >= 20) return '危机状态';
  return '风雨飘摇';
};

export const MainHall: React.FC<MainHallProps> = ({
  onOpenSituation,
  onOpenProfile,
  onOpenParties,
  onNextTurn,
  isThinking,
}) => {
  const { state } = useGame();

  if (!state.playerConfig) return null;

  const playerParty = state.parties.find(p => p.id === state.playerConfig?.partyId);
  const partyColor = playerParty?.color ?? '#5c8aff';

  const year = getYearFromTurn(state.turn);
  const month = getMonthFromTurn(state.turn);
  const session = getCongressSessionByMonth(month);

  const gov = state.government;
  const totalSeats = gov?.electionResult.totalSeats ?? 200;
  const majorityThreshold = gov?.electionResult.majorityThreshold ?? 101;
  const coalitionSeats = gov
    ? gov.rulingCoalition.reduce((sum, pid) => {
        const r = gov.electionResult.partyResults.find(er => er.partyId === pid);
        return sum + (r?.seats ?? 0);
      }, 0)
    : 0;
  const hasSupermajority = coalitionSeats >= PARLIAMENT_RULES.constitutionalMajorityThreshold;
  const isMinority = gov?.isMinority ?? false;
  const stability = gov?.stability ?? 50;
  const playerPartyId = state.playerConfig.partyId;
  const isRuling = gov?.rulingCoalition.includes(playerPartyId) ?? false;

  const coalitionStatusText = hasSupermajority
    ? '★ 绝对多数'
    : coalitionSeats >= majorityThreshold
      ? isMinority
        ? '少数政府'
        : '过半执政'
      : '在野状态';

  const seatColorClass = hasSupermajority
    ? 'mainHall-statGold'
    : coalitionSeats >= majorityThreshold
      ? 'mainHall-statGreen'
      : 'mainHall-statRed';

  const stabilityColorClass =
    stability >= 70 ? 'mainHall-statGreen' : stability >= 40 ? 'mainHall-statOrange' : 'mainHall-statRed';

  const stabilityBarColor =
    stability >= 70 ? '#66BB6A' : stability >= 40 ? '#FFA726' : '#EF5350';

  return (
    <div className="mainHall-screen">
      <BackgroundImage image="main_hall_bg" className="mainHall-bgImage" />
      <div className="mainHall-vignette" />

      {/* ===== 顶部行：左侧状态徽章 + 右上角玩家档案卡 ===== */}
      <div className="mainHall-topRow">
        <div className="mainHall-badges">
          <div className="mainHall-badge">
            <span className="mainHall-badgeLabel">DATE</span>
            <span className="mainHall-badgeValue">{year}年 · {month}月</span>
            <span className="mainHall-badgeSub">时序</span>
          </div>
          <div className="mainHall-badge mainHall-badgeSession">
            <span className="mainHall-badgeLabel">SESSION</span>
            <span className="mainHall-badgeValue">{session.name}</span>
            <span className="mainHall-badgeSub">会期</span>
          </div>
          <div className="mainHall-badge">
            <span className="mainHall-badgeLabel">TURN</span>
            <span className="mainHall-badgeValue">第 {state.turn} 回合</span>
            <span className="mainHall-badgeSub">回合数</span>
          </div>
        </div>

        {/* 玩家档案卡（右上角，点击打开个人档案） */}
        <button
          className="mainHall-playerCard"
          onClick={onOpenProfile}
          title="查看个人档案"
        >
          <div
            className="mainHall-playerAvatar"
            style={{ borderColor: partyColor, boxShadow: `0 0 20px ${partyColor}55` }}
          >
            <span style={{ color: partyColor }}>
              {state.playerConfig.lastName[0] ?? ''}
            </span>
          </div>
          <div className="mainHall-playerInfo">
            <div className="mainHall-playerTitle">众议院议员 · MEMBER OF THE DIET</div>
            <div className="mainHall-playerName">
              {state.playerConfig.lastName} {state.playerConfig.firstName}
            </div>
            <div className="mainHall-playerParty">
              <span className="mainHall-partyDot" style={{ background: partyColor }} />
              <span className="mainHall-partyName" style={{ color: partyColor }}>
                {playerParty?.name}
              </span>
              <span className="mainHall-partyAbbr">({playerParty?.abbreviation})</span>
              <span className={`mainHall-statusTag ${isRuling ? 'mainHall-statusRuling' : 'mainHall-statusOpposition'}`}>
                {isRuling ? '◆ 执政' : '◇ 在野'}
              </span>
            </div>
          </div>
        </button>
      </div>

      {/* ===== 居中标题 ===== */}
      <div className="mainHall-titleSection">
        <div className="mainHall-decorLine mainHall-decorLineTop" />
        <h1 className="mainHall-title" data-text="事务所">事务所</h1>
        <div className="mainHall-subtitle">ABSOLUTE MAJORITY · FIRM</div>
        <div className="mainHall-decorLine mainHall-decorLineBottom" />
      </div>

      {/* ===== 两侧加点延伸式标注 ===== */}
      <div className="mainHall-annotations">
        {/* 左侧标注 */}
        <div className="mainHall-annotationCol mainHall-annotationLeft">
          <div className="mainHall-annotation">
            <button className="mainHall-annotationBtn" onClick={onOpenSituation}>
              <span className="mainHall-annotationIcon">▶</span>
              <div className="mainHall-annotationText">
                <span className="mainHall-annotationLabel">国会局势</span>
                <span className="mainHall-annotationSub">SITUATION</span>
              </div>
            </button>
            <span className="mainHall-annotationLine" />
            <span className="mainHall-annotationDot" />
          </div>

          <div className="mainHall-annotation">
            <div className="mainHall-annotationStatBox">
              <div className="mainHall-annotationStatLabel">联盟席位 · SEATS</div>
              <div className={`mainHall-annotationStatValue ${seatColorClass}`}>
                {coalitionSeats}
                <span className="mainHall-statDenom">/ {totalSeats}</span>
              </div>
              <div className="mainHall-annotationStatHint">{coalitionStatusText}</div>
            </div>
            <span className="mainHall-annotationLine" />
            <span className="mainHall-annotationDot" />
          </div>

          <div className="mainHall-annotation">
            <div className="mainHall-annotationStatBox">
              <div className="mainHall-annotationStatLabel">距大选 · ELECTION</div>
              <div className="mainHall-annotationStatValue mainHall-statGold">
                {state.turnsUntilElection ?? 48}
                <span className="mainHall-statDenom"> 回合</span>
              </div>
              <div className="mainHall-annotationStatHint">任期倒计时</div>
            </div>
            <span className="mainHall-annotationLine" />
            <span className="mainHall-annotationDot" />
          </div>
        </div>

        {/* 右侧标注 */}
        <div className="mainHall-annotationCol mainHall-annotationRight">
          <div className="mainHall-annotation">
            <span className="mainHall-annotationDot" />
            <span className="mainHall-annotationLine" />
            <button className="mainHall-annotationBtn" onClick={onOpenParties}>
              <div className="mainHall-annotationText">
                <span className="mainHall-annotationLabel">党派一览</span>
                <span className="mainHall-annotationSub">PARTIES</span>
              </div>
              <span className="mainHall-annotationIcon">◆</span>
            </button>
          </div>

          <div className="mainHall-annotation">
            <span className="mainHall-annotationDot" />
            <span className="mainHall-annotationLine" />
            <div className="mainHall-annotationStatBox mainHall-annotationStatBoxRight">
              <div className="mainHall-annotationStatLabel">内阁稳定 · STABILITY</div>
              <div className={`mainHall-annotationStatValue ${stabilityColorClass}`}>
                {stability}
              </div>
              <div className="mainHall-statBar">
                <div
                  className="mainHall-statBarFill"
                  style={{ width: `${stability}%`, background: stabilityBarColor }}
                />
              </div>
              <div className="mainHall-annotationStatHint">{stabilityLabel(stability)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 中央主操作：推进一回合 ===== */}
      <div className="mainHall-nextTurnWrap">
        <button
          className={`mainHall-nextTurnBtn ${isThinking ? 'mainHall-nextTurnBtnDisabled' : ''}`}
          onClick={onNextTurn}
          disabled={isThinking}
        >
          <span className="mainHall-nextTurnArrow">▶▶</span>
          <span className="mainHall-nextTurnLabel">
            {isThinking ? 'AI 推演中' : '推进一回合'}
          </span>
          <span className="mainHall-nextTurnSub">
            {isThinking ? 'COMPUTING' : 'ADVANCE TURN'}
          </span>
        </button>
      </div>

      {/* ===== 底部会期信息 ===== */}
      <div className="mainHall-sessionInfo">
        <div className="mainHall-sessionHeader">
          <span className="mainHall-sessionBullet" />
          <span className="mainHall-sessionTitle">本期要务 · CURRENT FOCUS</span>
        </div>
        <div className="mainHall-sessionText">{session.gameplay}</div>
      </div>
    </div>
  );
};
