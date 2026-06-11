import React from 'react';
import type { Party, MarketMetrics, District } from '../types';

interface Props {
  parties: Party[];
  metrics: MarketMetrics;
  districts: District[];
}

export const MarketDashboard: React.FC<Props> = ({ parties, metrics, districts }) => {
  const sortedParties = [...parties].sort((a, b) => b.currentSupport - a.currentSupport);
  const totalProjected = parties.reduce((s, p) => s + p.projectedSeats, 0);

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>选举大盘数据</h2>

      {/* 顶部关键指标 */}
      <div style={styles.kpiRow}>
        <KpiCard label="选举倒计时" value={`${metrics.daysToElection} 天`} accent="#FF6D00" />
        <KpiCard label="总席位" value={`${metrics.totalSeats}`} subtitle={`过半需 ${metrics.majorityThreshold} 席`} accent="#FFD600" />
        <KpiCard label="登记选民" value={`${(metrics.totalVoters / 1_000_000).toFixed(1)}M`} subtitle={`投票率 ${metrics.turnoutRate}%`} accent="#00BCD4" />
        <KpiCard label="摇摆选民" value={`${metrics.swingVoterRatio}%`} accent="#AB47BC" />
      </div>

      {/* 经济/社会指标 */}
      <div style={styles.indicatorRow}>
        <BarIndicator label="经济景气指数" value={metrics.economicIndex} color="#4CAF50" />
        <BarIndicator label="社会稳定指数" value={metrics.socialStabilityIndex} color="#2196F3" />
        <BarIndicator label="媒体关注度" value={metrics.mediaAttention} color="#FF9800" />
      </div>

      {/* 各派系支持率排名 */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>支持率排行 & 席位预测</h3>
        <div style={styles.partyList}>
          {sortedParties.map((party, idx) => (
            <div key={party.id} style={styles.partyRow}>
              <div style={styles.rank}>{idx + 1}</div>
              <div
                style={{
                  ...styles.partyColor,
                  backgroundColor: party.color,
                }}
              />
              <div style={styles.partyInfo}>
                <div style={styles.partyName}>
                  {party.name}
                  <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>
                    ({party.abbreviation}) · {party.leader}
                  </span>
                </div>
                <div style={styles.partyBarContainer}>
                  <div
                    style={{
                      ...styles.partyBar,
                      width: `${party.currentSupport}%`,
                      backgroundColor: party.color,
                    }}
                  />
                </div>
              </div>
              <div style={styles.partyStats}>
                <div style={{ color: party.color, fontWeight: 700, fontSize: 18 }}>
                  {party.currentSupport.toFixed(1)}%
                </div>
                <div style={{ color: '#aaa', fontSize: 12 }}>
                  {party.projectedSeats} 席
                  <span style={{ color: '#666', marginLeft: 4 }}>
                    ({((party.projectedSeats / totalProjected) * 100).toFixed(1)}%)
                  </span>
                </div>
              </div>
              <div style={styles.partyMeta}>
                <div style={{ fontSize: 11, color: '#888' }}>
                  资金: ¥{party.funds}M
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  组织: {party.organization} | 魅力: {party.charisma}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 选区明细 */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>选区明细</h3>
        <div style={styles.districtGrid}>
          {districts.map((d) => {
            const totalSupport = Object.values(d.supportByParty).reduce((s, v) => s + v, 0);
            const winner = Object.entries(d.supportByParty).sort(
              ([, a], [, b]) => b - a
            )[0];
            const winnerParty = parties.find((p) => p.id === winner[0]);
            const winnerPct = totalSupport > 0 ? ((winner[1] / totalSupport) * 100).toFixed(1) : '0';
            return (
              <div key={d.id} style={styles.districtCard}>
                <div style={{ fontWeight: 600, color: '#e0e0e0' }}>{d.name}</div>
                <div style={{ fontSize: 12, color: '#888', margin: '2px 0' }}>
                  {d.totalSeats} 席 · {(d.voterCount / 1_000_000).toFixed(1)}M 选民
                </div>
                <div style={{ fontSize: 12, color: winnerParty?.color, fontWeight: 600 }}>
                  领先: {winnerParty?.name} ({winnerPct}%)
                </div>
                <div style={{ display: 'flex', gap: 2, marginTop: 4, height: 6, borderRadius: 3, overflow: 'hidden' }}>
                  {parties.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        flex: d.supportByParty[p.id] || 0,
                        backgroundColor: p.color,
                        minWidth: d.supportByParty[p.id] > 0 ? 2 : 0,
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** 关键指标卡片 */
const KpiCard: React.FC<{
  label: string;
  value: string;
  subtitle?: string;
  accent: string;
}> = ({ label, value, subtitle, accent }) => (
  <div style={{ ...styles.kpiCard, borderTopColor: accent }}>
    <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: accent }}>{value}</div>
    {subtitle && <div style={{ fontSize: 11, color: '#666' }}>{subtitle}</div>}
  </div>
);

/** 进度条指标 */
const BarIndicator: React.FC<{
  label: string;
  value: number;
  color: string;
}> = ({ label, value, color }) => (
  <div style={{ flex: 1, minWidth: 180 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#aaa', marginBottom: 4 }}>
      <span>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
    <div style={{ height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: `${value}%`,
          backgroundColor: color,
          borderRadius: 3,
          transition: 'width 0.3s',
        }}
      />
    </div>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#1a1a2e',
    borderRadius: 12,
    padding: 24,
    color: '#e0e0e0',
  },
  title: {
    margin: 0,
    fontSize: 20,
    color: '#fff',
  },
  kpiRow: {
    display: 'flex',
    gap: 12,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    background: '#16213e',
    borderRadius: 8,
    padding: '12px 16px',
    borderTop: '3px solid',
  },
  indicatorRow: {
    display: 'flex',
    gap: 20,
    marginTop: 20,
    flexWrap: 'wrap',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#ccc',
    marginBottom: 12,
    borderBottom: '1px solid #333',
    paddingBottom: 6,
  },
  partyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  partyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 12px',
    background: '#16213e',
    borderRadius: 8,
  },
  rank: {
    width: 24,
    fontSize: 16,
    fontWeight: 700,
    color: '#888',
    textAlign: 'center',
  },
  partyColor: {
    width: 8,
    height: 32,
    borderRadius: 4,
  },
  partyInfo: {
    flex: 1,
    minWidth: 0,
  },
  partyName: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 4,
  },
  partyBarContainer: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
  },
  partyBar: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.3s',
  },
  partyStats: {
    width: 100,
    textAlign: 'right',
  },
  partyMeta: {
    width: 130,
    fontSize: 11,
  },
  districtGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 10,
  },
  districtCard: {
    background: '#16213e',
    borderRadius: 8,
    padding: '10px 14px',
  },
};
