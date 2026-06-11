/**
 * 主要人物预设数据
 *
 * 为每个党首和重要成员提供固定的初始人格数据，
 * 确保每次进入游戏这些人物的属性一致。
 *
 * 这些仅是初始值，游戏中会随剧情变化。
 * 非主要人物保持 seeded random 逻辑不变。
 */

import type { PersonalityTrait, HiddenGoal } from '../types/mp';
import type { FamilyOrigin, Education } from '../types/background';

export interface KeyPersonPreset {
  personName: string;
  age: number;
  hometown: string;
  career: string;
  familyOrigin: FamilyOrigin;
  education: Education;
  personalityTraits: PersonalityTrait[];
  hiddenGoals: HiddenGoal[];
}

/** 按党派 ID 索引的主要人物预设 */
export const KEY_PEOPLE_PRESETS: Record<string, KeyPersonPreset[]> = {
  // ===== 改革民主党 (reform) =====
  reform: [
    {
      personName: '原田 正',
      age: 58,
      hometown: '東京都',
      career: '中央省厅官僚',
      familyOrigin: 'bureaucrat_family',
      education: 'top_university',
      personalityTraits: ['charismatic', 'pragmatic', 'diplomatic'],
      hiddenGoals: ['become_prime_minister', 'pass_tax_reform'],
    },
    {
      personName: '中村 健一',
      age: 52,
      hometown: '大阪府',
      career: '律师事务所合伙人',
      familyOrigin: 'lawyer',
      education: 'private_elite',
      personalityTraits: ['analytical', 'cautious', 'diligent'],
      hiddenGoals: ['pass_tax_reform', 'maintain_status_quo'],
    },
    {
      personName: '山田 美咲',
      age: 45,
      hometown: '神奈川県',
      career: '政治记者',
      familyOrigin: 'journalist',
      education: 'top_university',
      personalityTraits: ['progressive', 'gregarious', 'ambitious_trait'],
      hiddenGoals: ['gain_media_attention', 'expand_faction'],
    },
    {
      personName: '高桥 直树',
      age: 61,
      hometown: '愛知県',
      career: '商社董事',
      familyOrigin: 'business_family',
      education: 'private_elite',
      personalityTraits: ['pragmatic', 'stubborn', 'diplomatic'],
      hiddenGoals: ['pass_labor_reform', 'maintain_status_quo'],
    },
    {
      personName: '伊藤 樱',
      age: 38,
      hometown: '京都府',
      career: '大学副教授',
      familyOrigin: 'professor',
      education: 'top_university',
      personalityTraits: ['idealistic', 'calm', 'analytical'],
      hiddenGoals: ['pass_healthcare_reform', 'gain_media_attention'],
    },
    {
      personName: '渡边 修',
      age: 55,
      hometown: '福岡県',
      career: '国会议员秘书',
      familyOrigin: 'political_family',
      education: 'national_university',
      personalityTraits: ['diplomatic', 'cautious', 'honest'],
      hiddenGoals: ['maintain_status_quo', 'expand_faction'],
    },
    {
      personName: '铃木 亮',
      age: 42,
      hometown: '北海道',
      career: 'IT企业项目经理',
      familyOrigin: 'salaryman',
      education: 'national_university',
      personalityTraits: ['decisive', 'independent', 'progressive'],
      hiddenGoals: ['pass_defense_reform', 'gain_media_attention'],
    },
  ],

  // ===== 自由党 (liberty) =====
  liberty: [
    {
      personName: '望月 弘',
      age: 63,
      hometown: '東京都',
      career: '金融业高管',
      familyOrigin: 'business_family',
      education: 'private_elite',
      personalityTraits: ['charismatic', 'aggressive', 'ambitious_trait'],
      hiddenGoals: ['become_prime_minister', 'pass_tax_reform'],
    },
    {
      personName: '森田 太郎',
      age: 50,
      hometown: '千葉県',
      career: '制造企业CEO',
      familyOrigin: 'business_family',
      education: 'top_university',
      personalityTraits: ['pragmatic', 'decisive', 'greedy'],
      hiddenGoals: ['accumulate_wealth', 'pass_tax_reform'],
    },
    {
      personName: '藤田 美纪',
      age: 44,
      hometown: '兵庫県',
      career: '政治记者',
      familyOrigin: 'journalist',
      education: 'private_elite',
      personalityTraits: ['charismatic', 'cynical', 'diplomatic'],
      hiddenGoals: ['gain_media_attention', 'expand_faction'],
    },
    {
      personName: '冈本 大辅',
      age: 56,
      hometown: '大阪府',
      career: '律师事务所合伙人',
      familyOrigin: 'lawyer',
      education: 'top_university',
      personalityTraits: ['analytical', 'stubborn', 'pragmatic'],
      hiddenGoals: ['pass_labor_reform', 'maintain_status_quo'],
    },
    {
      personName: '萩原 進',
      age: 48,
      hometown: '愛知県',
      career: '商社董事',
      familyOrigin: 'business_family',
      education: 'national_university',
      personalityTraits: ['ambitious_trait', 'deceitful', 'gregarious'],
      hiddenGoals: ['accumulate_wealth', 'expand_faction'],
    },
  ],

  // ===== 国民保守党 (conservative) =====
  conservative: [
    {
      personName: '桐生 毅夫',
      age: 67,
      hometown: '長野県',
      career: '地方议会议员',
      familyOrigin: 'political_family',
      education: 'top_university',
      personalityTraits: ['traditional', 'stubborn', 'diplomatic'],
      hiddenGoals: ['become_prime_minister', 'maintain_status_quo'],
    },
    {
      personName: '松本 胜',
      age: 59,
      hometown: '石川県',
      career: '自治体干部',
      familyOrigin: 'bureaucrat_family',
      education: 'top_university',
      personalityTraits: ['cautious', 'diligent', 'traditional'],
      hiddenGoals: ['pass_defense_reform', 'maintain_status_quo'],
    },
    {
      personName: '井上 和夫',
      age: 62,
      hometown: '茨城県',
      career: '自卫队退役',
      familyOrigin: 'other',
      education: 'national_university',
      personalityTraits: ['brave', 'stubborn', 'aggressive'],
      hiddenGoals: ['pass_defense_reform', 'gain_media_attention'],
    },
    {
      personName: '小林 正道',
      age: 54,
      hometown: '新潟県',
      career: '党务工作者',
      familyOrigin: 'political_family',
      education: 'private_elite',
      personalityTraits: ['conformist', 'diligent', 'cautious'],
      hiddenGoals: ['maintain_status_quo', 'expand_faction'],
    },
    {
      personName: '斋藤 秀树',
      age: 51,
      hometown: '静岡県',
      career: '检察官',
      familyOrigin: 'lawyer',
      education: 'top_university',
      personalityTraits: ['analytical', 'vengeful', 'stubborn'],
      hiddenGoals: ['destroy_rival_faction', 'pass_tax_reform'],
    },
    {
      personName: '竹中 一郎',
      age: 46,
      hometown: '岐阜県',
      career: '银行支店长',
      familyOrigin: 'salaryman',
      education: 'regional_university',
      personalityTraits: ['pragmatic', 'calm', 'moderate'],
      hiddenGoals: ['pass_labor_reform', 'gain_media_attention'],
    },
  ],

  // ===== 社会联盟 (progressive) =====
  progressive: [
    {
      personName: '林 千鹤',
      age: 53,
      hometown: '広島県',
      career: '市民运动组织者',
      familyOrigin: 'grassroots_activist',
      education: 'national_university',
      personalityTraits: ['idealistic', 'empathetic', 'brave'],
      hiddenGoals: ['become_prime_minister', 'pass_healthcare_reform'],
    },
    {
      personName: '田中 惠子',
      age: 49,
      hometown: '大阪府',
      career: '工会组织者',
      familyOrigin: 'union_cadre',
      education: 'regional_university',
      personalityTraits: ['diligent', 'progressive', 'stubborn'],
      hiddenGoals: ['pass_labor_reform', 'expand_faction'],
    },
    {
      personName: '佐藤 隆',
      age: 57,
      hometown: '宮城県',
      career: '智库研究员',
      familyOrigin: 'professor',
      education: 'top_university',
      personalityTraits: ['analytical', 'calm', 'pragmatic'],
      hiddenGoals: ['pass_tax_reform', 'maintain_status_quo'],
    },
    {
      personName: '木村 真理',
      age: 41,
      hometown: '東京都',
      career: '新闻主播',
      familyOrigin: 'journalist',
      education: 'private_elite',
      personalityTraits: ['charismatic', 'ambitious_trait', 'progressive'],
      hiddenGoals: ['gain_media_attention', 'pass_healthcare_reform'],
    },
    {
      personName: '清水 翔太',
      age: 36,
      hometown: '福岡県',
      career: 'NPO代表',
      familyOrigin: 'grassroots_activist',
      education: 'national_university',
      personalityTraits: ['idealistic', 'empathetic', 'cheerful'],
      hiddenGoals: ['pass_healthcare_reform', 'expand_faction'],
    },
    {
      personName: '小川 惠',
      age: 47,
      hometown: '長崎県',
      career: '劳动组合委员',
      familyOrigin: 'union_cadre',
      education: 'regional_university',
      personalityTraits: ['diligent', 'generous', 'traditional'],
      hiddenGoals: ['pass_labor_reform', 'maintain_status_quo'],
    },
  ],

  // ===== 第一公民阵线 (populist) =====
  populist: [
    {
      personName: '远山 绫子',
      age: 48,
      hometown: '熊本県',
      career: '编辑委员',
      familyOrigin: 'journalist',
      education: 'private_elite',
      personalityTraits: ['charismatic', 'aggressive', 'radical'],
      hiddenGoals: ['become_prime_minister', 'destroy_rival_faction'],
    },
    {
      personName: '石井 雄大',
      age: 39,
      hometown: '埼玉県',
      career: 'IT企业项目经理',
      familyOrigin: 'salaryman',
      education: 'regional_university',
      personalityTraits: ['impulsive', 'ambitious_trait', 'aggressive'],
      hiddenGoals: ['gain_media_attention', 'destroy_rival_faction'],
    },
    {
      personName: '长谷川 真由',
      age: 44,
      hometown: '大阪府',
      career: '社区领袖',
      familyOrigin: 'grassroots_activist',
      education: 'regional_university',
      personalityTraits: ['gregarious', 'brave', 'vengeful'],
      hiddenGoals: ['expand_faction', 'pass_labor_reform'],
    },
    {
      personName: '宫崎 健',
      age: 52,
      hometown: '鹿児島県',
      career: '农业经营者',
      familyOrigin: 'other',
      education: 'national_university',
      personalityTraits: ['stubborn', 'traditional', 'independent'],
      hiddenGoals: ['pass_tax_reform', 'maintain_status_quo'],
    },
    {
      personName: '坂口 翔',
      age: 34,
      hometown: '愛媛県',
      career: '政治记者',
      familyOrigin: 'journalist',
      education: 'national_university',
      personalityTraits: ['charismatic', 'radical', 'cynical'],
      hiddenGoals: ['gain_media_attention', 'expand_faction'],
    },
  ],

  // ===== 联合劳工党 (solidarity) =====
  solidarity: [
    {
      personName: '浅野 直人',
      age: 60,
      hometown: '北海道',
      career: '产业工会干部',
      familyOrigin: 'union_cadre',
      education: 'national_university',
      personalityTraits: ['stubborn', 'diligent', 'radical'],
      hiddenGoals: ['become_prime_minister', 'pass_labor_reform'],
    },
    {
      personName: '高田 一郎',
      age: 55,
      hometown: '岡山県',
      career: '劳动组合委员',
      familyOrigin: 'union_cadre',
      education: 'regional_university',
      personalityTraits: ['conformist', 'diligent', 'traditional'],
      hiddenGoals: ['maintain_status_quo', 'pass_labor_reform'],
    },
    {
      personName: '中岛 优子',
      age: 43,
      hometown: '大阪府',
      career: '工会组织者',
      familyOrigin: 'union_cadre',
      education: 'national_university',
      personalityTraits: ['empathetic', 'brave', 'progressive'],
      hiddenGoals: ['pass_healthcare_reform', 'expand_faction'],
    },
    {
      personName: '桥本 哲也',
      age: 50,
      hometown: '栃木県',
      career: '商社营业部长',
      familyOrigin: 'salaryman',
      education: 'regional_university',
      personalityTraits: ['pragmatic', 'cautious', 'moderate'],
      hiddenGoals: ['pass_tax_reform', 'maintain_status_quo'],
    },
    {
      personName: '西村 洋一',
      age: 58,
      hometown: '京都府',
      career: '产业工会干部',
      familyOrigin: 'union_cadre',
      education: 'national_university',
      personalityTraits: ['analytical', 'stubborn', 'idealistic'],
      hiddenGoals: ['pass_labor_reform', 'gain_media_attention'],
    },
  ],
};

/**
 * 快速查找某个人的预设数据
 * @returns 预设数据，如果没有预设则返回 undefined
 */
export function findPersonPreset(partyId: string, personName: string): KeyPersonPreset | undefined {
  const partyPresets = KEY_PEOPLE_PRESETS[partyId];
  if (!partyPresets) return undefined;
  return partyPresets.find(p => p.personName === personName);
}
