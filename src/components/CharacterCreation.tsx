import React, { useState } from 'react';
import type { PlayerConfig, Party, Ideology } from '../types';
import { initialParties } from '../data/parties';
import { getLLMConfig, setLLMConfig, testLLMConnection, askLLMText, isLLMAvailable } from '../engine';

interface CharacterCreationProps {
  onComplete: (config: PlayerConfig) => void;
}

const IDEOLOGY_LABELS: Record<Ideology, string> = {
  'far-left': '极左',
  'left': '左翼',
  'center-left': '中左',
  'center': '中间',
  'center-right': '中右',
  'right': '右翼',
  'far-right': '极右',
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

const PRESETS: Array<{ label: string; baseUrl: string; model: string }> = [
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'Kimi (月之暗面)', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
  { label: 'GLM (智谱)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
  { label: '自定义', baseUrl: '', model: '' },
];

/** 政党详情展开卡片 */
const PartyDetailCard: React.FC<{
  party: Party;
  isSelected: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
}> = ({ party, isSelected, isExpanded, onToggle, onSelect }) => {
  const seatPercent = ((party.projectedSeats / 200) * 100).toFixed(1);

  return (
    <div style={{
      ...styles.partyCard,
      borderColor: isSelected ? party.color : '#2a2a4a',
      boxShadow: isSelected ? `0 0 16px ${party.color}30` : 'none',
    }}>
      {/* 头部：点击选择 + 展开 */}
      <div style={styles.partyCardHeader} onClick={onSelect}>
        <div style={styles.partyCardLeft}>
          <span style={{ ...styles.partyDot, background: party.color }} />
          <div>
            <div style={styles.partyCardName}>
              {party.name}
              <span style={styles.partyCardAbbr}>({party.abbreviation})</span>
            </div>
            <div style={styles.partyCardSubLine}>
              <span style={{ ...styles.ideologyTag, color: IDEOLOGY_COLORS[party.ideology], borderColor: IDEOLOGY_COLORS[party.ideology] + '60' }}>
                {IDEOLOGY_LABELS[party.ideology]}
              </span>
              <span style={styles.partyCardSeats}>{party.projectedSeats} 席 ({seatPercent}%)</span>
              <span style={styles.partyCardLeader}>党首: {party.leader}</span>
            </div>
          </div>
        </div>
        <div style={styles.partyCardRight}>
          {isSelected && <span style={{ ...styles.selectedBadge, background: party.color }}>已选择</span>}
          <button
            style={styles.expandBtn}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* 展开详情 */}
      {isExpanded && (
        <div style={styles.partyDetail}>
          <div style={styles.partyDesc}>{party.description}</div>

          <div style={styles.partyStats}>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>支持率</span>
              <div style={styles.statBarWrap}>
                <div style={{ ...styles.statBar, width: `${party.currentSupport}%`, background: party.color }} />
              </div>
              <span style={styles.statValue}>{party.currentSupport}%</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>组织力</span>
              <div style={styles.statBarWrap}>
                <div style={{ ...styles.statBar, width: `${party.organization}%`, background: party.color }} />
              </div>
              <span style={styles.statValue}>{party.organization}</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>魅力</span>
              <div style={styles.statBarWrap}>
                <div style={{ ...styles.statBar, width: `${party.charisma}%`, background: party.color }} />
              </div>
              <span style={styles.statValue}>{party.charisma}</span>
            </div>
            <div style={styles.statRow}>
              <span style={styles.statLabel}>资金</span>
              <span style={styles.statMoney}>{party.funds} 百万</span>
            </div>
            <div style={styles.statRow}>
              <span style={styles.statLabel}>席位数</span>
              <span style={styles.statSeats}>{party.projectedSeats} / 200</span>
            </div>
            <div style={styles.statRow}>
              <span style={styles.statLabel}>主要成员</span>
              <span style={styles.statMembers}>{party.members.join('、')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const CharacterCreation: React.FC<CharacterCreationProps> = ({ onComplete }) => {
  const saved = getLLMConfig();

  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [age, setAge] = useState(30);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [partyId, setPartyId] = useState(initialParties[0].id);
  const [background, setBackground] = useState('');
  const [expandedParty, setExpandedParty] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [generating, setGenerating] = useState(false);

  // LLM 配置
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl);
  const [apiKey, setApiKey] = useState(saved.apiKey);
  const [model, setModel] = useState(saved.model);
  const [presetIdx, setPresetIdx] = useState(() => {
    const idx = PRESETS.findIndex(p => p.baseUrl === saved.baseUrl);
    return idx >= 0 ? idx : PRESETS.length - 1;
  });
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const ageError = age < 25 ? '年龄不能小于25岁（众议员年龄下限）' : '';
  const hasBackground = background.trim().length > 0;
  const canSubmit = lastName.trim().length >= 1 && firstName.trim().length >= 1 && age >= 25 && hasBackground;

  const handlePreset = (idx: number) => {
    setPresetIdx(idx);
    const p = PRESETS[idx];
    if (p.baseUrl) {
      setBaseUrl(p.baseUrl);
      setModel(p.model);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testLLMConnection(baseUrl, apiKey, model);
    setTestResult(result);
    if (result.ok) {
      setLLMConfig({ baseUrl, apiKey, model });
    }
    setTesting(false);
  };

  /** AI 生成背景故事 */
  const handleAIGenerate = async () => {
    console.log('[AI Background] Starting generation...');
    setGenerating(true);
    const party = initialParties.find(p => p.id === partyId);
    if (!party) {
      console.error('[AI Background] Party not found:', partyId);
      setGenerating(false);
      return;
    }

    // 先保存当前 LLM 配置（确保用户已输入的 key 生效）
    setLLMConfig({ baseUrl, apiKey, model });

    const systemPrompt = `你是一个日本政治模拟游戏的角色设定助手。请为玩家生成一段简短的从政背景故事（80-150字）。

重要设定：
- 这是日本国会众议院（国家议会），不是地方议会
- 议员是国会议员（众议员），不是都议员或地方议会议员
- 所有政治活动都在国会进行
- 称呼为"国会"、"众议院"、"国会议员"

故事需要：
- 符合该政党的政治立场和选民基础
- 包含从政动机和简要履历
- 语气庄重，像真实政治人物传记
- 用第三人称叙述
- 不要加引号
- 明确说明是"众议院议员"或"国会议员"`;

    const userPrompt = `玩家姓名：${lastName.trim() || '佐藤'} ${firstName.trim() || '太郎'}
性别：${gender === 'male' ? '男' : '女'}
年龄：${age}岁
所属党派：${party.name}（${party.abbreviation}）
党派理念：${party.description}
意识形态：${IDEOLOGY_LABELS[party.ideology]}

注意：玩家是国会众议院议员（国家级别），不是地方议会议员。

请生成这段背景故事。`;

    console.log('[AI Background] Calling askLLMText...');
    console.log('[AI Background] LLM available:', isLLMAvailable());
    console.log('[AI Background] Config:', { baseUrl, model: model || '(empty)', apiKey: apiKey ? '(set)' : '(empty)' });

    const result = await askLLMText(systemPrompt, userPrompt);

    console.log('[AI Background] Result:', result);

    if (result) {
      setBackground(result);
    } else {
      console.log('[AI Background] Using fallback template');
      // Fallback：无 API 时生成模板背景
      const genderNoun = gender === 'male' ? '他' : '她';
      const templates: Record<string, string> = {
        reform: `${lastName.trim() || '佐藤'} ${firstName.trim() || '太郎'}，${age}岁，毕业于知名大学法学部。曾在地方政府担任政策顾问多年，因推动行政改革方案而受到关注。${genderNoun}以务实的作风和对制度改革的执着信念获得选民支持，在本次大选中首次当选众议院议员，加入改革民主党。`,
        liberty: `${lastName.trim() || '佐藤'} ${firstName.trim() || '太郎'}，${age}岁，拥有商学院学位和创业经历。曾在科技行业创办企业，主张通过创新和市场竞争解决社会问题。${genderNoun}相信自由市场是推动社会进步的最大动力，在本次大选中当选众议院议员，加入自由党后积极推动放松管制和减税政策。`,
        conservative: `${lastName.trim() || '佐藤'} ${firstName.trim() || '太郎'}，${age}岁，出身地方政治世家。虽从地方议会起步，但深耕基层多年，始终坚守传统价值观。${genderNoun}关注农村发展和国家安全问题，在保守派选民中有较高声望，本次代表国民保守党当选众议院议员。`,
        progressive: `${lastName.trim() || '佐藤'} ${firstName.trim() || '太郎'}，${age}岁，社会运动出身的政治人物。曾在环保组织和社会福利机构工作，长期关注弱势群体权益。${genderNoun}以改善民生和推动社会公平为己任，在本次大选中当选众议院议员，代表社会联盟进入国会。`,
        populist: `${lastName.trim() || '佐藤'} ${firstName.trim() || '太郎'}，${age}岁，媒体人出身。曾在地方电视台担任新闻主播，因公开批评精英政治而获得大量基层支持者。${genderNoun}主张将普通公民的利益置于首位，以犀利的言辞和鲜明的立场在第一公民阵线中崭露头角，成功当选众议院议员。`,
        solidarity: `${lastName.trim() || '佐藤'} ${firstName.trim() || '太郎'}，${age}岁，工会活动家出身。在工厂工作期间参与劳工权益运动，逐步走上从政道路。${genderNoun}深切了解劳动者的困境，加入联合劳工党后致力于维护工人权益、推动社会公平，在本次选举中成功当选众议院议员。`,
      };
      setBackground(templates[partyId] || templates.reform);
    }
    setGenerating(false);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    setLLMConfig({ baseUrl, apiKey, model });
    onComplete({
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      age,
      gender,
      partyId,
      background: background.trim(),
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>创建你的角色</h2>
        <p style={styles.subtitle}>你是一名新当选的众议院议员。2058年，日本政坛正处于十字路口。</p>

        {/* ===== 全局设定 ===== */}
        <button style={styles.settingsToggle} onClick={() => setShowSettings(s => !s)}>
          {showSettings ? '▼ 全局设定（API 配置）' : '▶ 全局设定（API 配置）'}
        </button>

        {showSettings && (
          <div style={styles.settingsPanel}>
            <div style={styles.settingsHint}>
              配置任意 OpenAI 兼容 API 以启用 AI 推演。所有请求直接从浏览器发出，需 API 服务商允许跨域（CORS）。
              没有配置时将使用规则引擎 fallback。
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>服务商预设</label>
              <div style={styles.presetRow}>
                {PRESETS.map((p, i) => (
                  <button
                    key={i}
                    style={{
                      ...styles.presetBtn,
                      ...(presetIdx === i ? styles.presetBtnActive : {}),
                    }}
                    onClick={() => handlePreset(i)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>API Base URL</label>
              <input
                style={styles.input}
                value={baseUrl}
                onChange={(e) => { setBaseUrl(e.target.value); setPresetIdx(PRESETS.length - 1); }}
                placeholder="https://api.xxx.com/v1"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>API Key</label>
              <input
                style={styles.input}
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>模型名称</label>
              <input
                style={styles.input}
                value={model}
                onChange={(e) => { setModel(e.target.value); setPresetIdx(PRESETS.length - 1); }}
                placeholder="deepseek-chat / gpt-4o-mini / ..."
              />
            </div>

            <div style={styles.testRow}>
              <button
                style={{
                  ...styles.testBtn,
                  opacity: (baseUrl && apiKey && model && !testing) ? 1 : 0.4,
                }}
                onClick={handleTest}
                disabled={!baseUrl || !apiKey || !model || testing}
              >
                {testing ? '验证中...' : '验证连接'}
              </button>
            </div>
            {testResult?.ok && (
              <div style={styles.statusOk}>连接成功！模型可用。</div>
            )}
            {testResult && !testResult.ok && (
              <div style={styles.statusFailBox}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: '#e0e0e0' }}>连接失败</div>
                <div style={styles.statusFailDetail}>{testResult.error}</div>
              </div>
            )}
          </div>
        )}

        <div style={styles.divider} />

        {/* ===== 角色创建 ===== */}
        <div style={styles.formGroup}>
          <label style={styles.label}>姓名</label>
          <div style={styles.nameRow}>
            <input
              style={{ ...styles.input, ...styles.nameInput }}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="姓氏"
            />
            <input
              style={{ ...styles.input, ...styles.nameInput }}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="名字"
            />
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>年龄</label>
          <input
            style={{ ...styles.input, ...(ageError ? styles.inputError : {}) }}
            type="number"
            value={age}
            onChange={(e) => setAge(parseInt(e.target.value) || 0)}
            min={25}
            max={80}
          />
          {ageError && <span style={styles.error}>{ageError}</span>}
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>性别</label>
          <div style={styles.genderRow}>
            <button
              style={{ ...styles.genderBtn, ...(gender === 'male' ? styles.genderActive : {}) }}
              onClick={() => setGender('male')}
            >男</button>
            <button
              style={{ ...styles.genderBtn, ...(gender === 'female' ? styles.genderActive : {}) }}
              onClick={() => setGender('female')}
            >女</button>
          </div>
        </div>

        {/* ===== 党派选择（可展开详情） ===== */}
        <div style={styles.formGroup}>
          <label style={styles.label}>所属党派 <span style={styles.labelHint}>点击选中，点击 ▼ 查看详情</span></label>
          <div style={styles.partyGrid}>
            {initialParties.map((party) => (
              <PartyDetailCard
                key={party.id}
                party={party}
                isSelected={partyId === party.id}
                isExpanded={expandedParty === party.id}
                onToggle={() => setExpandedParty(expandedParty === party.id ? null : party.id)}
                onSelect={() => setPartyId(party.id)}
              />
            ))}
          </div>
        </div>

        {/* ===== 背景故事（必填） ===== */}
        <div style={styles.formGroup}>
          <label style={styles.label}>
            背景故事 <span style={styles.requiredMark}>*必填</span>
          </label>
          <textarea
            style={{
              ...styles.textarea,
              ...(!hasBackground && background.trim().length === 0 && background.length > 0 ? styles.inputError : {}),
            }}
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            placeholder="简述你的从政经历和从政动机（必须填写才能进入国会）..."
            rows={4}
          />
          <div style={styles.backgroundActions}>
            {!hasBackground && (
              <span style={styles.backgroundWarn}>没有背景设定不能进入国会</span>
            )}
            <button
              style={{
                ...styles.aiGenBtn,
                opacity: generating ? 0.5 : 1,
              }}
              onClick={handleAIGenerate}
              disabled={generating}
            >
              {generating ? 'AI 生成中...' : '✦ AI 一键生成背景'}
            </button>
          </div>
        </div>

        <button
          style={{
            ...styles.submitBtn,
            ...(canSubmit ? {} : styles.submitDisabled),
            ...(canSubmit ? { background: `linear-gradient(135deg, ${initialParties.find(p => p.id === partyId)?.color ?? '#1E88E5'}, ${initialParties.find(p => p.id === partyId)?.color ?? '#42A5F5'}cc)` } : {}),
          }}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {!hasBackground ? '请填写背景故事' : '进入国会'}
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f0f23',
    padding: 24,
  },
  card: {
    maxWidth: 640,
    width: '100%',
    background: '#1a1a2e',
    borderRadius: 12,
    border: '1px solid #2a2a4a',
    padding: '32px 28px',
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    color: '#e0e0e0',
    textAlign: 'center' as const,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center' as const,
    margin: '8px 0 24px',
  },
  // Settings
  settingsToggle: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 6,
    border: '1px solid #3a3a5a',
    background: '#0f0f23',
    color: '#888',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left' as const,
    marginBottom: 8,
  },
  settingsPanel: {
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: '14px',
    marginBottom: 16,
    border: '1px solid #2a3a5c',
  },
  settingsHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 14,
    lineHeight: 1.6,
  },
  presetRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  presetBtn: {
    padding: '5px 12px',
    borderRadius: 4,
    border: '1px solid #3a3a5a',
    background: '#0f0f23',
    color: '#888',
    fontSize: 12,
    cursor: 'pointer',
  },
  presetBtnActive: {
    borderColor: '#5c8aff',
    color: '#fff',
    background: '#1a2540',
  },
  testRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  testBtn: {
    padding: '8px 20px',
    borderRadius: 6,
    border: '1px solid #5c8aff',
    background: '#1a2540',
    color: '#5c8aff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  statusOk: {
    fontSize: 12,
    color: '#66BB6A',
    fontWeight: 700,
    marginTop: 8,
    padding: '6px 10px',
    background: 'rgba(102,187,106,0.1)',
    borderRadius: 4,
  },
  statusFailBox: {
    marginTop: 8,
    padding: '8px 10px',
    background: 'rgba(239,83,80,0.1)',
    borderRadius: 4,
    border: '1px solid rgba(239,83,80,0.3)',
  },
  statusFailDetail: {
    fontSize: 11,
    color: '#EF5350',
    wordBreak: 'break-all' as const,
    lineHeight: 1.5,
    fontFamily: 'monospace',
  },
  divider: {
    borderBottom: '1px solid #2a2a4a',
    margin: '16px 0',
  },
  // Name
  nameRow: {
    display: 'flex',
    gap: 10,
  },
  nameInput: {
    flex: 1,
  },
  // Form
  formGroup: {
    marginBottom: 20,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#aaa',
    marginBottom: 6,
  },
  labelHint: {
    fontSize: 11,
    color: '#555',
    fontWeight: 400,
    marginLeft: 6,
  },
  requiredMark: {
    color: '#EF5350',
    fontSize: 11,
    fontWeight: 400,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 6,
    border: '1px solid #3a3a5a',
    background: '#0f0f23',
    color: '#e0e0e0',
    fontSize: 15,
    boxSizing: 'border-box' as const,
  },
  inputError: {
    borderColor: '#E53935',
  },
  error: {
    display: 'block',
    fontSize: 12,
    color: '#E53935',
    marginTop: 4,
  },
  genderRow: {
    display: 'flex',
    gap: 10,
  },
  genderBtn: {
    padding: '8px 24px',
    borderRadius: 6,
    border: '1px solid #3a3a5a',
    background: '#0f0f23',
    color: '#aaa',
    fontSize: 15,
    cursor: 'pointer',
    fontWeight: 600,
  },
  genderActive: {
    borderColor: '#5c8aff',
    color: '#fff',
    background: '#1a2540',
  },
  // ===== 党派卡片 =====
  partyGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  partyCard: {
    borderRadius: 8,
    border: '1px solid #2a2a4a',
    background: '#0f0f23',
    overflow: 'hidden',
    transition: 'all 0.2s',
  },
  partyCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  partyCardLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  partyCardRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  partyCardName: {
    fontSize: 15,
    fontWeight: 700,
    color: '#e0e0e0',
  },
  partyCardAbbr: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
    fontWeight: 400,
  },
  partyCardSubLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
    flexWrap: 'wrap' as const,
  },
  ideologyTag: {
    fontSize: 11,
    fontWeight: 700,
    padding: '1px 8px',
    borderRadius: 3,
    border: '1px solid',
    lineHeight: '18px',
  },
  partyCardSeats: {
    fontSize: 12,
    color: '#888',
    fontWeight: 600,
  },
  partyCardLeader: {
    fontSize: 11,
    color: '#666',
  },
  selectedBadge: {
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 10px',
    borderRadius: 3,
    color: '#fff',
    letterSpacing: 1,
  },
  expandBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    border: '1px solid #3a3a5a',
    background: '#1a1a2e',
    color: '#888',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    transition: 'all 0.15s',
  },
  // ===== 展开详情 =====
  partyDetail: {
    padding: '0 14px 14px',
    borderTop: '1px solid #2a2a4a',
  },
  partyDesc: {
    fontSize: 13,
    color: '#999',
    lineHeight: 1.6,
    marginTop: 10,
    marginBottom: 12,
  },
  partyStats: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#777',
    fontWeight: 600,
    width: 60,
    flexShrink: 0,
  },
  statBarWrap: {
    flex: 1,
    height: 6,
    background: '#1a1a2e',
    borderRadius: 3,
    overflow: 'hidden',
  },
  statBar: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.3s',
    opacity: 0.8,
  },
  statValue: {
    fontSize: 12,
    color: '#aaa',
    fontWeight: 700,
    width: 36,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  statRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  statMoney: {
    fontSize: 13,
    color: '#FFD54F',
    fontWeight: 700,
  },
  statSeats: {
    fontSize: 13,
    color: '#5c8aff',
    fontWeight: 700,
  },
  statMembers: {
    fontSize: 12,
    color: '#888',
    lineHeight: 1.5,
  },
  partyDot: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    flexShrink: 0,
  },
  // ===== 背景故事 =====
  backgroundActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  backgroundWarn: {
    fontSize: 12,
    color: '#EF5350',
    fontWeight: 600,
  },
  aiGenBtn: {
    padding: '7px 16px',
    borderRadius: 6,
    border: '1px solid #7C4DFF',
    background: 'linear-gradient(135deg, #311B92, #4A148C)',
    color: '#B388FF',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'all 0.15s',
  },
  textarea: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 6,
    border: '1px solid #3a3a5a',
    background: '#0f0f23',
    color: '#e0e0e0',
    fontSize: 14,
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
    lineHeight: 1.6,
  },
  submitBtn: {
    width: '100%',
    padding: '12px 0',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #1E88E5, #42A5F5)',
    color: '#fff',
    fontSize: 17,
    fontWeight: 800,
    cursor: 'pointer',
    letterSpacing: 4,
    marginTop: 8,
    transition: 'all 0.2s',
  },
  submitDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
};
