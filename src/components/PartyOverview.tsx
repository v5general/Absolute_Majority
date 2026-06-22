import React, { useState, useEffect } from 'react';
import { useGame } from '../hooks/useGameState';
import type { Party, Ideology, RelationEntry } from '../types';
import './PartyOverview.css';

// ===== 意形态标签 =====
const IDEOLOGY_LABELS: Record<Ideology, string> = {
  'far-left': '极左翼',
  'left': '左翼',
  'center-left': '中左翼',
  'center': '中间派',
  'center-right': '中右翼',
  'right': '右翼',
  'far-right': '极右翼',
};

const IDEOLOGY_COLORS: Record<Ideology, string> = {
  'far-left': '#E53935',
  'left': '#FF7043',
  'center-left': '#FFA726',
  'center': '#FDD835',
  'center-right': '#66BB6A',
  'right': '#42A5F5',
  'far-right': '#7E57C2',
};

// ===== 扩展党派核心思想与主旨（基于现有 description 扩充） =====
interface PartyDetail {
  /** 核心思想：党内最高意识形态与哲学基础 */
  coreIdeology: string;
  /** 主旨 / 党纲：党的核心主张与施政方向 */
  platform: string;
  /** 主要政策纲领 */
  policies: string[];
  /** 核心选民基础 */
  base: string;
  /** 历史定位 / 一句话标签 */
  tagline: string;
}

const PARTY_DETAILS: Record<string, PartyDetail> = {
  reform: {
    tagline: '渐进改革 · 务实中间',
    coreIdeology:
      '渐进式制度改革 + 务实中间路线。坚信通过制度化改造（而非激进革命）能实现最稳定的社会进步，反对意识形态极端化，主张以证据与效率为准绳评判政策。',
    platform:
      '廉政、效率、增长。主张精简官僚体制、强化反腐败机制、激活市场主体活力，以技术驱动政府现代化，平衡市场自由与社会公平。',
    policies: [
      '行政改革与政府数字化转型',
      '教育投资与人力资本积累',
      '财政纪律与平衡预算',
      '温和市场化与监管优化',
    ],
    base: '都市中产阶级、白领阶层、年轻专业人士、城市知识分子',
  },
  liberty: {
    tagline: '自由市场 · 小政府大社会',
    coreIdeology:
      '古典自由主义。个人自由是最高价值，市场经济是最有效的资源配置方式；政府的过度干预会扭曲激励、抑制创新，应被限制在最小必要范围。',
    platform:
      '小政府、低税收、放松管制。主张大幅削减政府规模与税负，把决策权交还给个人与企业，让市场竞争自然淘汰低效者。',
    policies: [
      '大规模减税与简化税制',
      '国企私有化与市场开放',
      '贸易自由化与全球融入',
      '放松劳动管制与创业激励',
    ],
    base: '企业家、金融业者、年轻专业人士、都市商人、自由职业者',
  },
  conservative: {
    tagline: '传统价值 · 秩序与国家',
    coreIdeology:
      '保守主义。维护传统价值、社会秩序与国家认同，反对激进变革与文化解构；相信渐进改良胜过推倒重来，重视历史连续性与文化传承。',
    platform:
      '减税、强军、家庭价值。重视国家安全与文化传统，主张以法律维护家庭结构、强化治安与国防，让社会在稳定中演进。',
    policies: [
      '国防预算扩张与自主防卫',
      '传统家庭与生育鼓励政策',
      '农业补贴与乡村振兴',
      '治安强化与严打犯罪',
    ],
    base: '乡村选民、老年群体、地方工商业者、宗教与文化保守派',
  },
  progressive: {
    tagline: '社会民主 · 绿色与公正',
    coreIdeology:
      '社会民主主义。在资本主义框架内，通过福利国家与政策干预实现社会公正；相信国家有责任修正市场失灵、保护弱势、确保代际与代内公平。',
    platform:
      '福利扩大、环保优先、财富再分配。主张以累进税与公共服务弥合贫富差距，将生态可持续性置于经济增速之上。',
    policies: [
      '富人与企业增税',
      '全民医保与教育免费',
      '可再生能源与碳中和路线',
      '劳动者权益与性别平权',
    ],
    base: '工会成员、公共服务者、年轻进步派、城市知识阶层、环保主义者',
  },
  populist: {
    tagline: '人民至上 · 反建制反精英',
    coreIdeology:
      '民粹民族主义。以"精英 vs 人民"的二元叙事解释政治，强调民族本位与文化主体性；反对全球化、金融化与代议制僵局，主张以直接民主绕过建制藩篱。',
    platform:
      '反精英、反全球化、本国优先。承诺把被全球化抛弃的"沉默多数"重新拉回政治中心，以强硬手段保护本国工人与文化。',
    policies: [
      '限制移民与边境管控',
      '贸易保护与产业回流',
      '严打犯罪与国家安全强化',
      '直接民主机制（公投/罢免）',
    ],
    base: '蓝领工人、偏远地区居民、年轻失意者、被全球化抛弃的传统行业群体',
  },
  solidarity: {
    tagline: '阶级斗争 · 劳动者联合',
    coreIdeology:
      '马克思主义、科学社会主义。以历史唯物主义与剩余价值学说揭示资本主义内在矛盾，阶级斗争是历史发展的根本动力；主张劳动者联合起来，通过社会变革逐步消灭生产资料私有制与剥削，建立劳动者当家作主的政治经济秩序。',
    platform:
      '劳动者权益、反资本剥削、民主集中制。党内强调理论学习与组织纪律，对内民主、对外统一；倡导关键产业国有化、工人参与管理，与社会财富的公平分配。',
    policies: [
      '关键产业国有化',
      '工人委员会参与企业决策',
      '扩大劳动者保护与就业保障',
      '反对跨国资本与金融投机',
    ],
    base: '中老年产业工人、传统工业区居民、激进青年、左翼工会骨干',
  },
};

// ===== 关系类型 → 中文标签 =====
const RELATION_LABELS: Record<string, string> = {
  alliance: '联盟',
  friendly: '友好',
  neutral: '中立',
  tense: '紧张',
  hostile: '敌对',
};

const RELATION_COLORS: Record<string, string> = {
  alliance: '#66BB6A',
  friendly: '#AED581',
  neutral: '#BDBDBD',
  tense: '#FFB74D',
  hostile: '#EF5350',
};

interface PartyOverviewProps {
  onBack: () => void;
}

export const PartyOverview: React.FC<PartyOverviewProps> = ({ onBack }) => {
  const { state } = useGame();
  // 当前选中的政党（点击卡片后弹出详情蒙层）
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);

  const parties = state.parties;
  const relations = state.relations;
  const gov = state.government;
  const totalSeats = gov?.electionResult.totalSeats ?? 200;

  /** 取某党"当前"实际席位数（来自选举结果，而非 projectedSeats 预测值） */
  const getCurrentSeats = (partyId: string): number => {
    const result = gov?.electionResult.partyResults.find(r => r.partyId === partyId);
    return result?.seats ?? 0;
  };

  /** 取某党对所有其他党的关系 */
  const getRelationsFrom = (partyId: string): RelationEntry[] =>
    relations.filter(r => r.from === partyId);

  /** 某党是否在执政联盟中 */
  const isRuling = (partyId: string): boolean =>
    gov?.rulingCoalition.includes(partyId) ?? false;

  // 选中党派后，将列表蒙层的滚动锁定（详情蒙层自带独立滚动）
  useEffect(() => {
    if (selectedParty) {
      const overlay = document.querySelector('.partyOverview-overlay');
      if (overlay) {
        const prev = (overlay as HTMLElement).style.overflowY;
        (overlay as HTMLElement).style.overflowY = 'hidden';
        return () => {
          (overlay as HTMLElement).style.overflowY = prev;
        };
      }
    }
  }, [selectedParty]);

  return (
    <>
    <div className={`partyOverview-overlay ${selectedParty ? 'is-locked' : ''}`}>
      {/* ===== 顶部栏（仅保留右侧统计） ===== */}
      <div className="partyOverview-topRow">
        <div className="partyOverview-summary">
          <span className="partyOverview-summaryLabel">注册政党</span>
          <span className="partyOverview-summaryValue">{parties.length}</span>
          <span className="partyOverview-summaryDivider">·</span>
          <span className="partyOverview-summaryLabel">总席位</span>
          <span className="partyOverview-summaryValue">{totalSeats}</span>
        </div>
      </div>

      {/* ===== 标题 ===== */}
      <div className="partyOverview-titleSection">
        <div className="partyOverview-decorLine partyOverview-decorLineTop" />
        <h1 className="partyOverview-title" data-text="政党派系一览">政党派系一览</h1>
        <div className="partyOverview-subtitle">ABSOLUTE MAJORITY · PARTIES</div>
        <div className="partyOverview-decorLine partyOverview-decorLineBottom" />
      </div>

      {/* ===== 党派卡片网格（卡片本身可点击，弹出详情蒙层） ===== */}
      <div className="partyOverview-grid">
        {parties.map((party, idx) => {
          const detail = PARTY_DETAILS[party.id];
          const ideologyColor = IDEOLOGY_COLORS[party.ideology];
          const ruling = isRuling(party.id);
          const currentSeats = getCurrentSeats(party.id);
          const seatPercent = totalSeats > 0 ? ((currentSeats / totalSeats) * 100).toFixed(1) : '0.0';
          const animationDelay = `${0.4 + idx * 0.08}s`;

          return (
            <div
              key={party.id}
              className="partyOverview-card"
              style={{
                ['--party-color' as string]: party.color,
                ['--ideology-color' as string]: ideologyColor,
                animationDelay,
              }}
              onClick={() => setSelectedParty(party)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedParty(party);
                }
              }}
            >
              {/* 顶部色条 */}
              <div className="partyOverview-cardStripe" />

              {/* 头部 */}
              <div className="partyOverview-cardHeader">
                <div className="partyOverview-cardHeaderLeft">
                  <div className="partyOverview-partyEmblem" style={{ borderColor: party.color, boxShadow: `0 0 14px ${party.color}55` }}>
                    <span style={{ color: party.color }}>{party.abbreviation}</span>
                  </div>
                  <div className="partyOverview-cardHeaderInfo">
                    <div className="partyOverview-partyNameRow">
                      <span className="partyOverview-partyName">{party.name}</span>
                      {ruling && <span className="partyOverview-rulingBadge">◆ 执政</span>}
                    </div>
                    <div className="partyOverview-tagline">{detail?.tagline}</div>
                  </div>
                </div>
                <div className="partyOverview-cardHeaderRight">
                  <span
                    className="partyOverview-ideologyTag"
                    style={{ color: ideologyColor, borderColor: `${ideologyColor}80` }}
                  >
                    {IDEOLOGY_LABELS[party.ideology]}
                  </span>
                </div>
              </div>

              {/* 数据条：使用当前实际席位 */}
              <div className="partyOverview-metricRow">
                <div className="partyOverview-metric">
                  <span className="partyOverview-metricLabel">现席位</span>
                  <span className="partyOverview-metricValue" style={{ color: party.color }}>
                    {currentSeats}
                    <span className="partyOverview-metricDenom">/ {totalSeats}</span>
                  </span>
                </div>
                <div className="partyOverview-metric">
                  <span className="partyOverview-metricLabel">支持率</span>
                  <span className="partyOverview-metricValue">{party.currentSupport.toFixed(1)}%</span>
                </div>
                <div className="partyOverview-metric">
                  <span className="partyOverview-metricLabel">党首</span>
                  <span className="partyOverview-metricValueSmall">{party.leader}</span>
                </div>
              </div>

              {/* 简要描述（卡片视图做截断，避免联合劳工党等长描述撑爆卡片） */}
              <div className="partyOverview-desc">{party.description}</div>

              {/* 核心思想摘要（卡片视图做截断） */}
              {detail && (
                <div className="partyOverview-detailSection">
                  <div className="partyOverview-detailTitle">
                    <span className="partyOverview-detailBullet" style={{ background: party.color }} />
                    核心思想 · CORE IDEOLOGY
                  </div>
                  <div className="partyOverview-detailText partyOverview-detailTextClamp">{detail.coreIdeology}</div>
                </div>
              )}

              {/* 点击查看详情提示 */}
              <div className="partyOverview-viewHint">
                <span>查看完整党纲 · 政策 · 党际关系</span>
                <span className="partyOverview-viewHintArrow">▶</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== 底部留白 ===== */}
      <div className="partyOverview-footer">
        <span className="partyOverview-footerText">
          点击任意党派卡片查看完整资料
        </span>
      </div>
    </div>

    {/* 关闭按钮：作为 overlay 的兄弟节点，脱离 backdrop-filter 包含块 */}
    <button className="partyOverview-closeBtn" onClick={onBack} title="关闭" aria-label="关闭">
      ✕
    </button>

    {/* ===== 党派详情蒙层（作为兄弟节点渲染，而非 partyOverview-overlay 的子节点） ===== */}
    {/* 关键：必须放在 partyOverview-overlay 之外，否则 backdrop-filter 会创建包含块，
        导致 position:fixed 的蒙层在列表滚动后定位错乱（卡在顶部）。 */}
    {selectedParty && (
      <PartyDetailModal
        party={selectedParty}
        detail={PARTY_DETAILS[selectedParty.id]}
        isRulingParty={isRuling(selectedParty.id)}
        currentSeats={getCurrentSeats(selectedParty.id)}
        totalSeats={totalSeats}
        relations={getRelationsFrom(selectedParty.id)}
        allParties={parties}
        onClose={() => setSelectedParty(null)}
      />
    )}
  </>
  );
};

// ===== 党派详情蒙层组件 =====
interface PartyDetailModalProps {
  party: Party;
  detail: PartyDetail | undefined;
  isRulingParty: boolean;
  currentSeats: number;
  totalSeats: number;
  relations: RelationEntry[];
  allParties: Party[];
  onClose: () => void;
}

const PartyDetailModal: React.FC<PartyDetailModalProps> = ({
  party,
  detail,
  isRulingParty,
  currentSeats,
  totalSeats,
  relations,
  allParties,
  onClose,
}) => {
  const ideologyColor = IDEOLOGY_COLORS[party.ideology];
  const seatPercent = totalSeats > 0 ? ((currentSeats / totalSeats) * 100).toFixed(1) : '0.0';

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
    <div
      className="partyModal-overlay"
      style={{
        ['--party-color' as string]: party.color,
        ['--ideology-color' as string]: ideologyColor,
      }}
    >
      {/* 顶部占位条（顶部渐变遮罩） */}
      <div className="partyModal-topRow" />

      {/* 标题区（与个人档案同款） */}
      <div className="partyModal-titleSection">
        <div className="partyModal-decorLine partyModal-decorLineTop" />
        <h1 className="partyModal-title" data-text={party.name}>{party.name}</h1>
        <div className="partyModal-subtitle">{party.abbreviation} · PARTY DOSSIER</div>
        <div className="partyModal-decorLine partyModal-decorLineBottom" />
      </div>

      {/* 主内容区（与个人档案同款） */}
      <div className="partyModal-content">
        {/* 头部卡片 */}
        <div className="partyModal-headerCard">
          <div className="partyModal-headerLeft">
            <div
              className="partyModal-emblem"
              style={{ borderColor: party.color, boxShadow: `0 0 28px ${party.color}55` }}
            >
              <span style={{ color: party.color }}>{party.abbreviation}</span>
            </div>
            <div className="partyModal-headerInfo">
              <div className="partyModal-tagline">{detail?.tagline ?? '注册政党'}</div>
              <div className="partyModal-metaRow">
                <span
                  className="partyModal-ideologyChip"
                  style={{ color: ideologyColor, borderColor: `${ideologyColor}80` }}
                >
                  {IDEOLOGY_LABELS[party.ideology]}
                </span>
                <span className="partyModal-metaValue">党首 · {party.leader}</span>
                <span className="partyModal-divider">·</span>
                <span className="partyModal-metaValue">现席位 {currentSeats}/{totalSeats}</span>
                <span className="partyModal-divider">·</span>
                <span className="partyModal-metaValue">支持率 {party.currentSupport.toFixed(1)}%</span>
              </div>
              <div className="partyModal-roleRow">
                {isRulingParty && <span className="partyModal-rulingBadge">◆ 执政联盟 · RULING</span>}
              </div>
            </div>
          </div>
        </div>

        {/* 两栏布局 */}
        <div className="partyModal-grid">
          {/* 左栏 */}
          <div className="partyModal-col">
            <div className="partyModal-section">
              <div className="partyModal-sectionTitle">
                <span className="partyModal-sectionBullet" style={{ background: party.color }} />
                简介 · INTRODUCTION
              </div>
              <div className="partyModal-narrative">{party.description}</div>
            </div>

            {detail && (
              <>
                <div className="partyModal-section">
                  <div className="partyModal-sectionTitle">
                    <span className="partyModal-sectionBullet" style={{ background: party.color }} />
                    核心思想 · CORE IDEOLOGY
                  </div>
                  <div className="partyModal-narrative">{detail.coreIdeology}</div>
                </div>

                <div className="partyModal-section">
                  <div className="partyModal-sectionTitle">
                    <span className="partyModal-sectionBullet" style={{ background: party.color }} />
                    党纲主旨 · PLATFORM
                  </div>
                  <div className="partyModal-narrative">{detail.platform}</div>
                </div>

                <div className="partyModal-section">
                  <div className="partyModal-sectionTitle">
                    <span className="partyModal-sectionBullet" style={{ background: party.color }} />
                    主要政策 · POLICIES
                  </div>
                  <ul className="partyModal-policyList">
                    {detail.policies.map((p, i) => (
                      <li key={i} className="partyModal-policyItem">
                        <span className="partyModal-policyMarker" style={{ color: party.color }}>▸</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>

          {/* 右栏 */}
          <div className="partyModal-col">
            {detail && (
              <div className="partyModal-section">
                <div className="partyModal-sectionTitle">
                  <span className="partyModal-sectionBullet" style={{ background: party.color }} />
                  选民基础 · BASE
                </div>
                <div className="partyModal-narrative">{detail.base}</div>
              </div>
            )}

            <div className="partyModal-section">
              <div className="partyModal-sectionTitle">
                <span className="partyModal-sectionBullet" style={{ background: party.color }} />
                组织数据 · STATS
              </div>
              <div className="partyModal-statBlock">
                <div className="partyModal-statItem">
                  <span className="partyModal-statLabel">组织力</span>
                  <div className="partyModal-statBarWrap">
                    <div className="partyModal-statBar" style={{ width: `${party.organization}%`, background: party.color }} />
                  </div>
                  <span className="partyModal-statValue">{party.organization}</span>
                </div>
                <div className="partyModal-statItem">
                  <span className="partyModal-statLabel">魅力值</span>
                  <div className="partyModal-statBarWrap">
                    <div className="partyModal-statBar" style={{ width: `${party.charisma}%`, background: party.color }} />
                  </div>
                  <span className="partyModal-statValue">{party.charisma}</span>
                </div>
                <div className="partyModal-statRow">
                  <span className="partyModal-statLabel">资金</span>
                  <span className="partyModal-statMoney">{party.funds} 百万</span>
                </div>
              </div>
            </div>

            <div className="partyModal-section">
              <div className="partyModal-sectionTitle">
                <span className="partyModal-sectionBullet" style={{ background: party.color }} />
                主要成员 · KEY MEMBERS
              </div>
              <div className="partyModal-membersList">
                <span className="partyModal-memberLeader">
                  <span className="partyModal-memberRole">党首</span>
                  {party.leader}
                </span>
                {party.members.map((m, i) => (
                  <span key={i} className="partyModal-member">{m}</span>
                ))}
              </div>
            </div>

            <div className="partyModal-section">
              <div className="partyModal-sectionTitle">
                <span className="partyModal-sectionBullet" style={{ background: party.color }} />
                党际关系 · RELATIONS
              </div>
              <div className="partyModal-relationsList">
                {relations.map(rel => {
                  const target = allParties.find(p => p.id === rel.to);
                  if (!target) return null;
                  const relColor = RELATION_COLORS[rel.type] ?? '#888';
                  return (
                    <div key={`${rel.from}-${rel.to}`} className="partyModal-relationRow">
                      <span className="partyModal-relationDot" style={{ background: target.color }} />
                      <span className="partyModal-relationTarget">{target.name}</span>
                      <span
                        className="partyModal-relationBadge"
                        style={{ color: relColor, borderColor: `${relColor}80` }}
                      >
                        {RELATION_LABELS[rel.type] ?? rel.type} {rel.score > 0 ? `+${rel.score}` : rel.score}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* 关闭按钮：作为 overlay 的兄弟节点，脱离 backdrop-filter 包含块 */}
    <button className="partyModal-closeBtn" onClick={onClose} title="关闭" aria-label="关闭">
      ✕
    </button>
    </>
  );
};
