# NARRATIVE — 戏剧规则圣经

> CONSTITUTION 写的是"世界是什么样的"（众议院 200 席、任期 4 年）。
> NARRATIVE 写的是"故事应该怎么讲"（每 10 回合一个 major arc、危机的节奏、何时该爆发丑闻）。
>
> 这份文档是 writer agent、dramaEngine、narrativeEngine 共同的圣经。
> LLM 在生成事件时，应通过 dramaEngine 的 prompt 注入间接消费这份文档。

---

## 一、戏剧节奏曲线（Drama Curve）

### 1.1 Tension（紧张度）模型

| 区间 | 名称 | 含义 | LLM 应该生成什么 |
|---|---|---|---|
| 0-29 | Cool-down | 喘息期 | 选区活动、社交、小博弈、关系建立 |
| 30-49 | Buildup | 紧张积累 | 派阀暗斗、媒体试探、政策分歧浮现 |
| 50-69 | Escalation | 升级期 | 公开冲突、联盟摩擦、委员会对抗 |
| 70-89 | Crisis | 危机期 | 不信任案、丑闻爆雷、党内逼宫、组阁破裂 |
| 90-100 | Climax | 高潮期 | 大选、解散、修宪、首相倒台 |

### 1.2 Tension 变化规则

```
基础增量：每回合 +5
危机后冷却：触发 crisis 后 tension 设为 15
冷却保护：tension < 30 时持续至少 3 回合（防止抖动）
高潮封顶：tension 达 95 后保持，直到 arc 结束
```

### 1.3 节奏禁忌

- ❌ **禁止连续 5 回合以上无任何 tension 变化**（玩家会觉得无聊）
- ❌ **禁止 tension 长期停留在 70-89**（疲劳，玩家会麻木）
- ❌ **禁止 Climax 持续超过 3 回合**（高潮过长失去戏剧性）
- ✅ 危机后必须有 2-3 回合喘息（让玩家消化后果）
- ✅ 每个会期（4 个月）至少 1 个 escalation 级事件

---

## 二、Major Arc 类型库

> Arc 是"故事弧"。dramaEngine 每 10 回合应推进或触发一个 arc。
> writer agent 用这些骨架写 fallback 内容；LLM 推演时按骨架填充。

### 2.1 Arc 类型清单

| Arc ID | 名称 | 触发条件 | 典型长度 | 涉及 CONSTITUTION 条款 |
|---|---|---|---|---|
| `election_earthquake` | 选举地震 | 大选后议席大变 | 3-5 回合 | 大选系统 |
| `coalition_collapse` | 联盟崩溃 | 执政联盟内部分歧 > 阈值 | 4-6 回合 | 联盟协议、组阁 |
| `no_confidence_storm` | 不信任风暴 | 在野党席位接近 101 + 总理丑闻 | 3-4 回合 | 不信任案决策链 |
| `faction_revolt` | 派阀逼宫 | 派阀 loyalty < 40 + 党首支持率 < 35 | 3-5 回合 | 派阀系统 |
| `scandal_eruption` | 丑闻爆发 | 玩家或党首 corruption 高 + 媒体关注度 > 60 | 2-4 回合 | 媒体战 |
| `constitutional_gambit` | 修宪赌局 | 执政联盟 ≥ 134 席 | 5-8 回合 | 绝对多数、修宪门槛 |
| `dissolution_crisis` | 解散危机 | 首相支持率 > 45 + 反对党分散 | 2-3 回合 | 首相解散权 |
| `prime_minister_fall` | 首相陨落 | 首相健康/丑闻/失去联盟 | 4-6 回合 | 党首与首相分离 |
| `backroom_empire` | 密室帝国 | 玩家 backroom_dealer 故事线强 | 5-7 回合 | 利益集团博弈 |
| `media_war` | 媒体战争 | 媒体关注度 > 70 持续 3 回合 | 3-5 回合 | 媒体战 |
| `reform_crusade` | 改革十字军 | 玩家 reformist 故事线 + 进步法案 | 4-6 回合 | 法案审议流程 |
| `succession_drama` | 世袭戏剧 | 政治世家玩家 + 父辈丑闻/死亡 | 3-5 回合 | 人物背景系统 |

### 2.2 Arc 三幕结构（writer 必须遵循）

每个 arc 拆为三幕：

```
第一幕（Trigger，1-2 回合）：
  - 一个明确的引发事件
  - 至少 2 个 NPC 表态
  - 玩家被卷入但尚未选定立场

第二幕（Escalation，1-3 回合）：
  - 局势升级，阵营对立清晰
  - 玩家必须做关键选择（明确 effects）
  - 至少 1 个转折（盟友变对手 / 反之）

第三幕（Resolution，1-2 回合）：
  - 政治后果结算（CONSTITUTION 第十一规则要求）
  - 关键 NPC 命运定型
  - 为下一个 arc 埋伏笔（openThreads）
```

### 2.3 Arc 触发优先级

当多个 arc 候选同时满足触发条件时，按优先级选：

1. `no_confidence_storm`（最戏剧化）
2. `coalition_collapse`（影响最广）
3. `scandal_eruption`（最易共鸣）
4. `constitutional_gambit`（最罕见，应优先展示）
5. `faction_revolt`
6. `prime_minister_fall`
7. `dissolution_crisis`
8. 其他

---

## 三、Severity（严重度）使用规范

> narrativeEngine 当前已用 1-5 标 severity，但语义模糊。这份规范让它精确。

| Severity | 含义 | 数值影响范围 | Arc 角色 | 出现频率 |
|---|---|---|---|---|
| 1 | 微小 | effects 总和 < 5 | Cool-down 填充 | 任意 |
| 2 | 一般 | effects 总和 5-15 | Cool-down / Buildup | 任意 |
| 3 | 显著 | effects 总和 15-30 | Buildup / Escalation | 每 2-3 回合 |
| 4 | 重大 | effects 总和 30-60 | Crisis / Arc 段落 | 每 4-5 回合 |
| 5 | 决定性 | effects 总和 > 60，或触发 arc | Climax / Arc 高潮 | 每 8-12 回合 |

**禁忌**：
- ❌ Severity 5 事件不能连续出现（玩家会麻木）
- ❌ Severity 1-2 事件不能在 Crisis 期出现（破坏氛围）
- ✅ 每个 Arc 至少有 1 个 Severity 5 事件作为高潮

---

## 四、玩家立场与戏剧张力

### 4.1 双面叙事原则

每个事件应同时考虑：
- **玩家视角**：作为个人议员面临的选择
- **国家视角**：对政局的整体影响

LLM 在生成选项时，应保证：
- 至少 1 个选项让玩家"做正确的事"（道德/能力正确）
- 至少 1 个选项让玩家"做有利的事"（短期利益）
- 至少 1 个选项让玩家"做党派的事"（党派立场）
- "保持沉默" 永远可选（最低风险最低收益）

### 4.2 立场切换惩罚

玩家突然改变立场（如长期 reformist 突然选保守选项）应：
- LLM 在对话中让 NPC 表示惊讶/质疑
- 累积 worldMemory 后由 reputation 反映
- 但不应阻止玩家选择（玩家有最终决定权）

### 4.3 在野 vs 执政节奏

| 玩家身份 | 戏剧重点 | LLM 应该强调 |
|---|---|---|
| 执政党普通议员 | 党内派阀、维护政权、防御丑闻 | "你的党在台上，每个失误都被放大" |
| 执政党派阀成员 | 派阀 vs 党首、逼宫时机 | "你的派阀在等机会" |
| 在野党普通议员 | 攻击政府、曝光丑闻、累积声望 | "你在等执政党犯错" |
| 在野党党首 | 联合其他在野党、准备大选 | "全国都在看你能否团结反对派" |
| 首相（罕见） | 维持稳定、组阁、防倒阁 | "整个国家的压力在你身上" |

---

## 五、禁忌清单（永不违反）

### 5.1 现实政治禁忌（继承自 CONSTITUTION）

- ❌ 现实日本政党名（自民党、立宪民主党等）
- ❌ 现实日本派阀名（清和会、平成会、宏池会等）
- ❌ 现实日本媒体名（NHK、朝日、读卖等）— 用三家虚构媒体
- ❌ 现实企业名（丰田、索尼、三菱等）
- ❌ 现实政治人物

### 5.2 戏剧禁忌

- ❌ **平淡日常连续 3 回合**（玩家会退出）
- ❌ **同一 NPC 反复出场**（每 5 回合不超过 3 次）
- ❌ **危机事件没有玩家选项**（违反 CONSTITUTION 第十一规则）
- ❌ **Arc 高潮被弱化结算**（severity 5 必须 effects 显著）
- ❌ **死亡 / 暗杀 / 暴力情节**（这是政治模拟，不是黑帮片）
- ❌ **直接跳到结局**（玩家必须有路径阻止或促成）

### 5.3 必须包含

- ✅ 每个事件 ≥ 3 个选项
- ✅ 每个 arc 高潮后 2-3 回合有"善后"事件
- ✅ 玩家的 worldMemory 中的 active arcs 必须在剧情中呼应
- ✅ NPC 引用过往事件（用 worldMemory.majorEvents）
- ✅ 媒体用 worldMemory.player.scandals 中已曝光的丑闻攻击

---

## 六、Fallback 模板（writer agent 用）

> 当 LLM 不可用时，narrativeEngine 调 fallback。writer agent 应预先准备每种 intentType 的 fallback 事件 JSON，存到 `src/data/events/fallback/<intentType>.json`。

每个 fallback 必须满足：
- 3 个选项（左/中/右）
- 每个选项的 effects 清晰
- 200-400 字
- 不引用 worldMemory（fallback 不保证 LLM 知道过去）
- 标注适用的会期（预算决战 / 法案攻坚 / 闭会 / 临时国会）

---

## 七、与会期规则的关系

CONSTITUTION 第 233-239 行定义了 4 个会期，每个会期有不同的事件性质倾向。NARRATIVE 在此基础上加戏剧维度：

| 会期 | Tension 倾向 | 推荐 Arc 类型 |
|---|---|---|
| 1-3 月 预算决战期 | 偏高（+8/回合） | `no_confidence_storm` 预热、`scandal_eruption` |
| 4-6 月 法案攻坚期 | 中（+5/回合） | `coalition_collapse`、`faction_revolt` |
| 7-9 月 选区休会期 | 低（+3/回合） | `backroom_empire`、`media_war`、`succession_drama` |
| 10-12 月 临时国会期 | 中-高（+6/回合） | `dissolution_crisis`、`reform_crusade` |

dramaEngine 应在生成 dramaDirective 时，结合会期调整 tension 增量。

---

## 八、终极原则

1. **故事服务于玩法**：每个事件必须让玩家做出有意义的选择
2. **玩法服务于故事**：effects 数值必须能在剧情中被合理解释
3. **CONSTITUTION 是宪法**：不可违反
4. **NARRATIVE 是戏剧指南**：可在 writer agent + 用户协商下调整
5. **玩家是主角**：NPC 永远是配角，剧情服务于玩家的政治旅程

---

_本文档与 CONSTITUTION.md 配套使用。CONSTITUTION 修改后，必须检查本文档是否需要同步更新。_
