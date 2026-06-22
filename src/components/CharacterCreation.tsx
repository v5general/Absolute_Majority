import React, { useState, useEffect } from 'react';
import type { PlayerConfig, Party, Ideology, PersonalityTrait, PoliticalIdeology } from '../types';
import { BackgroundImage } from './BackgroundImage';
import './CharacterCreation.css';
import { PERSONALITY_TRAIT_LABELS, POLITICAL_IDEOLOGY_LABELS } from '../types';
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

const ALL_TRAITS = Object.entries(PERSONALITY_TRAIT_LABELS) as [PersonalityTrait, string][];

// 意识形态合并映射：多个 key 共用同一标签，选择时任选一个即可
const MERGED_IDEOLOGIES: Array<{ keys: PoliticalIdeology[]; label: string }> = [
  { keys: ['socialism', 'communism'], label: '社会主义·共产主义' },
  { keys: ['democratic_socialism'], label: '社会民主主义' },
  { keys: ['anarchism'], label: '无政府主义' },
  { keys: ['syndicalism'], label: '工团主义' },
  { keys: ['trotskyism'], label: '托洛茨基主义' },
  { keys: ['maoism'], label: '毛主义' },
  { keys: ['liberalism'], label: '自由主义' },
  { keys: ['neoliberalism'], label: '新自由主义' },
  { keys: ['progressivism'], label: '进步主义' },
  { keys: ['libertarianism'], label: '自由意志主义' },
  { keys: ['social_liberalism'], label: '社会自由主义' },
  { keys: ['conservatism'], label: '保守主义' },
  { keys: ['neoconservatism'], label: '新保守主义' },
  { keys: ['liberal_conservatism'], label: '自由保守主义' },
  { keys: ['traditionalism'], label: '传统主义' },
  { keys: ['nationalism'], label: '民族主义' },
  { keys: ['militarism', 'fascism', 'chauvinism'], label: '军国·法西斯·沙文主义' },
  { keys: ['regionalism'], label: '地方主义' },
  { keys: ['theocracy', 'fundamentalism'], label: '神权政治·原教旨主义' },
  { keys: ['secularism'], label: '世俗主义' },
  { keys: ['environmentalism'], label: '环保主义' },
  { keys: ['feminism'], label: '女权主义' },
  { keys: ['populism'], label: '民粹主义' },
  { keys: ['authoritarianism'], label: '威权主义' },
  { keys: ['technocracy'], label: '技术官僚主义' },
  { keys: ['corporatism'], label: '统合主义' },
  { keys: ['pacifism'], label: '和平主义' },
  { keys: ['monarchism'], label: '君主主义' },
  { keys: ['republicanism'], label: '共和主义' },
];

// 意识形态含义阐述
const IDEOLOGY_DESCRIPTIONS: Record<string, string> = {
  '社会主义·共产主义': '追求公有制和阶级平等，通过革命或渐进方式实现社会主义经济制度',
  '社会民主主义': '在资本主义框架内，通过福利国家和政策干预实现社会公正和改良',
  '无政府主义': '废除国家机器，建立基于自愿合作的无政府社会',
  '工团主义': '工人自治，工会掌管生产和分配，反对资本主义剥削',
  '托洛茨基主义': '世界革命，不断革命，反对官僚主义的一国社会主义',
  '毛主义': '农村包围城市，人民战争，发动群众进行阶级斗争',
  '自由主义': '个人自由和权利至上，支持市场经济和有限政府',
  '新自由主义': '经济自由化，私有化，放松管制，强调市场竞争',
  '进步主义': '推动社会改革和科学技术进步，反对保守和停滞',
  '自由意志主义': '最小政府，最大个人自治，强调自由市场和公民自由',
  '社会自由主义': '经济自由结合社会福利，追求社会正义和个人自由',
  '保守主义': '维护传统价值观，渐进改革，重视秩序和稳定',
  '新保守主义': '强力政府，干预主义，在国内外推行保守价值观',
  '自由保守主义': '经济保守结合社会自由，平衡传统与现代性',
  '传统主义': '宗教/文化传统至上，反对激进变革和社会转型',
  '民族主义': '民族利益至上，强调民族认同和国家主权',
  '军国·法西斯·沙文主义': '极端民族主义，极权统治，崇尚暴力和战争',
  '地方主义': '地方自治优先，区域利益和本地文化保护',
  '神权政治·原教旨主义': '宗教法则统治，严格遵循宗教教义和法律',
  '世俗主义': '政教分离，宗教不得干预政治和法律',
  '环保主义': '环境保护优先，可持续发展，反对污染和破坏生态',
  '女权主义': '性别平等，反对性别歧视，推动女性权利和机会平等',
  '民粹主义': '人民对抗精英，反建制，强调平民意志和直接民主',
  '威权主义': '强力领导，秩序优先，限制部分自由以维持稳定',
  '技术官僚主义': '专家治国，技术精英治理，强调科学性和效率',
  '统合主义': '阶级合作，团体协商，各利益集团参与决策',
  '和平主义': '反对战争，非暴力，和平解决国际冲突',
  '君主主义': '保留君主或君主立宪，传统王权象征性存在',
  '共和主义': '共和体制，反对君主制，强调公民参与和政治平等',
};

// 经济立场含义
const ECONOMIC_DESCRIPTIONS: Record<string, string> = {
  '极左': '全面公有制，计划经济，国家控制所有生产资料',
  '左': '公有制为主，有限市场，强调国家干预和财富再分配',
  '中间偏左': '混合经济，偏向国家调控，重视社会福利和公共服务',
  '中间': '市场经济与政府干预平衡，兼顾效率和公平',
  '中间偏右': '市场主导，有限政府，鼓励私营企业和投资',
  '右': '私有制和市场经济为主，减少政府干预和管制',
  '极右': '完全自由市场，最小政府，废除大部分经济管制',
};

// 社会立场含义
const SOCIAL_DESCRIPTIONS: Record<string, string> = {
  '威权': '强力维护社会秩序，限制部分个人自由以保持稳定',
  '保守': '重视传统价值观和道德标准，渐进式社会变革',
  '自由': '平衡个人自由和社会秩序，支持多元化和包容性',
  '进步': '推动社会改革和进步价值观，重视平等和多样性',
  '激进自由': '最大化个人自由，反对传统束缚，激进社会变革',
};

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
    <div
      className="charCreate-partyCard"
      style={{
        borderColor: isSelected ? party.color : 'rgba(192, 168, 130, 0.15)',
        boxShadow: isSelected ? `0 0 16px ${party.color}30` : 'none',
      }}
    >
      {/* 头部：点击选择 + 展开 */}
      <div className="charCreate-partyCardHeader" onClick={onSelect}>
        <div className="charCreate-partyCardLeft">
          <span className="charCreate-partyDot" style={{ background: party.color }} />
          <div>
            <div className="charCreate-partyCardName">
              {party.name}
              <span className="charCreate-partyCardAbbr">({party.abbreviation})</span>
            </div>
            <div className="charCreate-partyCardSubLine">
              <span
                className="charCreate-ideologyTag"
                style={{ color: IDEOLOGY_COLORS[party.ideology], border: `1px solid ${IDEOLOGY_COLORS[party.ideology]}60` }}
              >
                {IDEOLOGY_LABELS[party.ideology]}
              </span>
              <span className="charCreate-partyCardSeats">{party.projectedSeats} 席 ({seatPercent}%)</span>
              <span className="charCreate-partyCardLeader">党首: {party.leader}</span>
            </div>
          </div>
        </div>
        <div className="charCreate-partyCardRight">
          {isSelected && <span className="charCreate-selectedBadge" style={{ background: party.color }}>已选择</span>}
          <button
            className="charCreate-btn charCreate-expandBtn"
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* 展开详情 */}
      {isExpanded && (
        <div className="charCreate-partyDetail">
          <div className="charCreate-partyDesc">{party.description}</div>

          <div className="charCreate-partyStats">
            <div className="charCreate-statItem">
              <span className="charCreate-statLabel">支持率</span>
              <div className="charCreate-statBarWrap">
                <div className="charCreate-statBar" style={{ width: `${party.currentSupport}%`, background: party.color }} />
              </div>
              <span className="charCreate-statValue">{party.currentSupport}%</span>
            </div>
            <div className="charCreate-statItem">
              <span className="charCreate-statLabel">组织力</span>
              <div className="charCreate-statBarWrap">
                <div className="charCreate-statBar" style={{ width: `${party.organization}%`, background: party.color }} />
              </div>
              <span className="charCreate-statValue">{party.organization}</span>
            </div>
            <div className="charCreate-statItem">
              <span className="charCreate-statLabel">魅力</span>
              <div className="charCreate-statBarWrap">
                <div className="charCreate-statBar" style={{ width: `${party.charisma}%`, background: party.color }} />
              </div>
              <span className="charCreate-statValue">{party.charisma}</span>
            </div>
            <div className="charCreate-statRow">
              <span className="charCreate-statLabel">资金</span>
              <span className="charCreate-statMoney">{party.funds} 百万</span>
            </div>
            <div className="charCreate-statRow">
              <span className="charCreate-statLabel">席位数</span>
              <span className="charCreate-statSeats">{party.projectedSeats} / 200</span>
            </div>
            <div className="charCreate-statRow">
              <span className="charCreate-statLabel">主要成员</span>
              <span className="charCreate-statMembers">{party.members.join('、')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const CharacterCreation: React.FC<CharacterCreationProps> = ({ onComplete }) => {
  const saved = getLLMConfig();

  // 挂载时滚动到页面顶部
  useEffect(() => {
    // 多种方式确保滚动到顶部
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [age, setAge] = useState<number | ''>('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [partyId, setPartyId] = useState(initialParties[0].id);
  const [background, setBackground] = useState('');
  const [expandedParty, setExpandedParty] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingGoal, setGeneratingGoal] = useState(false);

  // 新增属性
  const [personalityTraits, setPersonalityTraits] = useState<PersonalityTrait[]>([]);
  const [ideologyOpen, setIdeologyOpen] = useState(false);
  const [politicalIdeology, setPoliticalIdeology] = useState<PoliticalIdeology | ''>('');
  const [hoveredIdeologyLabel, setHoveredIdeologyLabel] = useState<string>('');
  const [economicAxis, setEconomicAxis] = useState(0);
  const [socialAxis, setSocialAxis] = useState(0);
  const [politicalGoal, setPoliticalGoal] = useState('');

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

  const ageError = age !== '' && age < 25 ? '年龄不能小于25岁（众议员年龄下限）' : age !== '' && age > 80 ? '年龄不能大于80岁' : '';
  const hasBackground = background.trim().length > 0;
  const hasGoal = politicalGoal.trim().length > 0;
  // 前置字段是否填写完整（用于 AI 生成按钮的启用判断）
  const preGoalComplete = lastName.trim().length >= 1 && firstName.trim().length >= 1
    && age !== '' && age >= 25 && age <= 80
    && personalityTraits.length >= 1 && politicalIdeology !== '';
  const preBackgroundComplete = preGoalComplete && hasGoal;
  const canSubmit = preBackgroundComplete && hasBackground;

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

  const toggleTrait = (trait: PersonalityTrait) => {
    setPersonalityTraits(prev => {
      if (prev.includes(trait)) return prev.filter(t => t !== trait);
      if (prev.length >= 3) return prev;
      return [...prev, trait];
    });
  };

  const getEconomicLabel = (v: number) => {
    if (v <= -67) return '极左';
    if (v <= -20) return '左';
    if (v <= -5) return '中间偏左';
    if (v <= 5) return '中间';
    if (v <= 20) return '中间偏右';
    if (v <= 67) return '右';
    return '极右';
  };

  const getSocialLabel = (v: number) => {
    if (v <= -60) return '威权';
    if (v <= -20) return '保守';
    if (v <= 20) return '自由';
    if (v <= 60) return '进步';
    return '激进自由';
  };

  /** AI 生成政治目标 */
  const handleAIGenerateGoal = async () => {
    setGeneratingGoal(true);
    setLLMConfig({ baseUrl, apiKey, model });

    const party = initialParties.find(p => p.id === partyId);
    const traitsStr = personalityTraits.map(t => PERSONALITY_TRAIT_LABELS[t]).join('、') || '未选择';

    const systemPrompt = `你是一个架空日本政治模拟游戏的角色设定助手。请为一位新当选的国会议员生成一段简短的政治目标（20-40字）。

要求：
- 目标要具体且符合该议员的政治立场
- 语气庄重
- 不要加引号
- 20-40个汉字`;

    const userPrompt = `玩家姓名：${lastName.trim() || '佐藤'} ${firstName.trim() || '太郎'}
所属党派：${party?.name ?? '未知'}
性格特质：${traitsStr}
意识形态：${politicalIdeology ? POLITICAL_IDEOLOGY_LABELS[politicalIdeology] : '未选择'}
经济立场：${getEconomicLabel(economicAxis)}
社会立场：${getSocialLabel(socialAxis)}

请生成这段政治目标。`;

    const result = await askLLMText(systemPrompt, userPrompt);
    if (result) {
      setPoliticalGoal(result);
    } else {
      setPoliticalGoal('推动改革，为选民争取更多权益，成为值得信赖的国会议员。');
    }
    setGeneratingGoal(false);
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

    const traitsStr = personalityTraits.map(t => PERSONALITY_TRAIT_LABELS[t]).join('、') || '未选择';
    const ideologyStr = politicalIdeology ? POLITICAL_IDEOLOGY_LABELS[politicalIdeology] : '未选择';

    const systemPrompt = `你是一个架空日本政治模拟游戏的角色设定助手。请为玩家生成一段简短的从政背景故事（80-150字）。

## 游戏世界观（必须遵守）
- 时间背景：2058年（不是2021年、不是2024年、不是任何现实年份，只能是2058年）
- 国家：架空日本国，议会内阁制
- 国会：众议院200席（120选区+80比例代表）
- 所有政党均为原创虚构，不映射任何现实日本政党（不存在自民党、立宪民主党等）
- 所有政治人物均为原创虚构，不映射任何现实日本政治家
- 允许使用日本姓名、行政区划、政府机构名称
- 禁止出现现实中任何真实企业或民间团体名称（如日立、丰田、三菱、索尼、软银、经团联等）。如叙事需要涉及企业或团体，请自行创造虚构名称
- 这是国会众议院（国家级），不是地方议会
- 称呼为"国会"、"众议院"、"国会议员"、"众议院议员"

## 故事要求
- 故事时间线在2050年代，必须明确使用2058年的时代背景
- 符合该政党的政治立场和选民基础
- 必须体现玩家选择的性格特质、意识形态、经济社会立场和政治目标
- 包含从政动机和简要履历
- 语气庄重，像真实政治人物传记
- 用第三人称叙述
- 不要加引号
- 明确说明是"众议院议员"或"国会议员"
- 绝对禁止出现任何现实年份（如2021、2022、2023、2024等）`;

    const userPrompt = `当前年份：2058年
玩家姓名：${lastName.trim() || '佐藤'} ${firstName.trim() || '太郎'}
性别：${gender === 'male' ? '男' : '女'}
年龄：${age}岁
所属党派：${party.name}（${party.abbreviation}）
党派理念：${party.description}
意识形态：${IDEOLOGY_LABELS[party.ideology]}

## 玩家政治属性（背景故事必须基于这些信息）
性格特质：${traitsStr}
政治意识形态：${ideologyStr}
经济立场：${getEconomicLabel(economicAxis)}（${economicAxis}）
社会立场：${getSocialLabel(socialAxis)}（${socialAxis}）
政治目标：${politicalGoal.trim() || '未设定'}

注意：玩家是国会众议院议员（国家级别），不是地方议会议员。故事中涉及的年份必须在2050-2058范围内。

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
      age: typeof age === 'number' ? age : 30,
      gender,
      partyId,
      background: background.trim(),
      personalityTraits,
      politicalIdeology: politicalIdeology as PoliticalIdeology,
      economicAxis,
      socialAxis,
      politicalGoal: politicalGoal.trim(),
    });
  };

  // 性格特质按行分组，每行3个
  const traitRows: [PersonalityTrait, string][][] = [];
  for (let i = 0; i < ALL_TRAITS.length; i += 3) {
    traitRows.push(ALL_TRAITS.slice(i, i + 3));
  }

  return (
    <div className="charCreate-container">
      {/* 全屏背景图（WebP优先，PNG回退，响应式） */}
      <BackgroundImage image="character-create-bg" className="charCreate-bgImage" />
      {/* 暗角渐变遮罩 */}
      <div className="charCreate-vignette" />
      <div className="charCreate-card">
        {/* 顶部金色装饰线 */}
        <div className="charCreate-decorLineTop" />
        <h2 className="charCreate-title" data-text="创建你的角色">创建你的角色</h2>
        <p className="charCreate-subtitle">你是一名新当选的众议院议员。2058年，日本政坛正处于十字路口。</p>

        {/* ===== 全局设定 ===== */}
        <button className="charCreate-btn charCreate-settingsToggle" onClick={() => setShowSettings(s => !s)}>
          {showSettings ? '▼ 全局设定（API 配置）' : '▶ 全局设定（API 配置）'}
        </button>

        {showSettings && (
          <div className="charCreate-settingsPanel">
            <div className="charCreate-settingsHint">
              配置任意 OpenAI 兼容 API 以启用 AI 推演。所有请求直接从浏览器发出，需 API 服务商允许跨域（CORS）。
              没有配置时将使用规则引擎 fallback。
              <br /><br />
              <strong>手机端提示：</strong>每回合 AI 推演会串行执行多步 LLM 调用，建议在 Wi-Fi 下进行；移动网络下推演耗时较长但会自动重试。
            </div>

            <div className="charCreate-formGroup">
              <label className="charCreate-label">服务商预设</label>
              <div className="charCreate-presetRow">
                {PRESETS.map((p, i) => (
                  <button
                    key={i}
                    className={`charCreate-btn charCreate-presetBtn ${presetIdx === i ? 'charCreate-presetBtnActive' : ''}`}
                    onClick={() => handlePreset(i)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="charCreate-formGroup">
              <label className="charCreate-label">API Base URL</label>
              <input
                className="charCreate-input"
                value={baseUrl}
                onChange={(e) => { setBaseUrl(e.target.value); setPresetIdx(PRESETS.length - 1); }}
                placeholder="https://api.xxx.com/v1"
              />
            </div>

            <div className="charCreate-formGroup">
              <label className="charCreate-label">API Key</label>
              <input
                className="charCreate-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>

            <div className="charCreate-formGroup">
              <label className="charCreate-label">模型名称</label>
              <input
                className="charCreate-input"
                value={model}
                onChange={(e) => { setModel(e.target.value); setPresetIdx(PRESETS.length - 1); }}
                placeholder="deepseek-chat / gpt-4o-mini / ..."
              />
            </div>

            <div className="charCreate-testRow">
              <button
                className="charCreate-btn charCreate-testBtn"
                style={{ opacity: (baseUrl && apiKey && model && !testing) ? 1 : 0.4 }}
                onClick={handleTest}
                disabled={!baseUrl || !apiKey || !model || testing}
              >
                {testing ? '验证中...' : '验证连接'}
              </button>
            </div>
            {testResult?.ok && (
              <div className="charCreate-statusOk">连接成功！模型可用。</div>
            )}
            {testResult && !testResult.ok && (
              <div className="charCreate-statusFailBox">
                <div style={{ fontWeight: 700, marginBottom: 4, color: '#e0e0e0' }}>连接失败</div>
                <div className="charCreate-statusFailDetail">{testResult.error}</div>
              </div>
            )}
          </div>
        )}

        <div className="charCreate-divider" />

        {/* ===== 角色创建 ===== */}
        <div className="charCreate-formGroup">
          <label className="charCreate-label">姓名</label>
          <div className="charCreate-nameRow">
            <input
              className="charCreate-input charCreate-nameInput"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="姓氏"
            />
            <input
              className="charCreate-input charCreate-nameInput"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="名字"
            />
          </div>
        </div>

        <div className="charCreate-formGroup">
          <label className="charCreate-label">年龄</label>
          <input
            className={`charCreate-input ${ageError ? 'charCreate-inputError' : ''}`}
            type="text"
            inputMode="numeric"
            value={age}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '');
              setAge(v === '' ? '' : parseInt(v));
            }}
            placeholder="请输入年龄（25-80）"
          />
          {ageError && <span className="charCreate-error">{ageError}</span>}
        </div>

        <div className="charCreate-formGroup">
          <label className="charCreate-label">性别</label>
          <div className="charCreate-genderRow">
            <button
              className={`charCreate-btn charCreate-genderBtn ${gender === 'male' ? 'charCreate-genderActive' : ''}`}
              onClick={() => setGender('male')}
            >男</button>
            <button
              className={`charCreate-btn charCreate-genderBtn ${gender === 'female' ? 'charCreate-genderActive' : ''}`}
              onClick={() => setGender('female')}
            >女</button>
          </div>
        </div>

        {/* ===== 性格特质 ===== */}
        <div className="charCreate-formGroup">
          <label className="charCreate-label">
            性格特质 <span className="charCreate-requiredMark">*至少选1个（最多3个）</span>
          </label>
          <div className="charCreate-traitGrid">
            {traitRows.map((row, ri) => (
              <div key={ri} className="charCreate-traitRow">
                {row.map(([trait, label]) => {
                  const selected = personalityTraits.includes(trait);
                  return (
                    <button
                      key={trait}
                      className={`charCreate-btn charCreate-traitBtn ${selected ? 'charCreate-traitBtnActive' : ''} ${personalityTraits.length >= 3 && !selected ? 'charCreate-traitBtnDisabled' : ''}`}
                      onClick={() => toggleTrait(trait)}
                      disabled={personalityTraits.length >= 3 && !selected}
                    >
                      {label}
                    </button>
                  );
                })}
                {/* Pad the row if less than 3 */}
                {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
                  <div key={`pad-${i}`} className="charCreate-traitBtn" style={{ visibility: 'hidden' }} />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ===== 意识形态 ===== */}
        <div className="charCreate-formGroup">
          <label className="charCreate-label">
            政治意识形态
            {(politicalIdeology || hoveredIdeologyLabel) && (
              <span style={{
                fontSize: '11px',
                color: 'rgba(212, 197, 160, 0.5)',
                fontWeight: 400,
                marginLeft: '8px',
                maxWidth: '300px',
              }}>
                — {IDEOLOGY_DESCRIPTIONS[politicalIdeology || hoveredIdeologyLabel] || ''}
              </span>
            )}
          </label>
          <div style={{ position: 'relative' }}>
            <button
              className={`charCreate-btn charCreate-selectTrigger ${ideologyOpen ? 'charCreate-selectTriggerOpen' : ''}`}
              onClick={() => setIdeologyOpen(v => !v)}
              type="button"
            >
              <span style={{
                color: politicalIdeology ? '#e0e0e0' : 'rgba(192, 168, 130, 0.4)',
              }}>
                {politicalIdeology
                  ? MERGED_IDEOLOGIES.find(m => m.keys.includes(politicalIdeology))?.label ?? ''
                  : '-- 请选择意识形态 --'}
              </span>
              <span className="charCreate-selectArrow">{ideologyOpen ? '▲' : '▼'}</span>
            </button>
            {ideologyOpen && (
              <div className="charCreate-selectDropdown">
                {MERGED_IDEOLOGIES.map(({ keys, label }) => {
                  const selected = politicalIdeology !== '' && keys.includes(politicalIdeology);
                  return (
                    <button
                      key={keys[0]}
                      className={`charCreate-btn charCreate-selectOption ${selected ? 'charCreate-selectOptionActive' : ''}`}
                      onClick={() => {
                        setPoliticalIdeology(keys[0]);
                        setIdeologyOpen(false);
                      }}
                      onMouseEnter={() => setHoveredIdeologyLabel(label)}
                      onMouseLeave={() => setHoveredIdeologyLabel('')}
                      type="button"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ===== 经济立场滑块 ===== */}
        <div className="charCreate-formGroup">
          <label className="charCreate-label" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>
              经济立场：<span className="charCreate-sliderValue">{getEconomicLabel(economicAxis)}（{economicAxis}）</span>
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(212, 197, 160, 0.5)', fontWeight: 400, lineHeight: '1.4' }}>
              {ECONOMIC_DESCRIPTIONS[getEconomicLabel(economicAxis)]}
            </div>
          </label>
          <div className="charCreate-sliderContainer">
            <span className="charCreate-sliderEndLabel">极左</span>
            <input
              type="range"
              min={-100}
              max={100}
              value={economicAxis}
              onChange={(e) => setEconomicAxis(parseInt(e.target.value))}
              className="charCreate-slider"
            />
            <span className="charCreate-sliderEndLabel">极右</span>
          </div>
        </div>

        {/* ===== 社会立场滑块 ===== */}
        <div className="charCreate-formGroup">
          <label className="charCreate-label" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>
              社会立场：<span className="charCreate-sliderValue">{getSocialLabel(socialAxis)}（{socialAxis}）</span>
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(212, 197, 160, 0.5)', fontWeight: 400, lineHeight: '1.4' }}>
              {SOCIAL_DESCRIPTIONS[getSocialLabel(socialAxis)]}
            </div>
          </label>
          <div className="charCreate-sliderContainer">
            <span className="charCreate-sliderEndLabel">威权</span>
            <input
              type="range"
              min={-100}
              max={100}
              value={socialAxis}
              onChange={(e) => setSocialAxis(parseInt(e.target.value))}
              className="charCreate-slider"
            />
            <span className="charCreate-sliderEndLabel">激进自由</span>
          </div>
        </div>

        {/* ===== 政治目标 ===== */}
        <div className="charCreate-formGroup">
          <label className="charCreate-label">
            政治目标
          </label>
          <textarea
            className="charCreate-textarea"
            value={politicalGoal}
            onChange={(e) => setPoliticalGoal(e.target.value)}
            placeholder="描述你的政治目标，如：推动教育改革、实现社会公平..."
            rows={2}
          />
          <div className="charCreate-backgroundActions">
            {!preGoalComplete && !hasGoal && (
              <span className="charCreate-backgroundWarn">请先填写上方所有选项</span>
            )}
            {preGoalComplete && !hasGoal && (
              <span className="charCreate-backgroundWarn">请填写政治目标</span>
            )}
            <button
              className="charCreate-btn charCreate-aiGenBtn"
              style={{
                opacity: (!preGoalComplete || generatingGoal) ? 0.4 : 1,
              }}
              onClick={handleAIGenerateGoal}
              disabled={!preGoalComplete || generatingGoal}
            >
              {generatingGoal ? 'AI 生成中...' : '✦ AI 一键生成目标'}
            </button>
          </div>
        </div>

        {/* ===== 党派选择（可展开详情） ===== */}
        <div className="charCreate-formGroup">
          <label className="charCreate-label">所属党派 <span className="charCreate-labelHint">点击选中，点击 ▼ 查看详情</span></label>
          <div className="charCreate-partyGrid">
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
        <div className="charCreate-formGroup">
          <label className="charCreate-label">
            背景故事
          </label>
          <textarea
            className="charCreate-textarea"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            placeholder="简述你的从政经历和从政动机（必须填写才能进入国会）..."
            rows={4}
          />
          <div className="charCreate-backgroundActions">
            {!preBackgroundComplete && !hasBackground && (
              <span className="charCreate-backgroundWarn">请先填写上方所有选项</span>
            )}
            {preBackgroundComplete && !hasBackground && (
              <span className="charCreate-backgroundWarn">没有背景设定不能进入国会</span>
            )}
            <button
              className="charCreate-btn charCreate-aiGenBtn"
              style={{
                opacity: (!preBackgroundComplete || generating) ? 0.4 : 1,
              }}
              onClick={handleAIGenerate}
              disabled={!preBackgroundComplete || generating}
            >
              {generating ? 'AI 生成中...' : '✦ AI 一键生成背景'}
            </button>
          </div>
        </div>

        <button
          className={`charCreate-btn charCreate-submitBtn ${canSubmit ? '' : 'charCreate-submitDisabled'}`}
          style={
            canSubmit ? {
              border: `1px solid rgba(192, 168, 130, 0.55)`,
              boxShadow: `0 0 16px rgba(192, 168, 130, 0.15)`,
            } : {}
          }
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {!hasBackground ? '请填写背景故事' : !hasGoal ? '请填写政治目标' : personalityTraits.length < 1 ? '请选择性格特质' : politicalIdeology === '' ? '请选择意识形态' : '进入国会'}
        </button>
      </div>
    </div>
  );
};

const FONT_SERIF = '"Noto Serif SC", "Source Han Serif SC", Georgia, serif';
const COLOR_GOLD = '#C0A882';
const COLOR_GOLD_LIGHT = '#D4C5A0';
const COLOR_GOLD_DIM = '#B8A47C';
const COLOR_BORDER = 'rgba(192, 168, 130, 0.2)';
const COLOR_BORDER_ACTIVE = 'rgba(192, 168, 130, 0.55)';

const styles: Record<string, React.CSSProperties> = {
  // ===== 背景 =====
  container: {
    position: 'relative',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#000',
    padding: 24,
    fontFamily: `${FONT_SERIF}, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`,
  },
  bgImage: {
    position: 'fixed',
    inset: 0,
    backgroundImage: 'url(/character-create-bg.png)',
    backgroundSize: 'cover',
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat',
    zIndex: 0,
  },
  vignette: {
    position: 'fixed',
    inset: 0,
    zIndex: 0,
    background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.25) 80%, rgba(0,0,0,0.45) 100%)',
    pointerEvents: 'none',
  },
  // ===== 主卡片 =====
  card: {
    position: 'relative',
    zIndex: 1,
    maxWidth: 640,
    width: '100%',
    background: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER}`,
    padding: '32px 28px',
    backdropFilter: 'blur(6px)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 900,
    fontFamily: FONT_SERIF,
    background: `linear-gradient(180deg, ${COLOR_GOLD_LIGHT}, #A08B6B)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    textAlign: 'center' as const,
    letterSpacing: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLOR_GOLD_DIM,
    textAlign: 'center' as const,
    margin: '8px 0 24px',
    letterSpacing: 2,
    fontFamily: FONT_SERIF,
  },
  // Settings
  settingsToggle: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER}`,
    background: 'rgba(0, 0, 0, 0.4)',
    color: COLOR_GOLD_DIM,
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left' as const,
    marginBottom: 8,
    fontFamily: FONT_SERIF,
    transition: 'all 0.2s',
  },
  settingsPanel: {
    background: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 4,
    padding: '14px',
    marginBottom: 16,
    border: `1px solid ${COLOR_BORDER}`,
  },
  settingsHint: {
    fontSize: 12,
    color: 'rgba(192, 168, 130, 0.5)',
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
    border: `1px solid ${COLOR_BORDER}`,
    background: 'rgba(0, 0, 0, 0.3)',
    color: 'rgba(192, 168, 130, 0.6)',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: FONT_SERIF,
    transition: 'all 0.15s',
  },
  presetBtnActive: {
    border: `1px solid ${COLOR_BORDER_ACTIVE}`,
    color: COLOR_GOLD,
    background: 'rgba(192, 168, 130, 0.1)',
  },
  testRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  testBtn: {
    padding: '8px 20px',
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER_ACTIVE}`,
    background: 'rgba(0, 0, 0, 0.4)',
    color: COLOR_GOLD,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    fontFamily: FONT_SERIF,
    transition: 'all 0.2s',
  },
  statusOk: {
    fontSize: 12,
    color: '#81C784',
    fontWeight: 700,
    marginTop: 8,
    padding: '6px 10px',
    background: 'rgba(129, 199, 132, 0.1)',
    borderRadius: 4,
    border: '1px solid rgba(129, 199, 132, 0.2)',
    fontFamily: FONT_SERIF,
  },
  statusFailBox: {
    marginTop: 8,
    padding: '8px 10px',
    background: 'rgba(239, 83, 80, 0.1)',
    borderRadius: 4,
    border: '1px solid rgba(239, 83, 80, 0.25)',
  },
  statusFailDetail: {
    fontSize: 11,
    color: '#EF9A9A',
    wordBreak: 'break-all' as const,
    lineHeight: 1.5,
    fontFamily: 'monospace',
  },
  divider: {
    borderBottom: `1px solid ${COLOR_BORDER}`,
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
    color: COLOR_GOLD_DIM,
    marginBottom: 6,
    fontFamily: FONT_SERIF,
    letterSpacing: 1,
  },
  labelHint: {
    fontSize: 11,
    color: 'rgba(192, 168, 130, 0.4)',
    fontWeight: 400,
    marginLeft: 6,
    fontFamily: FONT_SERIF,
  },
  requiredMark: {
    color: '#EF9A9A',
    fontSize: 11,
    fontWeight: 400,
    fontFamily: FONT_SERIF,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER}`,
    background: 'rgba(0, 0, 0, 0.4)',
    color: '#e0e0e0',
    fontSize: 15,
    boxSizing: 'border-box' as const,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: FONT_SERIF,
  },
  inputError: {
    border: '1px solid #EF5350',
    boxShadow: '0 0 8px rgba(239, 83, 80, 0.2)',
  },
  error: {
    display: 'block',
    fontSize: 12,
    color: '#EF9A9A',
    marginTop: 4,
    fontFamily: FONT_SERIF,
  },
  genderRow: {
    display: 'flex',
    gap: 10,
  },
  genderBtn: {
    padding: '8px 24px',
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER}`,
    background: 'rgba(0, 0, 0, 0.4)',
    color: 'rgba(192, 168, 130, 0.6)',
    fontSize: 15,
    cursor: 'pointer',
    fontWeight: 600,
    fontFamily: FONT_SERIF,
    transition: 'all 0.15s',
  },
  genderActive: {
    border: `1px solid ${COLOR_BORDER_ACTIVE}`,
    color: COLOR_GOLD,
    background: 'rgba(192, 168, 130, 0.1)',
  },
  // ===== 性格特质 =====
  traitGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  traitRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 4,
  },
  traitBtn: {
    padding: '5px 8px',
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER}`,
    background: 'rgba(0, 0, 0, 0.3)',
    color: 'rgba(192, 168, 130, 0.6)',
    fontSize: 12,
    cursor: 'pointer',
    textAlign: 'center' as const,
    fontFamily: FONT_SERIF,
    transition: 'all 0.15s',
  },
  traitBtnActive: {
    border: `1px solid ${COLOR_BORDER_ACTIVE}`,
    color: COLOR_GOLD,
    background: 'rgba(192, 168, 130, 0.1)',
    fontWeight: 700,
  },
  traitBtnDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  // ===== 意识形态自定义下拉 =====
  selectTrigger: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER}`,
    background: 'rgba(0, 0, 0, 0.4)',
    color: '#e0e0e0',
    fontSize: 15,
    boxSizing: 'border-box' as const,
    cursor: 'pointer',
    textAlign: 'left' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontFamily: FONT_SERIF,
    transition: 'border-color 0.2s',
  },
  selectTriggerOpen: {
    border: `1px solid ${COLOR_BORDER_ACTIVE}`,
    borderRadius: '4px 4px 0 0',
  },
  selectArrow: {
    fontSize: 10,
    color: COLOR_GOLD_DIM,
    flexShrink: 0,
    marginLeft: 8,
  },
  selectDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: 240,
    overflowY: 'auto',
    background: 'rgba(0, 0, 0, 0.78)',
    border: `1px solid ${COLOR_BORDER_ACTIVE}`,
    borderTop: 'none',
    borderRadius: '0 0 4px 4px',
    zIndex: 100,
    backdropFilter: 'blur(12px)',
  },
  selectOption: {
    width: '100%',
    padding: '8px 14px',
    border: 'none',
    background: 'transparent',
    color: 'rgba(192, 168, 130, 0.7)',
    fontSize: 14,
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: FONT_SERIF,
    transition: 'all 0.1s',
    letterSpacing: 1,
  },
  selectOptionActive: {
    color: COLOR_GOLD,
    background: 'rgba(192, 168, 130, 0.1)',
    fontWeight: 700,
  },
  // ===== 滑块 =====
  sliderContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  slider: {
    flex: 1,
    accentColor: COLOR_GOLD,
    cursor: 'pointer',
  },
  sliderEndLabel: {
    fontSize: 11,
    color: 'rgba(192, 168, 130, 0.5)',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    minWidth: 50,
    fontFamily: FONT_SERIF,
  },
  sliderValue: {
    color: COLOR_GOLD,
    fontWeight: 700,
    fontFamily: FONT_SERIF,
  },
  // ===== 党派卡片 =====
  partyGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  partyCard: {
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER}`,
    background: 'rgba(0, 0, 0, 0.4)',
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
    fontFamily: FONT_SERIF,
  },
  partyCardAbbr: {
    fontSize: 12,
    color: 'rgba(192, 168, 130, 0.4)',
    marginLeft: 4,
    fontWeight: 400,
    fontFamily: FONT_SERIF,
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
    fontFamily: FONT_SERIF,
  },
  partyCardSeats: {
    fontSize: 12,
    color: COLOR_GOLD_DIM,
    fontWeight: 600,
    fontFamily: FONT_SERIF,
  },
  partyCardLeader: {
    fontSize: 11,
    color: 'rgba(192, 168, 130, 0.4)',
    fontFamily: FONT_SERIF,
  },
  selectedBadge: {
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 10px',
    borderRadius: 3,
    color: '#fff',
    letterSpacing: 1,
    fontFamily: FONT_SERIF,
  },
  expandBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER}`,
    background: 'rgba(0, 0, 0, 0.3)',
    color: COLOR_GOLD_DIM,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontFamily: FONT_SERIF,
    transition: 'all 0.15s',
  },
  // ===== 展开详情 =====
  partyDetail: {
    padding: '0 14px 14px',
    borderTop: `1px solid ${COLOR_BORDER}`,
  },
  partyDesc: {
    fontSize: 13,
    color: 'rgba(192, 168, 130, 0.7)',
    lineHeight: 1.6,
    marginTop: 10,
    marginBottom: 12,
    fontFamily: FONT_SERIF,
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
    color: 'rgba(192, 168, 130, 0.5)',
    fontWeight: 600,
    width: 60,
    flexShrink: 0,
    fontFamily: FONT_SERIF,
  },
  statBarWrap: {
    flex: 1,
    height: 6,
    background: 'rgba(0, 0, 0, 0.3)',
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
    color: COLOR_GOLD_DIM,
    fontWeight: 700,
    width: 36,
    textAlign: 'right' as const,
    flexShrink: 0,
    fontFamily: FONT_SERIF,
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
    fontFamily: FONT_SERIF,
  },
  statSeats: {
    fontSize: 13,
    color: COLOR_GOLD,
    fontWeight: 700,
    fontFamily: FONT_SERIF,
  },
  statMembers: {
    fontSize: 12,
    color: 'rgba(192, 168, 130, 0.5)',
    lineHeight: 1.5,
    fontFamily: FONT_SERIF,
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
    color: '#EF9A9A',
    fontWeight: 600,
    fontFamily: FONT_SERIF,
  },
  aiGenBtn: {
    padding: '7px 16px',
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER_ACTIVE}`,
    background: 'rgba(0, 0, 0, 0.5)',
    color: COLOR_GOLD,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'all 0.2s',
    backdropFilter: 'blur(4px)',
  },
  textarea: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER}`,
    background: 'rgba(0, 0, 0, 0.4)',
    color: '#e0e0e0',
    fontSize: 15,
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
    fontFamily: FONT_SERIF,
    lineHeight: 1.6,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  submitBtn: {
    width: '100%',
    padding: '14px 0',
    borderRadius: 2,
    border: `1px solid ${COLOR_BORDER}`,
    background: 'rgba(0, 0, 0, 0.6)',
    color: COLOR_GOLD,
    fontSize: 18,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 6,
    marginTop: 8,
    transition: 'all 0.2s',
    backdropFilter: 'blur(8px)',
    fontFamily: FONT_SERIF,
  },
  submitDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
};
