import React from 'react';
import type { Government, Party, ElectionResult, CoalitionOffer, RelationEntry, CabinetPost } from '../types';
import { CABINET_POST_LABELS } from '../types';
import { calcCoalitionWillingness } from '../engine/governmentEngine';
import { PARLIAMENT_RULES } from '../config/ruleConfig';

interface Props {
  government: Government;
  parties: Party[];
  relations: RelationEntry[];
}

/** 可提供的非首相内阁职位 */
const RECRUITABLE_POSTS: CabinetPost[] = [
  'finance_minister',
  'foreign_minister',
  'defense_minister',
  'health_minister',
  'economy_minister',
];

export const GovernmentPanel: React.FC<Props> = ({ government, parties, relations }) => {
  const partyMap = new Map(parties.map((p) => [p.id, p]));

  const pmParty = partyMap.get(government.primeMinisterPartyId);
  const rulingParties = (government.rulingCoalition
    .map((pid) => partyMap.get(pid))
    .filter(Boolean) as Party[])
    .sort((a, b) => {
      const sa = government.electionResult.partyResults.find((r) => r.partyId === a.id)?.seats ?? 0;
      const sb = government.electionResult.partyResults.find((r) => r.partyId === b.id)?.seats ?? 0;
      return sb - sa;
    });
  const oppositionParties = (government.opposition
    .map((pid) => partyMap.get(pid))
    .filter(Boolean) as Party[])
    .sort((a, b) => {
      const sa = government.electionResult.partyResults.find((r) => r.partyId === a.id)?.seats ?? 0;
      const sb = government.electionResult.partyResults.find((r) => r.partyId === b.id)?.seats ?? 0;
      return sb - sa;
    });

  const coalitionSeats = government.rulingCoalition.reduce((sum, pid) => {
    const r = government.electionResult.partyResults.find((er) => er.partyId === pid);
    return sum + (r?.seats ?? 0);
  }, 0);

  const oppositionSeats = government.opposition.reduce((sum, pid) => {
    const r = government.electionResult.partyResults.find((er) => er.partyId === pid);
    return sum + (r?.seats ?? 0);
  }, 0);

  // 计算各在野党的加入意愿（假设提供 1 个职位）
  const recruitmentProspects = oppositionParties.map((p) => {
    const willingness = calcCoalitionWillingness(
      p,
      pmParty!,
      relations,
      ['finance_minister'],
      coalitionSeats,
      government.electionResult.majorityThreshold,
    );
    return { party: p, willingness };
  }).sort((a, b) => b.willingness - a.willingness);

  // 内阁成员唯一性校验
  const ministerNames = government.ministers.map((m) => m.personName);
  const hasDuplicate = new Set(ministerNames).size !== ministerNames.length;

  return (
    <div style={styles.container}>
      {/* 标题行 */}
      <div style={styles.titleRow}>
        <h2 style={styles.title}>政府 &amp; 内阁</h2>
        {coalitionSeats >= PARLIAMENT_RULES.constitutionalMajorityThreshold && (
          <span style={styles.supermajorityBadge}>绝对多数</span>
        )}
        {government.isMinority && (
          <span style={styles.minorityBadge}>少数政权</span>
        )}
        {hasDuplicate && (
          <span style={{ ...styles.minorityBadge, backgroundColor: '#C62828' }}>内阁异常</span>
        )}
      </div>

      {/* 首相信息 */}
      <div style={styles.pmSection}>
        <div style={styles.pmPortrait}>
          <div style={{
            ...styles.pmCircle,
            borderColor: pmParty?.color ?? '#666',
            boxShadow: `0 0 20px ${pmParty?.color}44`,
          }}>
            <span style={{ color: pmParty?.color ?? '#fff', fontSize: 20, fontWeight: 800 }}>
              {pmParty?.abbreviation ?? '?'}
            </span>
          </div>
        </div>
        <div style={styles.pmInfo}>
          <div style={styles.pmLabel}>内阁总理大臣</div>
          <div style={{ ...styles.pmName, color: pmParty?.color ?? '#fff' }}>
            {government.primeMinisterName}
          </div>
          <div style={styles.pmParty}>
            {pmParty?.name} ({pmParty?.abbreviation})
          </div>
        </div>
        <div style={styles.seatsInfo}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>执政联盟</div>
          <div style={{
            ...styles.seatsValue,
            color: coalitionSeats >= PARLIAMENT_RULES.constitutionalMajorityThreshold
              ? '#FFD600'
              : coalitionSeats >= government.electionResult.majorityThreshold
                ? '#66BB6A'
                : '#EF5350',
          }}>
            {coalitionSeats} / {government.electionResult.totalSeats}
          </div>
          <div style={{ fontSize: 11, color: coalitionSeats >= PARLIAMENT_RULES.constitutionalMajorityThreshold ? '#FFD600' : '#888' }}>
            {coalitionSeats >= PARLIAMENT_RULES.constitutionalMajorityThreshold
              ? `绝对多数 (≥${PARLIAMENT_RULES.constitutionalMajorityThreshold})`
              : `过半需 ${government.electionResult.majorityThreshold}`}
          </div>
        </div>
      </div>

      {/* 内阁稳定度 */}
      <div style={styles.stabilitySection}>
        <div style={styles.stabilityHeader}>
          <span style={styles.stabilityLabel}>内阁稳定度</span>
          <span style={{
            ...styles.stabilityValue,
            color: stabilityColor(government.stability),
          }}>
            {government.stability}
          </span>
        </div>
        <div style={styles.stabilityBarBg}>
          <div style={{
            ...styles.stabilityBar,
            width: `${government.stability}%`,
            backgroundColor: stabilityColor(government.stability),
          }} />
        </div>
        <div style={styles.stabilityDesc}>
          {government.isMinority
            ? `少数政府 — ${stabilityLabel(government.stability)}`
            : stabilityLabel(government.stability)}
        </div>
      </div>

      {/* 执政联盟 vs 在野 */}
      <div style={styles.coalitionSection}>
        <div style={styles.coalitionColumn}>
          <div style={styles.coalitionTitle}>
            <span style={{ color: '#66BB6A' }}>执政联盟</span>
            <span style={styles.coalitionSeats}>{coalitionSeats} 席</span>
          </div>
          {rulingParties.map((p) => {
            const seats = government.electionResult.partyResults.find(
              (r) => r.partyId === p.id,
            )?.seats ?? 0;
            return (
              <div key={p.id} style={styles.partyChip}>
                <div style={{ ...styles.chipDot, backgroundColor: p.color }} />
                <span style={{ color: p.color, fontWeight: 600 }}>{p.name}</span>
                <span style={styles.chipSeats}>{seats} 席</span>
              </div>
            );
          })}
        </div>

        <div style={styles.coalitionDivider} />

        <div style={styles.coalitionColumn}>
          <div style={styles.coalitionTitle}>
            <span style={{ color: '#EF5350' }}>在野势力</span>
            <span style={styles.coalitionSeats}>{oppositionSeats} 席</span>
          </div>
          {oppositionParties.map((p) => {
            const seats = government.electionResult.partyResults.find(
              (r) => r.partyId === p.id,
            )?.seats ?? 0;
            return (
              <div key={p.id} style={styles.partyChip}>
                <div style={{ ...styles.chipDot, backgroundColor: p.color }} />
                <span style={{ color: p.color, fontWeight: 600 }}>{p.name}</span>
                <span style={styles.chipSeats}>{seats} 席</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 席位对比条 */}
      <div style={styles.seatBarSection}>
        <SeatComparisonBar
          rulingParties={rulingParties}
          oppositionParties={oppositionParties}
          electionResult={government.electionResult}
          majorityThreshold={government.electionResult.majorityThreshold}
        />
      </div>

      {/* 内阁成员 */}
      <div style={styles.cabinetSection}>
        <h3 style={styles.sectionTitle}>内阁成员（首相指定）</h3>
        <div style={styles.cabinetGrid}>
          {government.ministers.map((m) => {
            const party = partyMap.get(m.partyId);
            const isPmParty = m.partyId === government.primeMinisterPartyId;
            return (
              <div key={m.post} style={{
                ...styles.ministerCard,
                borderLeftColor: party?.color ?? '#666',
                borderLeftWidth: 3,
                borderLeftStyle: 'solid',
              }}>
                <div style={{
                  ...styles.ministerPost,
                  borderBottomColor: party?.color ?? '#666',
                }}>
                  {CABINET_POST_LABELS[m.post]}
                </div>
                <div style={{ color: party?.color ?? '#ccc', fontWeight: 600, fontSize: 14 }}>
                  {m.personName}
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {party?.abbreviation} · {party?.name}
                </div>
                {!isPmParty && (
                  <div style={{ fontSize: 10, color: '#FF9800', marginTop: 2 }}>
                    联盟指派
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 潜在盟友 — 在野党意愿分析 */}
      <div style={styles.prospectSection}>
        <h3 style={styles.sectionTitle}>潜在盟友（拉拢意愿分析）</h3>
        <p style={styles.prospectDesc}>
          各在野党对加入执政联盟的意愿评估（假设提供 1 个内阁职位）
        </p>
        <div style={styles.prospectList}>
          {recruitmentProspects.map(({ party, willingness }) => (
            <div key={party.id} style={styles.prospectRow}>
              <div style={{ ...styles.prospectDot, backgroundColor: party.color }} />
              <div style={styles.prospectParty}>
                <span style={{ color: party.color, fontWeight: 600 }}>{party.name}</span>
                <span style={{ fontSize: 11, color: '#666', marginLeft: 6 }}>({party.abbreviation})</span>
              </div>
              <div style={styles.willingnessBar}>
                <div style={{
                  ...styles.willingnessFill,
                  width: `${willingness}%`,
                  backgroundColor: willingness >= 45 ? '#66BB6A' : willingness >= 25 ? '#FFA726' : '#EF5350',
                }} />
              </div>
              <span style={{
                ...styles.willingnessValue,
                color: willingness >= 45 ? '#66BB6A' : willingness >= 25 ? '#FFA726' : '#EF5350',
              }}>
                {willingness}%
              </span>
              <span style={{
                ...styles.prospectBadge,
                backgroundColor: willingness >= 45 ? '#1B5E20' : willingness >= 25 ? '#E65100' : '#B71C1C',
              }}>
                {willingness >= 60 ? '可拉拢' : willingness >= 45 ? '有希望' : willingness >= 25 ? '困难' : '不可能'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 招募历史 */}
      {government.coalitionOffers.length > 0 && (
        <div style={styles.negotiationSection}>
          <h3 style={styles.sectionTitle}>招募记录</h3>
          <div style={styles.offerList}>
            {government.coalitionOffers.map((offer) => {
              const party = partyMap.get(offer.partyId);
              return party ? (
                <NegotiationRow key={offer.partyId} offer={offer} party={party} />
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/** 招募记录行 */
const NegotiationRow: React.FC<{ offer: CoalitionOffer; party: Party }> = ({ offer, party }) => (
  <div style={styles.offerRow}>
    <div style={{ ...styles.offerDot, backgroundColor: party.color }} />
    <span style={{ color: party.color, fontWeight: 600, minWidth: 120 }}>{party.name}</span>
    <span style={{ fontSize: 12, color: '#aaa' }}>意愿 {offer.willingness}%</span>
    <span style={{
      ...styles.offerBadge,
      backgroundColor: offer.accepted ? '#2E7D32' : '#C62828',
    }}>
      {offer.accepted ? '已加入' : '拒绝'}
    </span>
    {offer.accepted && offer.demandedPosts.length > 0 && (
      <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>
        获得: {offer.demandedPosts.map((p) => CABINET_POST_LABELS[p]).join(', ')}
      </span>
    )}
  </div>
);

/** 席位对比条 */
const SeatComparisonBar: React.FC<{
  rulingParties: Party[];
  oppositionParties: Party[];
  electionResult: ElectionResult;
  majorityThreshold: number;
}> = ({ rulingParties, oppositionParties, electionResult, majorityThreshold }) => {
  const totalSeats = electionResult.totalSeats;
  const coalitionSeats = rulingParties.reduce((sum, p) => {
    return sum + (electionResult.partyResults.find((r) => r.partyId === p.id)?.seats ?? 0);
  }, 0);
  const hasSupermajority = coalitionSeats >= PARLIAMENT_RULES.constitutionalMajorityThreshold;

  return (
    <div>
      <div style={{ position: 'relative', height: 32, borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
        {rulingParties.map((p) => {
          const seats = electionResult.partyResults.find((r) => r.partyId === p.id)?.seats ?? 0;
          return (
            <div
              key={p.id}
              style={{
                flex: seats,
                backgroundColor: p.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                minWidth: seats > 0 ? 18 : 0,
              }}
            >
              {seats > 5 ? `${p.abbreviation} ${seats}` : seats}
            </div>
          );
        })}
        {oppositionParties.map((p) => {
          const seats = electionResult.partyResults.find((r) => r.partyId === p.id)?.seats ?? 0;
          return (
            <div
              key={p.id}
              style={{
                flex: seats,
                backgroundColor: p.color,
                opacity: 0.45,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                minWidth: seats > 0 ? 18 : 0,
              }}
            >
              {seats > 5 ? `${p.abbreviation} ${seats}` : seats}
            </div>
          );
        })}
      </div>
      {/* 阈值线 */}
      <div style={{ position: 'relative', height: 2, backgroundColor: '#333', marginTop: 2 }}>
        {/* 过半线 (黄色) */}
        <div style={{
          position: 'absolute',
          left: `${(majorityThreshold / totalSeats) * 100}%`,
          top: -4,
          width: 2,
          height: 10,
          backgroundColor: '#FFD600',
        }} />
        <div style={{
          position: 'absolute',
          left: `${(majorityThreshold / totalSeats) * 100}%`,
          top: 12,
          transform: 'translateX(-50%)',
          fontSize: 10,
          color: '#FFD600',
          fontWeight: 600,
        }}>
          过半线 {majorityThreshold}
        </div>
        {/* 绝对多数线 (紫色，2/3=134) */}
        <div style={{
          position: 'absolute',
          left: `${(PARLIAMENT_RULES.constitutionalMajorityThreshold / totalSeats) * 100}%`,
          top: -4,
          width: 2,
          height: 10,
          backgroundColor: '#CE93D8',
        }} />
        <div style={{
          position: 'absolute',
          left: `${(PARLIAMENT_RULES.constitutionalMajorityThreshold / totalSeats) * 100}%`,
          top: 24,
          transform: 'translateX(-50%)',
          fontSize: 10,
          color: '#CE93D8',
          fontWeight: 600,
        }}>
          绝对多数 {PARLIAMENT_RULES.constitutionalMajorityThreshold}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 26, fontSize: 11 }}>
        <span style={{ color: '#66BB6A' }}>执政联盟（不透明）</span>
        <span style={{ color: '#999' }}>在野势力（半透明）</span>
        {hasSupermajority && (
          <span style={{ color: '#CE93D8', fontWeight: 700 }}>
            ★ 绝对多数 — 可修宪 / Fast Track
          </span>
        )}
      </div>
    </div>
  );
};

// ===== Helpers =====

function stabilityColor(val: number): string {
  if (val >= 70) return '#66BB6A';
  if (val >= 40) return '#FFA726';
  return '#EF5350';
}

function stabilityLabel(val: number): string {
  if (val >= 80) return '政权稳固 — 执政联盟团结一致';
  if (val >= 60) return '基本稳定 — 偶有小摩擦但大局可控';
  if (val >= 40) return '脆弱平衡 — 随时可能出现倒阁危机';
  if (val >= 20) return '危机状态 — 联盟濒临崩溃';
  return '风雨飘摇 — 政府随时可能倒台';
}

// ===== Styles =====

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#1a1a2e',
    borderRadius: 12,
    padding: 24,
    color: '#e0e0e0',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 20,
    color: '#fff',
  },
  minorityBadge: {
    padding: '3px 12px',
    borderRadius: 4,
    backgroundColor: '#E65100',
    color: '#FFD54F',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
  },
  supermajorityBadge: {
    padding: '3px 12px',
    borderRadius: 4,
    background: 'linear-gradient(135deg, #7B1FA2, #CE93D8)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
    boxShadow: '0 0 12px rgba(206,147,216,0.4)',
  },
  pmSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    marginTop: 20,
    padding: '16px 20px',
    background: '#16213e',
    borderRadius: 10,
    border: '1px solid #2a3a5c',
  },
  pmPortrait: {
    display: 'flex',
    alignItems: 'center',
  },
  pmCircle: {
    width: 68,
    height: 68,
    borderRadius: '50%',
    border: '3px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.3)',
  },
  pmInfo: {
    flex: 1,
  },
  pmLabel: {
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  pmName: {
    fontSize: 24,
    fontWeight: 800,
    margin: '2px 0',
  },
  pmParty: {
    fontSize: 13,
    color: '#aaa',
  },
  seatsInfo: {
    textAlign: 'right',
    minWidth: 90,
  },
  seatsValue: {
    fontSize: 22,
    fontWeight: 800,
  },
  stabilitySection: {
    marginTop: 20,
    padding: '12px 16px',
    background: '#16213e',
    borderRadius: 8,
  },
  stabilityHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  stabilityLabel: {
    fontSize: 13,
    color: '#aaa',
  },
  stabilityValue: {
    fontSize: 20,
    fontWeight: 800,
  },
  stabilityBarBg: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  stabilityBar: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.5s',
  },
  stabilityDesc: {
    fontSize: 12,
    color: '#888',
    marginTop: 6,
  },
  coalitionSection: {
    display: 'flex',
    gap: 16,
    marginTop: 20,
  },
  coalitionColumn: {
    flex: 1,
    background: '#16213e',
    borderRadius: 8,
    padding: '12px 16px',
  },
  coalitionTitle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    fontSize: 14,
    fontWeight: 700,
  },
  coalitionSeats: {
    fontSize: 13,
    color: '#aaa',
    fontWeight: 600,
  },
  coalitionDivider: {
    width: 1,
    backgroundColor: '#333',
  },
  partyChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    borderBottom: '1px solid #222',
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  chipSeats: {
    marginLeft: 'auto',
    fontSize: 12,
    color: '#888',
  },
  seatBarSection: {
    marginTop: 20,
  },
  cabinetSection: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#ccc',
    marginBottom: 12,
    borderBottom: '1px solid #333',
    paddingBottom: 6,
  },
  cabinetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 10,
  },
  ministerCard: {
    background: '#16213e',
    borderRadius: 8,
    padding: '10px 14px',
  },
  ministerPost: {
    fontSize: 11,
    color: '#888',
    borderBottom: '2px solid',
    paddingBottom: 4,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  prospectSection: {
    marginTop: 24,
  },
  prospectDesc: {
    fontSize: 12,
    color: '#666',
    margin: '0 0 10px',
  },
  prospectList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  prospectRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: '#16213e',
    borderRadius: 6,
    fontSize: 13,
  },
  prospectDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  prospectParty: {
    minWidth: 140,
  },
  willingnessBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
    maxWidth: 140,
  },
  willingnessFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.3s',
  },
  willingnessValue: {
    fontSize: 13,
    fontWeight: 700,
    minWidth: 36,
    textAlign: 'right',
  },
  prospectBadge: {
    padding: '2px 10px',
    borderRadius: 4,
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    minWidth: 50,
    textAlign: 'center',
  },
  negotiationSection: {
    marginTop: 24,
  },
  offerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  offerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: '#16213e',
    borderRadius: 6,
    fontSize: 13,
  },
  offerDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
  },
  offerBadge: {
    padding: '2px 10px',
    borderRadius: 4,
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    minWidth: 50,
    textAlign: 'center',
  },
};
