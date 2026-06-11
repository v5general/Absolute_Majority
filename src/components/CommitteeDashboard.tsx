import React, { useState } from 'react';
import type { Committee, Bill, Party, RelationEntry, MPPersonality, CommitteeMember } from '../types';
import { COMMITTEE_LABELS, BILL_STATUS_LABELS } from '../types';
import { getBackgroundNarrative } from '../engine/backgroundEngine';
import { PERSONALITY_TRAIT_LABELS, POLITICAL_IDEOLOGY_LABELS } from '../types/mp';

interface Props {
  committees: Committee[];
  bills: Bill[];
  parties: Party[];
  relations: RelationEntry[];
  mpPersonalities: Record<string, MPPersonality>;
}

// ===== 意识形态 & 背景标签 =====

const IDEOLOGY_LABELS: Record<string, string> = {
  'far-left': '极左', 'left': '左翼', 'center-left': '中左', 'center': '中间',
  'center-right': '中右', 'right': '右翼', 'far-right': '极右',
};

const ORIGIN_LABELS: Record<string, string> = {
  political_family: '政治世家', bureaucrat_family: '官僚世家', business_family: '企业家家族',
  union_cadre: '工会干部', lawyer: '律师', professor: '学者',
  journalist: '记者', grassroots_activist: '基层活动家', salaryman: '普通上班族', other: '其他',
};

const EDUCATION_LABELS: Record<string, string> = {
  top_university: '东京大学级别', private_elite: '早稻田/庆应级别',
  national_university: '国立大学', regional_university: '地方大学', other: '其他',
};

const SOCIAL_LABELS: Record<string, string> = {
  upper: '上层', upper_middle: '中上', middle: '中间', lower_middle: '中下', working: '工人阶级',
};

const GOAL_LABELS: Record<string, string> = {
  become_prime_minister: '成为首相', become_finance_minister: '成为财务大臣',
  become_foreign_minister: '成为外务大臣', become_defense_minister: '成为防卫大臣',
  become_health_minister: '成为厚劳大臣', become_economy_minister: '成为经产大臣',
  become_chief_secretary: '成为官房长官', destroy_rival_faction: '消灭敌对派系',
  expand_faction: '扩张派系', pass_tax_reform: '推动税制改革',
  pass_labor_reform: '推动劳动改革', pass_defense_reform: '推动防卫改革',
  pass_healthcare_reform: '推动医疗改革', maintain_status_quo: '维持现状',
  gain_media_attention: '获取媒体关注', accumulate_wealth: '积累财富',
  seek_cabinet: '谋求内阁职位',
};

function traitBar(label: string, value: number, color: string): React.ReactNode {
  const desc = value >= 80 ? '极高' : value >= 60 ? '高' : value >= 40 ? '中' : value >= 20 ? '低' : '极低';
  const formattedValue = Math.round(value * 10) / 10; // 格式化为1位小数
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

// ===== 议员资料面板 =====
const MPProfilePanel: React.FC<{
  personality: MPPersonality;
  party: Party;
  onClose: () => void;
}> = ({ personality, party, onClose }) => {
  const bg = personality.background;
  const narrative = bg ? getBackgroundNarrative(bg) : '';

  return (
    <div style={mpStyles.overlay} onClick={onClose}>
      <div style={mpStyles.panel} onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div style={mpStyles.header}>
          <div style={{ ...mpStyles.avatar, borderColor: party.color }}>
            <span style={{ color: party.color, fontWeight: 800, fontSize: 20 }}>{personName}</span>
          </div>
          <div style={mpStyles.headerInfo}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#e0e0e0' }}>{personality.personName}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <span style={{ ...mpStyles.partyTag, background: party.color }}>{party.abbreviation}</span>
              <span style={{ color: '#888', fontSize: 13 }}>{party.name}</span>
              <span style={{ color: '#666', fontSize: 12 }}>·</span>
              <span style={{ color: '#aaa', fontSize: 13 }}>{personality.age}岁</span>
              <span style={{ color: '#666', fontSize: 12 }}>·</span>
              <span style={{ color: '#aaa', fontSize: 13 }}>{personality.gender === 'male' ? '男' : '女'}</span>
            </div>
          </div>
          <button style={mpStyles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* 角色标签 */}
        <div style={mpStyles.roleRow}>
          {personality.isLeader && <span style={mpStyles.roleBadge}>党首</span>}
          {personality.isMinister && <span style={mpStyles.roleBadge}>内阁大臣</span>}
          {personality.isCommitteeChairman && <span style={mpStyles.roleBadge}>委员长</span>}
          {personality.factionId && <span style={mpStyles.roleBadge}>派系成员</span>}
        </div>

        {/* 背景故事 */}
        {narrative && (
          <div style={mpStyles.section}>
            <div style={mpStyles.sectionTitle}>背景</div>
            <div style={mpStyles.narrative}>{narrative}</div>
          </div>
        )}

        {/* 详细背景 */}
        {bg && (
          <div style={mpStyles.section}>
            <div style={mpStyles.sectionTitle}>履历</div>
            <div style={mpStyles.detailGrid}>
              <div style={mpStyles.detailItem}>
                <span style={mpStyles.detailLabel}>出身</span>
                <span style={mpStyles.detailValue}>{ORIGIN_LABELS[bg.familyOrigin] ?? bg.familyOrigin}</span>
              </div>
              <div style={mpStyles.detailItem}>
                <span style={mpStyles.detailLabel}>学历</span>
                <span style={mpStyles.detailValue}>{EDUCATION_LABELS[bg.education] ?? bg.education}</span>
              </div>
              <div style={mpStyles.detailItem}>
                <span style={mpStyles.detailLabel}>前职业</span>
                <span style={mpStyles.detailValue}>{bg.career}</span>
              </div>
              <div style={mpStyles.detailItem}>
                <span style={mpStyles.detailLabel}>出身地</span>
                <span style={mpStyles.detailValue}>{bg.hometown}</span>
              </div>
              <div style={mpStyles.detailItem}>
                <span style={mpStyles.detailLabel}>社会阶层</span>
                <span style={mpStyles.detailValue}>{SOCIAL_LABELS[bg.socialClass] ?? bg.socialClass}</span>
              </div>
              <div style={mpStyles.detailItem}>
                <span style={mpStyles.detailLabel}>人脉</span>
                <span style={mpStyles.detailValue}>{bg.connections.join('、')}</span>
              </div>
            </div>
          </div>
        )}

        {/* 政治意识形态 */}
        <div style={mpStyles.section}>
          <div style={mpStyles.sectionTitle}>政治意识形态</div>
          <div style={mpStyles.detailGrid}>
            <div style={mpStyles.detailItem}>
              <span style={mpStyles.detailLabel}>主要意识形态</span>
              <span style={mpStyles.detailValue}>
                {POLITICAL_IDEOLOGY_LABELS[personality.politicalIdeology.primary] ?? personality.politicalIdeology.primary}
              </span>
            </div>
            {personality.politicalIdeology.secondary && (
              <div style={mpStyles.detailItem}>
                <span style={mpStyles.detailLabel}>次要意识形态</span>
                <span style={mpStyles.detailValue}>
                  {POLITICAL_IDEOLOGY_LABELS[personality.politicalIdeology.secondary] ?? personality.politicalIdeology.secondary}
                </span>
              </div>
            )}
            <div style={mpStyles.detailItem}>
              <span style={mpStyles.detailLabel}>经济立场</span>
              <span style={mpStyles.detailValue}>
                {personality.politicalIdeology.economicAxis < -40 ? '极左' :
                 personality.politicalIdeology.economicAxis < -15 ? '左翼' :
                 personality.politicalIdeology.economicAxis < 15 ? '中间' :
                 personality.politicalIdeology.economicAxis < 40 ? '右翼' : '极右'}
                {' '}({personality.politicalIdeology.economicAxis})
              </span>
            </div>
            <div style={mpStyles.detailItem}>
              <span style={mpStyles.detailLabel}>社会立场</span>
              <span style={mpStyles.detailValue}>
                {personality.politicalIdeology.socialAxis < -40 ? '威权' :
                 personality.politicalIdeology.socialAxis < -15 ? '保守' :
                 personality.politicalIdeology.socialAxis < 15 ? '自由' :
                 personality.politicalIdeology.socialAxis < 40 ? '进步' : '激进自由'}
                {' '}({personality.politicalIdeology.socialAxis})
              </span>
            </div>
          </div>
        </div>

        {/* 性格特质 (CK3风格) */}
        {personality.personalityTraits.length > 0 && (
          <div style={mpStyles.section}>
            <div style={mpStyles.sectionTitle}>性格特质</div>
            <div style={mpStyles.goalList}>
              {personality.personalityTraits.map((t, i) => (
                <span key={i} style={{
                  ...mpStyles.goalTag,
                  background: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336'][i % 5],
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
          {traitBar('野心', personality.ambition, party.color)}
          {traitBar('忠诚', personality.loyalty, '#66BB6A')}
          {traitBar('腐败倾向', personality.corruption, '#EF5350')}
          {traitBar('知名度', personality.popularity, '#42A5F5')}
          {traitBar('媒体技巧', personality.mediaSkill, '#AB47BC')}
          {traitBar('谈判技巧', personality.negotiationSkill, '#26A69A')}
        </div>

        {/* 状态 */}
        <div style={mpStyles.section}>
          <div style={mpStyles.sectionTitle}>当前状态</div>
          <div style={{ display: 'flex', gap: 16, flexDirection: 'column' }}>
            {traitBar('压力指数', personality.stress, '#EF5350')}
            {traitBar('健康指数', personality.health, '#66BB6A')}
          </div>
        </div>

        {/* 隐藏目标 */}
        {personality.hiddenGoals.length > 0 && (
          <div style={mpStyles.section}>
            <div style={mpStyles.sectionTitle}>政治目标</div>
            <div style={mpStyles.goalList}>
              {personality.hiddenGoals.map((g, i) => (
                <span key={i} style={mpStyles.goalTag}>{GOAL_LABELS[g] ?? g}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ===== 议员名字缩写用于头像 =====
function personName(personality: MPPersonality): string {
  const parts = personality.personName.split(' ');
  const last = parts[0] ?? '';
  const first = parts[1] ?? '';
  return (last[0] ?? '') + (first[0] ?? '');
}

// ===== 主组件 =====
export const CommitteeDashboard: React.FC<Props> = ({ committees, bills, parties, relations, mpPersonalities }) => {
  const partyMap = new Map(parties.map((p) => [p.id, p]));
  const activeBills = bills.filter((b) => !['passed', 'rejected', 'implemented'].includes(b.status));
  const completedBills = bills.filter((b) => ['passed', 'rejected', 'implemented'].includes(b.status));

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>委员会一览</h2>
        <div style={styles.summary}>
          <span style={styles.summaryItem}>
            <span style={{ color: '#FFD600', fontWeight: 700 }}>{activeBills.length}</span>
            <span style={{ color: '#888', marginLeft: 4 }}>审议中</span>
          </span>
          <span style={styles.summaryItem}>
            <span style={{ color: '#66BB6A', fontWeight: 700 }}>{completedBills.filter((b) => b.status === 'passed').length}</span>
            <span style={{ color: '#888', marginLeft: 4 }}>已通过</span>
          </span>
        </div>
      </div>

      <div style={styles.committeeGrid}>
        {committees.map((c) => (
          <CommitteeCard key={c.id} committee={c} partyMap={partyMap} activeBills={activeBills} mpPersonalities={mpPersonalities} />
        ))}
      </div>

      {bills.length > 0 && (
        <div style={styles.billSection}>
          <h3 style={styles.sectionTitle}>法案追踪</h3>
          <div style={styles.billList}>
            {bills.map((bill) => (
              <BillRow key={bill.id} bill={bill} partyMap={partyMap} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/** 单个委员会卡片 */
const CommitteeCard: React.FC<{
  committee: Committee;
  partyMap: Map<string, Party>;
  activeBills: Bill[];
  mpPersonalities: Record<string, MPPersonality>;
}> = ({ committee, partyMap, activeBills, mpPersonalities }) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedMP, setSelectedMP] = useState<{ personality: MPPersonality; party: Party } | null>(null);
  const chairmanParty = partyMap.get(committee.chairman.partyId);
  const viceParty = partyMap.get(committee.viceChairman.partyId);

  const relatedBills = activeBills.filter((b) => b.committeeId === committee.id);

  const membersByParty: Record<string, CommitteeMember[]> = {};
  for (const m of committee.members) {
    if (!membersByParty[m.partyId]) membersByParty[m.partyId] = [];
    membersByParty[m.partyId].push(m);
  }
  const sortedPartyGroups = Object.entries(membersByParty).sort((a, b) => b[1].length - a[1].length);

  const partyCounts: Record<string, number> = {};
  for (const m of committee.members) {
    partyCounts[m.partyId] = (partyCounts[m.partyId] ?? 0) + 1;
  }
  const sortedPartyEntries = Object.entries(partyCounts).sort((a, b) => b[1] - a[1]);

  const handleMemberClick = (m: CommitteeMember) => {
    const key = `${m.partyId}:${m.personName}`;
    const personality = mpPersonalities[key];
    const party = partyMap.get(m.partyId);
    if (personality && party) {
      setSelectedMP({ personality, party });
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.cardTitle}>{COMMITTEE_LABELS[committee.id]}</div>
        <EfficiencyBadge value={committee.efficiency} />
      </div>

      <div style={styles.leadership}>
        <div style={styles.leader}>
          <span style={styles.leaderLabel}>委员长</span>
          <span style={{ color: chairmanParty?.color ?? '#ccc', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            onClick={() => handleMemberClick(committee.chairman)}>
            {committee.chairman.personName}
          </span>
          <span style={{ fontSize: 11, color: '#888' }}>{chairmanParty?.abbreviation}</span>
        </div>
        <div style={styles.leader}>
          <span style={styles.leaderLabel}>副委员长</span>
          <span style={{ color: viceParty?.color ?? '#ccc', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            onClick={() => handleMemberClick(committee.viceChairman)}>
            {committee.viceChairman.personName}
          </span>
          <span style={{ fontSize: 11, color: '#888' }}>{viceParty?.abbreviation}</span>
        </div>
      </div>

      <div style={styles.partyBar}>
        {sortedPartyEntries.map(([pid, count]) => {
          const party = partyMap.get(pid);
          return (
            <div key={pid} style={{ flex: count, backgroundColor: party?.color ?? '#666', minWidth: 3, height: 8, borderRadius: 2 }}
              title={`${party?.name}: ${count} 人`} />
          );
        })}
      </div>

      <div style={styles.partyStats}>
        {sortedPartyEntries.map(([pid, count]) => {
          const party = partyMap.get(pid);
          return (
            <div key={pid} style={styles.partyStatItem}>
              <div style={{ ...styles.partyDot, backgroundColor: party?.color }} />
              <span style={{ color: party?.color, fontWeight: 600, fontSize: 11 }}>{party?.abbreviation}</span>
              <span style={{ fontSize: 11, color: '#888' }}>{count}人</span>
            </div>
          );
        })}
      </div>

      <div style={styles.toggleRow} onClick={() => setExpanded(!expanded)}>
        <span style={{ fontSize: 11, color: '#888' }}>{committee.members.length} 名委员</span>
        {relatedBills.length > 0 && (
          <span style={{ fontSize: 11, color: '#FFA726', marginLeft: 8 }}>{relatedBills.length} 项法案审议中</span>
        )}
        <span style={styles.toggleIcon}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={styles.memberList}>
          {sortedPartyGroups.map(([pid, members]) => {
            const party = partyMap.get(pid);
            return (
              <div key={pid} style={styles.memberGroup}>
                <div style={{ ...styles.groupLabel, color: party?.color }}>{party?.abbreviation} · {party?.name}</div>
                <div style={styles.memberNames}>
                  {members.map((m) => {
                    const isChair = m.personName === committee.chairman.personName;
                    const isVice = m.personName === committee.viceChairman.personName;
                    return (
                      <span key={m.personName}
                        style={{
                          ...styles.memberTag,
                          borderColor: isChair || isVice ? party?.color : '#333',
                          backgroundColor: isChair ? `${party?.color}22` : isVice ? `${party?.color}11` : 'transparent',
                          fontWeight: isChair ? 700 : isVice ? 600 : 400,
                          color: isChair || isVice ? party?.color : '#aaa',
                          cursor: 'pointer',
                        }}
                        onClick={(e) => { e.stopPropagation(); handleMemberClick(m); }}
                      >
                        {m.personName}
                        {isChair && <span style={styles.roleTag}>委员长</span>}
                        {isVice && <span style={styles.roleTag}>副委员长</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 议员资料弹窗 */}
      {selectedMP && (
        <MPProfilePanel
          personality={selectedMP.personality}
          party={selectedMP.party}
          onClose={() => setSelectedMP(null)}
        />
      )}
    </div>
  );
};

/** 效率徽章 */
const EfficiencyBadge: React.FC<{ value: number }> = ({ value }) => {
  const color = value >= 70 ? '#66BB6A' : value >= 40 ? '#FFA726' : '#EF5350';
  const label = value >= 70 ? '高效' : value >= 40 ? '一般' : '低效';
  return (
    <div style={{ ...styles.badge, backgroundColor: color }}>
      <span style={{ fontWeight: 700 }}>{value}</span>
      <span style={{ marginLeft: 4, fontSize: 10 }}>{label}</span>
    </div>
  );
};

/** 法案行 */
const BillRow: React.FC<{ bill: Bill; partyMap: Map<string, Party> }> = ({ bill, partyMap }) => {
  const party = partyMap.get(bill.proposerPartyId);
  const isActive = !['passed', 'rejected', 'implemented'].includes(bill.status);

  return (
    <div style={{ ...styles.billRow, opacity: isActive ? 1 : 0.5 }}>
      <div style={styles.billStatusCol}>
        <span style={{ ...styles.statusBadge, backgroundColor: statusColor(bill.status) }}>{BILL_STATUS_LABELS[bill.status]}</span>
      </div>
      <div style={styles.billTitleCol}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#e0e0e0' }}>{bill.title}</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
          {COMMITTEE_LABELS[bill.committeeId]} · 提出者:
          <span style={{ color: party?.color, marginLeft: 4 }}>{bill.proposerName}</span>
          <span style={{ marginLeft: 4 }}>({party?.abbreviation})</span>
        </div>
        {bill.committeeNote && <div style={{ fontSize: 11, color: '#aaa', marginTop: 4, fontStyle: 'italic' }}>{bill.committeeNote}</div>}
        {bill.amendment && <div style={{ fontSize: 11, color: '#FFA726', marginTop: 2 }}>修正: {bill.amendment}</div>}
      </div>
      {(bill.votesFor > 0 || bill.votesAgainst > 0) && (
        <div style={styles.billVotes}>
          <span style={{ color: '#66BB6A', fontWeight: 600 }}>{bill.votesFor}</span>
          <span style={{ color: '#666', margin: '0 4px' }}>:</span>
          <span style={{ color: '#EF5350', fontWeight: 600 }}>{bill.votesAgainst}</span>
        </div>
      )}
    </div>
  );
};

function statusColor(status: string): string {
  switch (status) {
    case 'draft': return '#78909C'; case 'in_committee': return '#42A5F5';
    case 'revised': return '#FFA726'; case 'delayed': return '#EF5350';
    case 'voting': return '#AB47BC'; case 'passed': return '#66BB6A';
    case 'rejected': return '#E53935'; case 'implemented': return '#26A69A';
    default: return '#666';
  }
}

// ===== 议员面板样式 =====
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

// ===== 主样式 =====
const styles: Record<string, React.CSSProperties> = {
  container: { background: '#1a1a2e', borderRadius: 12, padding: 24, color: '#e0e0e0' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { margin: 0, fontSize: 20, color: '#fff' },
  summary: { display: 'flex', gap: 16, fontSize: 13 },
  summaryItem: { display: 'flex', alignItems: 'center' },
  committeeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 },
  card: { background: '#16213e', borderRadius: 8, padding: '12px 16px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#e0e0e0' },
  badge: { padding: '2px 10px', borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 700 },
  leadership: { display: 'flex', gap: 16, marginBottom: 8 },
  leader: { display: 'flex', flexDirection: 'column' as const, gap: 1 },
  leaderLabel: { fontSize: 10, color: '#666', textTransform: 'uppercase' as const, letterSpacing: 1 },
  partyBar: { display: 'flex', gap: 2, borderRadius: 3, overflow: 'hidden' },
  partyStats: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginTop: 6 },
  partyStatItem: { display: 'flex', alignItems: 'center', gap: 3 },
  partyDot: { width: 6, height: 6, borderRadius: '50%' },
  toggleRow: { display: 'flex', alignItems: 'center', marginTop: 8, cursor: 'pointer', userSelect: 'none' as const },
  toggleIcon: { marginLeft: 'auto', fontSize: 10, color: '#666' },
  memberList: { marginTop: 8, borderTop: '1px solid #2a3a5c', paddingTop: 8 },
  memberGroup: { marginBottom: 8 },
  groupLabel: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
  memberNames: { display: 'flex', flexWrap: 'wrap' as const, gap: 4 },
  memberTag: {
    display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px',
    fontSize: 11, borderRadius: 3, border: '1px solid',
  },
  roleTag: { fontSize: 9, color: '#FFD600', fontWeight: 700 },
  cardFooter: { display: 'flex', justifyContent: 'space-between', marginTop: 6 },
  billSection: { marginTop: 24 },
  sectionTitle: { fontSize: 16, color: '#ccc', marginBottom: 12, borderBottom: '1px solid #333', paddingBottom: 6 },
  billList: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  billRow: { display: 'flex', alignItems: 'flex-start' as const, gap: 12, padding: '8px 12px', background: '#16213e', borderRadius: 6 },
  billStatusCol: { minWidth: 70, paddingTop: 2 },
  statusBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, color: '#fff', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' as const },
  billTitleCol: { flex: 1, minWidth: 0 },
  billVotes: { minWidth: 60, textAlign: 'right' as const, fontSize: 14, paddingTop: 2 },
};
