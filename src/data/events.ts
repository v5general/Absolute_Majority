import type { PoliticalEvent } from '../types';

/**
 * 政治事件库
 * 模拟"后端"推送的事件，包含密谋、丑闻、政策危机等
 * 所有角色姓名均为简体中文。
 */
export const mockEvents: PoliticalEvent[] = [
  // ===== 事件1：政治密谋 — 保守党私下接触第一公民阵线 =====
  {
    id: 'evt-coalition-backroom',
    title: '密室交易',
    summary: '国民保守党与第一公民阵线在密室中商讨联合组阁方案',
    sourceParty: 'conservative',
    severity: 4,
    dialogs: [
      {
        speaker: null,
        text: '深夜，议会大楼侧翼的一间密室里，两盏台灯投下昏暗的光。桐生 毅夫的秘书刚刚递交了一份加密文件——国民保守党正在私下接触第一公民阵线，试图构建右翼联合政府。',
      },
      {
        speaker: 'conservative',
        text: '「远山 绫子……那个女人虽然激进，但她的选票是真的。如果我们联手，就有62个席位，距过半还差39席，但已经是议会第三大势力了。」',
      },
      {
        speaker: null,
        text: '毅夫的手指在桌面上敲出不规则的节拍。他知道这个联盟是一把双刃剑——第一公民阵线的年轻支持者充满激情，但他们的极端言论随时可能引发丑闻。',
      },
      {
        speaker: 'conservative',
        text: '「你作为我的核心幕僚，必须帮我做出判断。这个联盟值得冒这个险吗？」',
      },
    ],
    choices: [
      {
        id: 'accept-alliance',
        text: '推动联盟——与第一公民阵线正式谈判',
        consequence: '右翼联盟正式启动，但消息泄露引发了市场和社会的强烈震动。',
        effects: {
          supportDelta: {
            conservative: 3,
            populist: 5,
            reform: -4,
            progressive: -2,
            liberty: -2,
          },
          relationDelta: {
            'conservative>populist': 25,
            'populist>conservative': 20,
            'progressive>conservative': -15,
            'progressive>populist': -10,
            'reform>conservative': -10,
          },
          metricsDelta: {
            socialStabilityIndex: -8,
            mediaAttention: 20,
          },
        },
      },
      {
        id: 'reject-alliance',
        text: '拒绝联盟——保持距离，等待更好的时机',
        consequence: '联盟谈判流产，但保守党保全了温和形象。第一公民阵线感到被背叛。',
        effects: {
          supportDelta: {
            conservative: -2,
            populist: -3,
            reform: 2,
          },
          relationDelta: {
            'conservative>populist': -20,
            'populist>conservative': -25,
          },
          metricsDelta: {
            socialStabilityIndex: 3,
            mediaAttention: 5,
          },
        },
      },
      {
        id: 'leak-to-press',
        text: '将密谈内容泄露给媒体，打击双方信誉',
        consequence: '丑闻爆发，两大右翼政党同时陷入信任危机。社会联盟成为最大受益者。',
        effects: {
          supportDelta: {
            conservative: -6,
            populist: -5,
            progressive: 4,
            reform: 3,
          },
          relationDelta: {
            'conservative>populist': -30,
            'populist>conservative': -35,
          },
          metricsDelta: {
            socialStabilityIndex: -5,
            mediaAttention: 30,
          },
        },
      },
    ],
  },

  // ===== 事件2：劳工党密谋 — 工会罢工威胁 =====
  {
    id: 'evt-labor-strike',
    title: '工会风暴',
    summary: '联合劳工党发动大规模罢工威胁，要求提高最低工资',
    sourceParty: 'green',
    severity: 3,
    dialogs: [
      {
        speaker: null,
        text: '清晨的工厂区笼罩在薄雾中。数以万计的工人聚集在广场上，红色的旗帜迎风招展。浅野 直人站在临时搭建的演讲台上，面对着一片铁灰色的面孔。',
      },
      {
        speaker: 'green',
        text: '「同志们！资本的剥削已经到了不可容忍的地步！我们的诉求很简单——最低工资提高百分之三十，缩减工作时间，停止对劳动人民的压榨！」',
      },
      {
        speaker: null,
        text: '人群中爆发出震耳欲聋的欢呼。但你注意到，人群中不仅有劳工党的铁杆支持者，还有不少社会联盟的成员。这场运动将深刻影响整个政治格局。',
      },
      {
        speaker: null,
        text: '作为幕僚，你必须在各方压力下做出抉择。支持罢工将获得工人拥护，但也可能激怒资方和中间选民。',
      },
    ],
    choices: [
      {
        id: 'support-strike',
        text: '全力支持罢工，向政府施压',
        consequence: '罢工持续数日，经济受到冲击，但劳工党的声望在基层飙升。',
        effects: {
          supportDelta: {
            green: 5,
            progressive: 2,
            conservative: -3,
            liberty: -4,
            reform: -2,
          },
          relationDelta: {
            'green>progressive': 5,
            'green>conservative': -10,
            'green>liberty': -10,
          },
          metricsDelta: {
            economicIndex: -10,
            socialStabilityIndex: -12,
            mediaAttention: 25,
          },
        },
      },
      {
        id: 'negotiate',
        text: '推动劳资谈判，争取折中方案',
        consequence: '谈判艰难推进，双方各让一步。虽然没有人完全满意，但避免了最坏的结果。',
        effects: {
          supportDelta: {
            green: 1,
            reform: 2,
            conservative: 1,
            liberty: -1,
          },
          metricsDelta: {
            economicIndex: -3,
            socialStabilityIndex: -2,
            mediaAttention: 10,
          },
        },
      },
      {
        id: 'suppress-strike',
        text: '联合资方压制罢工，维护经济秩序',
        consequence: '罢工被强行结束，工人群体愤怒不已，但商界松了一口气。',
        effects: {
          supportDelta: {
            green: -5,
            progressive: -2,
            liberty: 3,
            conservative: 2,
            reform: 1,
          },
          relationDelta: {
            'green>progressive': -10,
            'green>conservative': -15,
            'green>liberty': -10,
          },
          metricsDelta: {
            economicIndex: 3,
            socialStabilityIndex: -8,
            mediaAttention: 15,
          },
        },
      },
    ],
  },

  // ===== 事件3：丑闻 — 自由党领袖的秘密资金 =====
  {
    id: 'evt-fund-scandal',
    title: '暗流',
    summary: '自由党党首望月 弘被曝接受海外企业秘密政治捐款',
    sourceParty: 'liberty',
    severity: 5,
    dialogs: [
      {
        speaker: null,
        text: '一份匿名文件被投递到了多家新闻机构的编辑部。文件详细记录了自由党党首望月 弘在过去两年中，通过离岸账户接收了一家跨国企业集团的秘密政治捐款，总额超过三亿日元。',
      },
      {
        speaker: null,
        text: '消息在社交媒体上以爆炸性速度传播。望月 弘在紧急记者会上面色铁青，否认所有指控。',
      },
      {
        speaker: 'liberty',
        text: '「这是对自由党的政治迫害！我们一直依法运作，所有的资金来源都经得起审计！」',
      },
      {
        speaker: null,
        text: '但公众并不买账。你手握这份文件，面前有几条路可以走——在这个关键时刻，你的选择将重塑整个选举格局。',
      },
    ],
    choices: [
      {
        id: 'expose-full',
        text: '公开全部证据，彻底打击自由党',
        consequence: '自由党的支持率暴跌，望月 弘面临辞职压力。但政治斗争进一步激化。',
        effects: {
          supportDelta: {
            liberty: -10,
            reform: 3,
            progressive: 2,
            conservative: 2,
            populist: 3,
          },
          fundsDelta: {
            liberty: -200,
          },
          relationDelta: {
            'liberty>reform': -15,
            'reform>liberty': -10,
            'populist>liberty': -10,
          },
          metricsDelta: {
            socialStabilityIndex: -6,
            mediaAttention: 35,
          },
        },
      },
      {
        id: 'blackmail',
        text: '以此为把柄，私下要挟自由党在关键议题上让步',
        consequence: '自由党被迫在贸易政策上做出妥协，但丑闻的隐患始终悬在头顶。',
        effects: {
          supportDelta: {
            liberty: -2,
          },
          relationDelta: {
            'liberty>progressive': 10,
            'progressive>liberty': 5,
          },
          fundsDelta: {
            liberty: -80,
          },
          metricsDelta: {
            mediaAttention: 10,
          },
        },
      },
      {
        id: 'bury-evidence',
        text: '销毁证据，与自由党达成暗中交易',
        consequence: '丑闻被压下去了——至少暂时如此。自由党欠下了一个巨大的人情。',
        effects: {
          supportDelta: {
            liberty: 2,
          },
          relationDelta: {
            'liberty>progressive': 20,
            'progressive>liberty': 15,
          },
          fundsDelta: {
            progressive: 150,
          },
          metricsDelta: {
            mediaAttention: -5,
          },
        },
      },
    ],
  },
];
