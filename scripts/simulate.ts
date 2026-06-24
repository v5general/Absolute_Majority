/**
 * 推演模拟器（100 局自动模拟）
 *
 * 用法：
 *   npx tsx scripts/simulate.ts [局数] [--seed=N] [--quick]
 *
 * 作用：
 *   - 无玩家介入，自动跑 N 局（默认 100）
 *   - 用 agentEngine + politicalAIEngine + narrativeEngine 推演
 *   - 统计：平均局数、危机事件数、政党胜率、Arc 触发分布
 *   - 输出 JSON 报告到 docs/simulate-report-[date].json
 *
 * 这是 LLM 推演游戏的"无玩家 playtest"。
 * 配合人工 playtest 报告使用，互补。
 *
 * 注意：
 *   - 需要 LLM API 配置（环境变量 LLM_API_KEY 或 src/engine/llmBridge 配置）
 *   - 未配置时仍可运行（自动走 fallback 路径）
 *   - 单局模拟最长 48 回合（4 年任期）
 */

import { createInitialState } from '../src/data/initialState';
import {
  runAgentTurn,
  runPoliticalAI,
  settleIntents,
  recalcSeats,
  updateAllPersonalities,
  isLLMAvailable,
} from '../src/engine';
import { convertIntentsToEvents } from '../src/engine/narrativeEngine';
import {
  createInitialMemory,
  getMemoryStats,
  serializeMemory,
  type WorldMemory,
} from '../src/engine/worldMemory';
import {
  createInitialDramaState,
  advanceDramaTurn,
  checkArcTrigger,
  updateDramaOnEvent,
  triggerArc,
  getDramaStats,
  type DramaState,
} from '../src/engine/dramaEngine';
import type { GameState, PoliticalEvent, Party, PlayerConfig } from '../src/types';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================================
// 配置
// ============================================================================

interface SimConfig {
  /** 模拟局数 */
  runs: number;
  /** 每局最大回合数（默认 48 = 4 年） */
  maxTurns: number;
  /** 是否禁用 LLM（用 fallback 跑得快） */
  disableLLM: boolean;
  /** 随机种子（0 = 时间戳） */
  seed: number;
  /** 详细日志 */
  verbose: boolean;
}

interface RunResult {
  runId: number;
  endTurn: number;
  endReason: 'max_turns' | 'error' | 'term_expired';
  finalSeatsByParty: Record<string, number>;
  crisisCount: number;
  arcCount: number;
  eventsTriggered: number;
  uniqueArcs: string[];
  partyMemoryStats: {
    totalMajorEvents: number;
    activeArcs: number;
    npcTracked: number;
  };
  error?: string;
}

interface SimReport {
  config: SimConfig;
  date: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  aggregate: {
    averageEndTurn: number;
    averageCrisisPerRun: number;
    averageArcsPerRun: number;
    averageEventsPerRun: number;
    partyWinRate: Record<string, number>; // partyId → 拿到首相的局数 / 总局数
    arcDistribution: Record<string, number>; // arcType → 总触发数
    uniqueArcsTotal: number;
  };
  runs: RunResult[];
}

// ============================================================================
// 参数解析
// ============================================================================

function parseArgs(argv: string[]): SimConfig {
  const config: SimConfig = {
    runs: 100,
    maxTurns: 48,
    disableLLM: false,
    seed: 0,
    verbose: false,
  };

  for (const arg of argv.slice(2)) {
    if (/^\d+$/.test(arg)) {
      config.runs = parseInt(arg, 10);
    } else if (arg === '--no-llm' || arg === '--quick') {
      config.disableLLM = true;
    } else if (arg.startsWith('--seed=')) {
      config.seed = parseInt(arg.slice(7), 10);
    } else if (arg.startsWith('--turns=')) {
      config.maxTurns = parseInt(arg.slice(8), 10);
    } else if (arg === '--verbose' || arg === '-v') {
      config.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return config;
}

function printHelp(): void {
  console.log(`
推演模拟器 — 100 局自动模拟

用法:
  npx tsx scripts/simulate.ts [runs] [options]

参数:
  runs              模拟局数（默认 100）

选项:
  --no-llm          禁用 LLM，走 fallback 路径（快但剧情弱）
  --quick           同 --no-llm
  --seed=N          固定随机种子（0 = 时间戳）
  --turns=N         每局最大回合数（默认 48）
  -v, --verbose     详细日志
  -h, --help        显示帮助

示例:
  npx tsx scripts/simulate.ts 50 --no-llm --seed=42
`);
}

// ============================================================================
// 单局模拟
// ============================================================================

/** 创建一个用于模拟的玩家配置（虚构，只为满足 playerConfig 字段） */
function createSimPlayerConfig(): PlayerConfig {
  return {
    lastName: '模拟',
    firstName: '议员',
    age: 35,
    gender: 'male',
    partyId: 'reform',
    background: '模拟用玩家角色，仅用于推演引擎',
    personalityTraits: ['pragmatic', 'cautious'],
    politicalIdeology: 'liberalism',
    economicAxis: 10,
    socialAxis: 20,
    politicalGoal: '完成模拟推演',
  };
}

/**
 * 跑一局模拟。
 * 不弹事件 UI、不等玩家选择，纯推演 + 默认选项（"中立"）。
 */
async function simulateOneRun(
  runId: number,
  config: SimConfig,
): Promise<RunResult> {
  let state = createInitialState();
  state.playerConfig = createSimPlayerConfig();

  // 初始化记忆和戏剧曲线
  let memory: WorldMemory = createInitialMemory();
  let drama: DramaState = createInitialDramaState();
  state.worldMemory = memory;

  let endTurn = 0;
  let endReason: RunResult['endReason'] = 'max_turns';
  let crisisCount = 0;
  const arcTypesTriggered = new Set<string>();
  let eventsTriggered = 0;
  let lastError: string | undefined;

  for (let turn = 1; turn <= config.maxTurns; turn++) {
    try {
      // 1. 推进戏剧曲线
      drama = advanceDramaTurn(drama, state);

      // 2. 推进 NPC 人格演化（注意：返回的是 mpPersonalities 字典，不是 GameState）
      state.mpPersonalities = updateAllPersonalities(state);

      // 3. Agent 推演（生成 intent + event）
      //    注意：agentEngine 走 fallback 时 events=[]，只有 intents
      //    所以无论 LLM 是否可用，都要把 intents 喂给 narrativeEngine 生成 events
      //    narrativeEngine 在 LLM 不可用时会自己走 generateFallbackEvent
      let agentIntents: any[] = [];
      let agentEvents: PoliticalEvent[] = [];
      if (!config.disableLLM) {
        try {
          const agentResult = await runAgentTurn(state);
          agentIntents = agentResult.intents ?? [];
          agentEvents = agentResult.events ?? [];
        } catch (err) {
          if (config.verbose) console.warn(`[Run ${runId} T${turn}] Agent turn failed:`, err);
        }
      }

      // 4. Political AI（200 议员，纯规则）
      const politicalIntents = runPoliticalAI(state);
      state = settleIntents(state, politicalIntents);

      // 4.5 fallback：如果 agentEngine 没产生 events（LLM 不可用走 fallback 时常见），
      //      把 politicalIntents 转成 agentIntent 格式喂给 narrativeEngine，
      //      narrativeEngine 会自动走 generateFallbackEvent 产出事件
      if (agentEvents.length === 0 && state.playerConfig) {
        const fallbackAgentIntents = politicalIntents.slice(0, 3).map(pi => ({
          actor_id: `agent:political:${pi.type}-${pi.id}`,
          intent_type: pi.type,
          target_id: (pi.payload.targetPartyId as string)
            ?? (pi.payload.proposingPartyId as string)
            ?? 'reform',
          priority: 5,
          reasoning: (pi.payload.description as string) ?? pi.type,
          payload: pi.payload,
        }));
        try {
          agentEvents = await convertIntentsToEvents(fallbackAgentIntents, state, state.playerConfig);
        } catch (err) {
          if (config.verbose) console.warn(`[Run ${runId} T${turn}] Fallback event gen failed:`, err);
        }
      }

      // 5. 检查 Arc 触发；若有候选且无活跃 arc，则真正激活（让 dramaEngine 状态推进）
      const triggeredArc = checkArcTrigger(drama, state);
      if (triggeredArc && !drama.activeArc) {
        drama = triggerArc(drama, triggeredArc, turn);
        arcTypesTriggered.add(triggeredArc);
      } else if (triggeredArc && drama.activeArc) {
        // 已有活跃 arc，仅记录候选（用于统计哪些 arc 类型频繁被推荐）
        arcTypesTriggered.add(triggeredArc);
      }

      // 6. 统计事件 + 更新戏剧曲线 + 模拟玩家选择
      //    simulate 自动选第一个选项，让 applyChoice / worldMemory / dramaEngine 都参与
      eventsTriggered += agentEvents.length;
      // 每回合最多提升 1 个事件到 crisis 级别（避免 crisis 爆炸，arc 推进有节奏）
      let crisisBoostUsed = false;
      for (const event of agentEvents) {
        // 根据戏剧曲线动态提升 severity（仅第一个事件）
        if (!crisisBoostUsed) {
          if (drama.tension >= 90 && event.severity < 5) {
            event.severity = 5;
            crisisBoostUsed = true;
          } else if (drama.tension >= 70 && event.severity < 4) {
            event.severity = 4;
            crisisBoostUsed = true;
          }
        }

        if (event.severity >= 4) crisisCount++;

        // 模拟玩家选择（自动选第一个选项，让 worldMemory 累积）
        if (event.choices && event.choices.length > 0) {
          try {
            const { applyChoice } = await import('../src/engine/eventEngine');
            state = applyChoice(state, event.choices[0], event);
          } catch (err) {
            if (config.verbose) console.warn(`[Run ${runId} T${turn}] Simulated choice failed:`, err);
          }
        }

        // 推进戏剧曲线（severity ≥ 4 会推进 arc 幕）
        drama = updateDramaOnEventSafe(drama, event, turn);
      }

      // 从 state 同步回闭包变量（applyChoice 把更新写到了 state.worldMemory）
      // 注意：不能反向覆盖，否则会清空累积的记忆
      memory = state.worldMemory ?? memory;
      state.dramaState = drama;

      // 7. 重算议席（每个会期边界）
      if (turn % 4 === 0) {
        recalcSeats(state);
      }

      // 8. 检查任期结束
      if (state.turnsUntilElection !== undefined && state.turnsUntilElection <= 0) {
        endReason = 'term_expired';
        endTurn = turn;
        break;
      }

      state.turn = turn + 1;
      if (state.turnsUntilElection !== undefined) {
        state.turnsUntilElection -= 1;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      endReason = 'error';
      endTurn = turn;
      break;
    }

    endTurn = turn;
  }

  // 最终统计
  const finalSeatsByParty: Record<string, number> = {};
  for (const party of state.parties) {
    finalSeatsByParty[party.id] = party.projectedSeats;
  }

  memory = state.worldMemory ?? memory;
  const memStats = getMemoryStats(memory);

  return {
    runId,
    endTurn,
    endReason,
    finalSeatsByParty,
    crisisCount,
    arcCount: arcTypesTriggered.size,
    eventsTriggered,
    uniqueArcs: Array.from(arcTypesTriggered),
    partyMemoryStats: {
      totalMajorEvents: memStats.totalMajorEvents,
      activeArcs: memStats.activeArcs,
      npcTracked: memStats.npcTracked,
    },
    error: lastError,
  };
}

// 安全包装（确保异常不传染到主循环）
function updateDramaOnEventSafe(
  drama: DramaState,
  event: PoliticalEvent,
  turn: number,
): DramaState {
  try {
    return updateDramaOnEvent(drama, event, turn);
  } catch {
    return drama;
  }
}

// ============================================================================
// 聚合统计
// ============================================================================

function aggregateResults(results: RunResult[], parties: Party[]): SimReport['aggregate'] {
  const successful = results.filter(r => r.endReason !== 'error');

  const averageEndTurn = successful.length > 0
    ? successful.reduce((s, r) => s + r.endTurn, 0) / successful.length
    : 0;

  const averageCrisisPerRun = successful.length > 0
    ? successful.reduce((s, r) => s + r.crisisCount, 0) / successful.length
    : 0;

  const averageArcsPerRun = successful.length > 0
    ? successful.reduce((s, r) => s + r.arcCount, 0) / successful.length
    : 0;

  const averageEventsPerRun = successful.length > 0
    ? successful.reduce((s, r) => s + r.eventsTriggered, 0) / successful.length
    : 0;

  // 政党胜率：以最终拥有最多席位的政党为"赢家"
  const partyWinRate: Record<string, number> = {};
  for (const p of parties) partyWinRate[p.id] = 0;
  for (const r of successful) {
    let maxSeats = 0;
    let winner = '';
    for (const [pid, seats] of Object.entries(r.finalSeatsByParty)) {
      if (seats > maxSeats) {
        maxSeats = seats;
        winner = pid;
      }
    }
    if (winner) partyWinRate[winner] = (partyWinRate[winner] ?? 0) + 1;
  }
  for (const pid of Object.keys(partyWinRate)) {
    partyWinRate[pid] = (partyWinRate[pid] ?? 0) / successful.length;
  }

  // Arc 分布
  const arcDistribution: Record<string, number> = {};
  for (const r of successful) {
    for (const arc of r.uniqueArcs) {
      arcDistribution[arc] = (arcDistribution[arc] ?? 0) + 1;
    }
  }

  return {
    averageEndTurn,
    averageCrisisPerRun,
    averageArcsPerRun,
    averageEventsPerRun,
    partyWinRate,
    arcDistribution,
    uniqueArcsTotal: Object.keys(arcDistribution).length,
  };
}

// ============================================================================
// 主入口
// ============================================================================

async function main() {
  const config = parseArgs(process.argv);
  console.log('=== 推演模拟器启动 ===');
  console.log(`局数: ${config.runs} | LLM: ${config.disableLLM ? '禁用' : (isLLMAvailable() ? '已配置' : '未配置，将走 fallback')} | Seed: ${config.seed || '时间戳'}`);

  const results: RunResult[] = [];
  const startTime = Date.now();

  // 取一次初始状态的党派列表（用于聚合）
  const initial = createInitialState();
  const parties = initial.parties;

  for (let i = 0; i < config.runs; i++) {
    if (config.verbose || (i + 1) % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[${i + 1}/${config.runs}] 已完成，累计 ${elapsed}s`);
    }
    try {
      const result = await simulateOneRun(i + 1, config);
      results.push(result);
    } catch (err) {
      console.error(`Run ${i + 1} 崩溃:`, err);
      results.push({
        runId: i + 1,
        endTurn: 0,
        endReason: 'error',
        finalSeatsByParty: {},
        crisisCount: 0,
        arcCount: 0,
        eventsTriggered: 0,
        uniqueArcs: [],
        partyMemoryStats: { totalMajorEvents: 0, activeArcs: 0, npcTracked: 0 },
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const successfulRuns = results.filter(r => r.endReason !== 'error').length;
  const failedRuns = results.length - successfulRuns;

  const report: SimReport = {
    config,
    date: new Date().toISOString(),
    totalRuns: results.length,
    successfulRuns,
    failedRuns,
    aggregate: aggregateResults(results, parties),
    runs: results,
  };

  // 写报告
  const dateStr = new Date().toISOString().slice(0, 10);
  const __dirname_sim = dirname(fileURLToPath(import.meta.url));
  const reportPath = resolve(__dirname_sim, '..', 'docs', `simulate-report-${dateStr}.json`);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  // 控制台摘要
  console.log('\n=== 模拟报告 ===');
  console.log(`成功: ${successfulRuns}/${results.length}（失败 ${failedRuns}）`);
  console.log(`平均结束回合: ${report.aggregate.averageEndTurn.toFixed(1)} / ${config.maxTurns}`);
  console.log(`平均每局危机事件: ${report.aggregate.averageCrisisPerRun.toFixed(1)}`);
  console.log(`平均每局 Arc: ${report.aggregate.averageArcsPerRun.toFixed(1)}`);
  console.log(`平均每局事件总数: ${report.aggregate.averageEventsPerRun.toFixed(1)}`);
  console.log(`独立 Arc 类型: ${report.aggregate.uniqueArcsTotal}`);
  console.log('\n政党胜率（按最终席位最多计）:');
  for (const [pid, rate] of Object.entries(report.aggregate.partyWinRate)) {
    const party = parties.find(p => p.id === pid);
    console.log(`  ${party?.name ?? pid}（${pid}）: ${(rate * 100).toFixed(1)}%`);
  }
  console.log('\nArc 触发分布:');
  for (const [arc, count] of Object.entries(report.aggregate.arcDistribution).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${arc}: ${count}`);
  }
  console.log(`\n报告已保存: ${reportPath}`);
  console.log(`总耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}

main().catch(err => {
  console.error('模拟器崩溃:', err);
  process.exit(1);
});
