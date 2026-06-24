import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { GameState, ActiveEvent, PoliticalEvent, EventChoice, PlayerConfig, FreeTextResponse, ThinkingLogEntry } from '../types';
import type { MPPersonality, PersonalityTrait, PoliticalIdeology } from '../types/mp';
import { createInitialState } from '../data/initialState';
import { applyChoice } from '../engine/eventEngine';
import { createInitialMemory } from '../engine/worldMemory';
import { createInitialDramaState, advanceDramaTurn } from '../engine/dramaEngine';
import { initializeAllCapital, advanceCapitalTurn } from '../engine/politicalCapitalEngine';
import { saveGame as saveToStorage } from '../components/MainMenu';
import {
  runAgentTurn,
  convertIntentsToEvents,
  updateAllPersonalities,
  askLLMText,
  askLLMJSON,
  settleIntents,
  runPoliticalAI,
  recalcSeats,
  updateFactionLoyalty,
  advanceBillChain,
  isBillExpired,
  autoVoteBill,
  calculateDissolutionWillingness,
  isTermExpired,
  processLifeEvents,
  generatePersonality,
  generateAIBills,
  advanceEconomyTurn,
  advanceRelationDecay,
  ensureParliamentaryGroups,
  hasDebateThisMonth,
  markDebateGenerated,
  checkLeadershipTriggers,
  triggerPartyLeadershipElection,
  runPromotionReview,
} from '../engine';
import type { AIBillDraft } from '../engine';

// ===== 数据迁移函数 =====

/**
 * 迁移旧版本的游戏数据到新版本
 * 确保 mpPersonalities 中的每个 NPC 都有 personalityTraits 和 politicalIdeology
 */
function migrateGameState(state: GameState): GameState {
  let needsMigration = false;
  const migratedPersonalities: Record<string, MPPersonality> = { ...state.mpPersonalities };

  for (const [key, mp] of Object.entries(state.mpPersonalities)) {
    // 检查是否缺少新字段
    if (!mp.personalityTraits || !mp.politicalIdeology) {
      needsMigration = true;

      // 找到对应的政党
      const party = state.parties.find(p => p.id === mp.partyId);
      if (!party) continue;

      // 重新生成人格以获取缺失的字段
      const newPersonality = generatePersonality(
        mp.personName,
        mp.partyId,
        party,
        mp.isLeader,
        mp.isMinister,
        mp.isCommitteeChairman,
      );

      // 保留原有的状态数据（health, stress 等）
      migratedPersonalities[key] = {
        ...newPersonality,
        stress: mp.stress,
        health: mp.health,
        hiddenGoals: mp.hiddenGoals,
        background: mp.background,
        career: mp.career,
        factionId: mp.factionId,
        deceased: mp.deceased,
        deathCause: mp.deathCause,
        deathTurn: mp.deathTurn,
      };
    }
  }

  // 如果玩家缺少新字段，添加默认值
  if (state.playerConfig && (state.playerHealth === undefined || state.playerStress === undefined || !state.playerConfig.personalityTraits)) {
    needsMigration = true;
    const migratedConfig = state.playerConfig;
    return {
      ...state,
      mpPersonalities: migratedPersonalities,
      playerConfig: migratedConfig.personalityTraits ? migratedConfig : {
        ...migratedConfig,
        personalityTraits: migratedConfig.personalityTraits ?? ['pragmatic'] as PersonalityTrait[],
        politicalIdeology: migratedConfig.politicalIdeology ?? 'liberalism' as PoliticalIdeology,
        economicAxis: migratedConfig.economicAxis ?? 0,
        socialAxis: migratedConfig.socialAxis ?? 0,
        politicalGoal: migratedConfig.politicalGoal ?? '在国会中为民服务',
      },
      playerHealth: state.playerHealth ?? 85,
      playerStress: state.playerStress ?? 15,
      isPlayerDead: state.isPlayerDead ?? false,
      worldMemory: state.worldMemory ?? createInitialMemory(),
      dramaState: state.dramaState ?? createInitialDramaState(),
    };
  }

  // worldMemory / dramaState 兜底（旧存档未含此字段时自动初始化）
  let withMemory: GameState = state.worldMemory
    ? { ...state, mpPersonalities: migratedPersonalities }
    : { ...state, mpPersonalities: migratedPersonalities, worldMemory: createInitialMemory() };
  if (!withMemory.dramaState) {
    withMemory = { ...withMemory, dramaState: createInitialDramaState() };
  }

  // Phase G Q3：为所有议员初始化 politicalCapital（旧存档迁移）
  withMemory = initializeAllCapital(withMemory);

  return withMemory;
}

// ===== Context 定义 =====

interface GameContextValue {
  state: GameState;
  activeEvent: ActiveEvent | null;
  isPaused: boolean;
  isThinking: boolean;
  thinkingLogs: ThinkingLogEntry[];

  /** 设置玩家角色并进入游戏 */
  setPlayerConfig: (config: PlayerConfig) => void;

  /** 推进对话到下一段 */
  advanceDialog: () => void;

  /** 完成打字，立即显示当前段落 */
  finishTyping: () => void;

  /** 做出选择（固定选项） */
  makeChoice: (choiceId: string) => void;

  /** 提交自由文本（AI 对话） */
  submitFreeText: (text: string) => void;

  /** 继续自由文本对话：清除上一轮 AI 回应，回到输入态 */
  continueConversation: () => void;

  /** 关闭事件弹窗，处理下一个事件 */
  dismissEvent: () => void;

  /** 推进下一回合：Agent 推演 → 生成事件（异步，调用 LLM） */
  nextTurn: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

// ===== Provider =====

export const GameProvider: React.FC<{ children: React.ReactNode; savedState?: GameState }> = ({ children, savedState }) => {
  const [state, setState] = useState<GameState>(() => savedState ? migrateGameState(savedState) : migrateGameState(createInitialState()));
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingLogs, setThinkingLogs] = useState<ThinkingLogEntry[]>([]);
  const isRunningRef = useRef(false);
  // 始终持有最新 activeEvent 的 ref，供 useCallback 内的异步流程安全读取
  const activeEventRef = useRef<ActiveEvent | null>(null);
  useEffect(() => { activeEventRef.current = activeEvent; }, [activeEvent]);

  // 自动保存：state 变化时写入 localStorage
  useEffect(() => {
    if (state.playerConfig) {
      saveToStorage(state.playerConfig, state, state.turn);
    }
  }, [state]);

  /** 设置玩家角色，同时为玩家所在党派席位数 +1（玩家来了） */
  const setPlayerConfig = useCallback((config: PlayerConfig) => {
    setState((prev) => {
      const updatedParties = prev.parties.map(party => {
        if (party.id === config.partyId) {
          return { ...party, projectedSeats: party.projectedSeats + 1 };
        }
        return party;
      });

      // 同步更新政府选举结果中对应党派的席位
      let updatedGovernment = prev.government;
      if (updatedGovernment) {
        const updatedPartyResults = updatedGovernment.electionResult.partyResults.map(pr => {
          if (pr.partyId === config.partyId) {
            return { ...pr, seats: pr.seats + 1 };
          }
          return pr;
        });
        const updatedElectionResult = { ...updatedGovernment.electionResult, partyResults: updatedPartyResults };
        // 重新计算执政联盟席位
        const newCoalitionSeats = updatedGovernment.rulingCoalition.reduce((sum, pid) => {
          const r = updatedPartyResults.find(er => er.partyId === pid);
          return sum + (r?.seats ?? 0);
        }, 0);
        updatedGovernment = {
          ...updatedGovernment,
          electionResult: updatedElectionResult,
          stability: updatedGovernment.isMinority && newCoalitionSeats >= prev.metrics.majorityThreshold
            ? Math.min(100, updatedGovernment.stability + 5)
            : updatedGovernment.stability,
          isMinority: newCoalitionSeats < prev.metrics.majorityThreshold,
        };
      }

      // 更新大盘领先联盟席位
      const newLeadingSeats = updatedGovernment
        ? updatedGovernment.rulingCoalition.reduce((sum, pid) => {
            const r = updatedGovernment!.electionResult.partyResults.find(er => er.partyId === pid);
            return sum + (r?.seats ?? 0);
          }, 0)
        : prev.metrics.leadingCoalitionSeats;

      return {
        ...prev,
        playerConfig: config,
        playerHealth: 85,
        playerStress: 15,
        isPlayerDead: false,
        parties: updatedParties,
        government: updatedGovernment,
        metrics: {
          ...prev.metrics,
          leadingCoalitionSeats: newLeadingSeats,
        },
      };
    });
  }, []);

  /** 弹出下一个 AI 事件 */
  const popNextAIEvent = useCallback((s: GameState): GameState => {
    if (s.currentAIEvents.length === 0) return s;

    const [nextEvent, ...remaining] = s.currentAIEvents;
    setActiveEvent({
      event: nextEvent,
      currentDialogIndex: 0,
      isTyping: true,
      showChoices: false,
      resolved: false,
    });

    return { ...s, currentAIEvents: remaining };
  }, []);

  /** 推进下一回合（异步，调用 LLM） */
  const nextTurn = useCallback(() => {
    // 防止重复点击
    if (isRunningRef.current) return;

    setState((oldState) => {
      if (!oldState.playerConfig) return oldState;
      // 玩家已死亡，不再推进回合
      if (oldState.isPlayerDead) return oldState;

      isRunningRef.current = true;
      setIsThinking(true);
      setThinkingLogs([]); // 清空上回合日志

      // 异步执行 Agent 推演
      (async () => {
        try {
          console.log('[Game] Starting turn', oldState.turn);

          // 0. 回合开始：推进法案决策链、处理过期法案
          let turnState = { ...oldState };

          // 0.0 推进戏剧曲线（每回合 +5 tension，会期调整）
          turnState.dramaState = advanceDramaTurn(
            turnState.dramaState ?? createInitialDramaState(),
            turnState,
          );

          // 0.0a Phase G Q7：每回合应用资金 faucet/sink（平衡型，净 ±0）
          try {
            turnState = advanceEconomyTurn(turnState);
          } catch (err) {
            console.error('[Game] Economy turn advance failed:', err);
          }

          // 0.0b Phase G balance-check：每回合推进关系衰减
          try {
            turnState = advanceRelationDecay(turnState);
          } catch (err) {
            console.error('[Game] Relation decay failed:', err);
          }

          // 0.0c Phase G Q5：确保会派列表已初始化
          try {
            turnState = ensureParliamentaryGroups(turnState);
          } catch (err) {
            console.error('[Game] Parliamentary groups init failed:', err);
          }

          // 0.0d Phase G 第七章：检查党首选举触发条件（在 agent turn 前）
          try {
            const leadershipTriggers = checkLeadershipTriggers(turnState);
            for (const trigger of leadershipTriggers.slice(0, 2)) {
              const party = turnState.parties.find(p => p.id === trigger.partyId);
              if (!party) continue;
              const result = triggerPartyLeadershipElection(
                turnState,
                trigger.partyId,
                trigger.reason,
              );
              turnState = result.state;
              console.log(`[Game] Leadership election triggered for ${party.name}: ${trigger.reason}`);
            }
          } catch (err) {
            console.error('[Game] Leadership triggers check failed:', err);
          }

          // 0.0e Phase G Q5：本月辩论事件触发（每月至少一次）
          try {
            if (!hasDebateThisMonth(turnState)) {
              // 标记已生成 — 实际事件由 narrativeEngine 在 agent intents 中生成
              // 如未生成，强制注入一个 parliament_questioning intent 让 LLM 生成
              turnState = markDebateGenerated(turnState);
            }
          } catch (err) {
            console.error('[Game] Debate marking failed:', err);
          }

          // 0.1 结算上一回合的 pendingChoice effects（如果有）
          const pendingChoice = activeEvent?.pendingChoice;
          if (pendingChoice) {
            console.log('[Game] Settling pending choice effects:', pendingChoice);
            // 同时传入事件，让 applyChoice 把玩家选择累积到 worldMemory
            turnState = applyChoice(turnState, pendingChoice, activeEvent?.event);
          }

          // 处理过期法案
          try {
            const updatedBills = turnState.bills.map(bill => {
              if (isBillExpired(bill, turnState.turn)) {
                return autoVoteBill(bill, turnState);
              }
              return bill;
            });
            turnState.bills = updatedBills;
          } catch (err) {
            console.error('[Game] Bill processing failed:', err);
          }

          // 推进未过期法案的决策链
          try {
            turnState.bills = turnState.bills.map(bill => {
              if (bill.status === 'passed' || bill.status === 'rejected' || bill.status === 'implemented' || bill.status === 'withdrawn') {
                return bill;
              }
              const committee = turnState.committees.find(c => c.id === bill.committeeId);
              if (committee) {
                return advanceBillChain(bill, committee, turnState.parties, turnState.relations, turnState.mpPersonalities);
              }
              return bill;
            });
          } catch (err) {
            console.error('[Game] Bill chain advancement failed:', err);
          }

          // 1. Agent 推演：收集所有 Agent 意图（会调用 LLM）
          console.log('[Game] Running agent turn...');
          let agentResult;
          try {
            agentResult = await runAgentTurn(turnState);
            console.log('[Game] Agent turn completed:', agentResult);
          } catch (err) {
            console.error('[Game] Agent turn failed:', err);
            agentResult = { intents: [], events: [], logs: [] };
          }

          // 实时推送思考日志
          setThinkingLogs(agentResult.logs);

          // 2. Political AI：200 名议员意图（不经过 LLM，纯规则）
          const politicalIntents = runPoliticalAI(turnState);

          // 2.5 AI 法案生成：让 LLM 根据当前局势生成本回合法案草案。
          // 若成功，则过滤掉规则式 propose_bill 意图（避免重复），稍后直接加入 state.bills。
          let aiBills: AIBillDraft[] = [];
          try {
            aiBills = await generateAIBills(turnState);
          } catch (err) {
            console.error('[Game] AI bill generation failed:', err);
            aiBills = [];
          }
          const filteredPoliticalIntents = aiBills.length > 0
            ? politicalIntents.filter(i => i.type !== 'propose_bill')
            : politicalIntents;

          // 结算政治 AI 意图
          turnState = settleIntents(turnState, filteredPoliticalIntents);

          // Phase G 第十章：每回合运行晋升审查（仅记录结果，不直接晋升）
          try {
            const promotionResults = runPromotionReview(turnState);
            if (promotionResults.length > 0) {
              console.log(`[Game] ${promotionResults.length} MPs eligible for promotion`);
              // 实际晋升由后续 UI / 规则引擎处理；此处仅日志
            }
          } catch (err) {
            console.error('[Game] Promotion review failed:', err);
          }

          // 加入 LLM 生成的法案（去重标题）
          if (aiBills.length > 0) {
            for (const draft of aiBills) {
              if (turnState.bills.some(b => b.title === draft.title)) continue;
              turnState.bills.push({
                id: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                title: draft.title,
                summary: draft.summary,
                proposerPartyId: draft.proposerPartyId,
                proposerName: draft.proposerName,
                committeeId: draft.committeeId,
                status: 'draft',
                committeeNote: '',
                amendment: '',
                votesFor: 0,
                votesAgainst: 0,
                createdTurn: turnState.turn,
              });
            }
          }

          // 3. 获取事件（LLM 已在 Agent 调用中一并生成）
          let aiEvents = agentResult.events;
          if (aiEvents.length === 0 && agentResult.intents.length > 0) {
            aiEvents = await convertIntentsToEvents(agentResult.intents, turnState, turnState.playerConfig!);
          }

          // 4. 更新议员人格（压力、健康）
          let updatedPersonalities = updateAllPersonalities(turnState);

          // 4.1 Phase G Q3：每回合推进所有议员的政治资本
          try {
            const capitalState: GameState = { ...turnState, mpPersonalities: updatedPersonalities };
            const advancedCapitalState = advanceCapitalTurn(capitalState);
            updatedPersonalities = advancedCapitalState.mpPersonalities;
          } catch (err) {
            console.error('[Game] Political capital turn advance failed:', err);
          }

          // 4.5 生死检查
          let lifeResult: import('../engine/lifeEngine').LifeEventResult | null = null;
          try {
            const lifeState: GameState = { ...turnState, mpPersonalities: updatedPersonalities };
            lifeResult = processLifeEvents(lifeState);
            updatedPersonalities = lifeResult.updatedPersonalities;

            // 死亡事件加入 AI 事件队列（高优先级，放在前面）
            if (lifeResult.politicalEvents && lifeResult.politicalEvents.length > 0) {
              aiEvents = [...lifeResult.politicalEvents, ...aiEvents];
            }
          } catch (err) {
            console.error('[Game] Life events processing failed:', err);
            // 继续执行，不阻塞游戏流程
          }

          // 5. 更新派阀忠诚度
          const updatedParties = (lifeResult?.updatedParties ?? turnState.parties).map(party => {
            if (!party.factions || party.factions.length === 0) return party;
            const ministerNames = turnState.government?.ministers.map(m => m.personName) ?? [];
            const updatedFactions = party.factions.map(faction => {
              const postsHeld = ministerNames.filter(name =>
                faction.members.some(m => {
                  const mp = updatedPersonalities[m];
                  return mp && !mp.deceased && mp.personName === name;
                })
              ).length;
              return updateFactionLoyalty(faction, false, postsHeld);
            });
            return { ...party, factions: updatedFactions };
          });

          // 6. 更新选举倒计时
          let turnsUntilElection = (turnState.turnsUntilElection ?? 48) - 1;
          if (turnsUntilElection < 0) turnsUntilElection = 0;

          // 7. 弹出第一个事件
          setState((prev) => {
            const merged: GameState = {
              ...prev,
              parties: updatedParties,
              mpPersonalities: updatedPersonalities,
              committees: lifeResult?.updatedCommittees ?? prev.committees,
              government: lifeResult?.updatedGovernment ?? prev.government,
              playerHealth: lifeResult?.updatedPlayerHealth ?? prev.playerHealth,
              playerStress: lifeResult?.updatedPlayerStress ?? prev.playerStress,
              isPlayerDead: lifeResult?.isPlayerDead ?? prev.isPlayerDead,
              playerDeathCause: lifeResult?.playerDeathCause ?? prev.playerDeathCause,
              currentAIEvents: aiEvents,
              pendingIntents: [],
              currentDay: prev.currentDay + 1,
              turn: prev.turn + 1,
              turnsUntilElection,
              bills: turnState.bills,
            };
            return popNextAIEvent(merged);
          });
        } catch (err) {
          console.error('[Game] Agent turn failed:', err);
        } finally {
          isRunningRef.current = false;
          setIsThinking(false);
        }
      })();

      return oldState;
    });
  }, [popNextAIEvent]);

  const advanceDialog = useCallback(() => {
    setActiveEvent((prev) => {
      if (!prev) return null;
      if (prev.isTyping) return { ...prev, isTyping: false };

      const nextIdx = prev.currentDialogIndex + 1;
      if (nextIdx >= prev.event.dialogs.length) {
        return { ...prev, showChoices: true, currentDialogIndex: nextIdx - 1 };
      }
      return { ...prev, currentDialogIndex: nextIdx, isTyping: true };
    });
  }, []);

  const finishTyping = useCallback(() => {
    setActiveEvent((prev) => prev ? { ...prev, isTyping: false } : null);
  }, []);

  const makeChoice = useCallback((choiceId: string) => {
    setActiveEvent((prev) => {
      if (!prev) return null;

      // 处理"结束对话"的特殊情况
      if (choiceId === 'end_conversation' && prev.accumulatedEffects) {
        // 使用累积的效果
        const endChoice: EventChoice = {
          id: 'end_conversation',
          text: '结束对话',
          consequence: '对话结束',
          effects: prev.accumulatedEffects,
        };
        return { ...prev, resolved: true, chosenId: choiceId, showChoices: false, pendingChoice: endChoice };
      }

      const choice = prev.event.choices.find((c) => c.id === choiceId);
      if (!choice) return prev;

      // 暂时不结算 effects，只存储 choice
      // effects 将在下一回合开始时结算
      return { ...prev, resolved: true, chosenId: choiceId, showChoices: false, pendingChoice: choice };
    });
    setIsPaused(true);
  }, []);

  /** 提交自由文本：调用 LLM 评估玩家发言，生成回应 */
  const submitFreeText = useCallback((playerText: string) => {
    if (!playerText.trim()) return;

    setActiveEvent((prev) => {
      if (!prev || !prev.event.freeText) return prev;

      // 标记为等待 LLM 回应
      return { ...prev, isWaitingFreeText: true, showChoices: false };
    });

    // 异步调用 LLM
    (async () => {
      try {
        // 从 activeEvent ref 读取最新事件快照
        const currentEvent = activeEventRef.current;

        if (!currentEvent?.event.freeText) return;

        const freeTextConfig = currentEvent.event.freeText;
        const playerName = state.playerConfig
          ? `${state.playerConfig.lastName} ${state.playerConfig.firstName}`
          : '议员';

        // 获取对话方的党派信息
        const party = freeTextConfig.speakerId
          ? state.parties.find(p => p.id === freeTextConfig.speakerId)
          : state.parties.find(p => p.id === state.playerConfig?.partyId);

        // 构建当前游戏状态摘要
        const coalitionStr = state.government?.rulingCoalition
          .map(pid => state.parties.find(p => p.id === pid)?.abbreviation)
          .join('、') || '无';
        const seatsStr = state.parties.map(p => p.abbreviation + p.projectedSeats + '席').join('、');
        const playerConfig = state.playerConfig;
        const playerParty = playerConfig
          ? state.parties.find(p => p.id === playerConfig.partyId)
          : null;
        const speakerStr = freeTextConfig.speakerId
          ? (state.parties.find(p => p.id === freeTextConfig.speakerId)?.name || '某党')
          : '旁白';
        const leaderLines = state.parties.map(p => {
          const mpKey = Object.keys(state.mpPersonalities).find(
            key => state.mpPersonalities[key].isLeader && state.mpPersonalities[key].partyId === p.id
          ) || '';
          const leader = mpKey ? state.mpPersonalities[mpKey] : null;
          const leaderName = leader ? leader.personName : p.leader;
          return '- ' + p.name + '（' + p.abbreviation + '）：党首 ' + leaderName + '，' + p.projectedSeats + '席';
        }).join('\n');

        const currentState = `当前政治局势：
- 执政联盟：${coalitionStr}
- 各党支持率：${seatsStr}
- 当前回合：第${state.turn}回合
- 玩家所属：${playerParty?.name || '未知'}（${playerParty?.abbreviation || ''}）
- 对话方：${speakerStr}

主要政治人物：
${leaderLines}`;

        const systemPrompt = `你是架空日本议会政治模拟游戏的AI角色扮演系统。

## 游戏世界观（不可违反）
- 时间背景：2058年（不是2021年或其他现实年份）
- 国家：架空日本国，议会内阁制，众议院200席
- 所有政党为原创虚构，不映射现实日本政党（不存在自民党等）
- 所有政治人物为原创虚构，不映射现实政治家
- 允许使用日本姓名、行政区划、政府机构名称
- 禁止出现现实中任何真实企业或民间团体名称（如日立、丰田、三菱、索尼、软银、经团联等）。如叙事需要涉及企业或团体，请自行创造虚构名称
- 媒体只有三家：中央时事新闻（中间派）、革新民报（左翼）、经合新闻（右翼）
- 禁止使用现实媒体名称（NHK、朝日新闻等）

${currentState}

场景：${freeTextConfig.scenePrompt}

对话历史（${currentEvent.conversationHistory?.length || 0}轮）：
${currentEvent.conversationHistory?.map(h => `你：${h.playerInput}\n对方：${h.npcResponse}`).join('\n\n') || '（开始对话）'}

任务：玩家（议员${playerName}）说了话，你需要：
1. 以对方身份回应（生动、符合政治人物身份）
2. 用旁白描述影响
3. 评估对支持率等的影响

输出严格JSON：
{"reply":"回应台词","narration":"旁白描述","effects":{"supportDelta":{"党派id":数字},"metricsDelta":{"mediaAttention":数字}}}

规则：发言有力→正面，不当→负面，模糊→中性。supportDelta通常-3到+3。党派ID: reform,liberty,conservative,progressive,populist,solidarity。必须至少有一个非零metricsDelta值。回应要基于当前政治局势和对话历史，保持连贯性。`;

        const userPrompt = `玩家${playerName}说：\n\n"${playerText}"`;

        console.log('[FreeText] Calling LLM...');
        console.log('[FreeText] System prompt length:', systemPrompt.length);
        console.log('[FreeText] User prompt:', userPrompt);

        // 添加超时处理：30秒超时
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('LLM request timeout')), 30000);
        });

        let result: FreeTextResponse;
        try {
          result = await Promise.race([
            askLLMJSON<FreeTextResponse>(
              systemPrompt,
              userPrompt,
              {
                reply: '...你的发言引起了在场人的注意，但似乎没有人明确表态。',
                narration: '你的发言在会场中回荡，各方反应不一。',
                effects: { supportDelta: {}, metricsDelta: { mediaAttention: 2 } },
              },
              { maxTokens: 400, temperature: 0.7, responseFormat: null },
            ),
            timeoutPromise,
          ]);
        } catch (raceError) {
          console.error('[FreeText] Promise.race error:', raceError);
          throw raceError; // Re-throw to be caught by outer catch
        }

        console.log('[FreeText] LLM result:', result);
        console.log('[FreeText] Result keys:', result ? Object.keys(result) : 'null');

        // 构建虚拟 choice，延迟结算 effects
        const fakeChoice: EventChoice = {
          id: 'free_text',
          text: playerText,
          consequence: result.narration,
          effects: result.effects,
        };

        // 暂时不结算 effects，只存储到 pendingChoice（与固定选项行为一致）
        setActiveEvent((prev) => {
          if (!prev) return null;

          // 累积 effects
          const currentEffects = prev.accumulatedEffects || {
            supportDelta: {},
            fundsDelta: {},
            relationDelta: {},
            metricsDelta: {},
          };

          // 累积新的 effects
          Object.entries(result.effects.supportDelta || {}).forEach(([party, delta]) => {
            currentEffects.supportDelta![party] = (currentEffects.supportDelta![party] || 0) + Number(delta);
          });
          Object.entries(result.effects.fundsDelta || {}).forEach(([party, delta]) => {
            currentEffects.fundsDelta![party] = (currentEffects.fundsDelta![party] || 0) + Number(delta);
          });
          Object.entries(result.effects.relationDelta || {}).forEach(([relation, delta]) => {
            currentEffects.relationDelta![relation] = (currentEffects.relationDelta![relation] || 0) + Number(delta);
          });
          if (result.effects.metricsDelta) {
            currentEffects.metricsDelta = {
              ...currentEffects.metricsDelta,
              ...result.effects.metricsDelta,
            };
            // 累积 metricsDelta 的数值
            Object.entries(result.effects.metricsDelta).forEach(([key, value]) => {
              const currentValue = (currentEffects.metricsDelta as any)[key] || 0;
              (currentEffects.metricsDelta as any)[key] = currentValue + value;
            });
          }

          // 记录对话历史
          const history = prev.conversationHistory || [];
          history.push({
            round: history.length + 1,
            playerInput: playerText,
            npcResponse: result.reply,
            timestamp: Date.now(),
          });

          const updated = {
            ...prev,
            resolved: false, // 不结束事件，允许继续对话
            isWaitingFreeText: false,
            freeTextResponse: result,
            showChoices: true, // 显示"继续对话"/"结束对话"选项
            pendingChoice: fakeChoice,
            conversationHistory: history,
            accumulatedEffects: currentEffects,
            isConversationActive: true,
          };
          console.log('[FreeText] Updated activeEvent (multi-round):', {
            resolved: updated.resolved,
            isWaitingFreeText: updated.isWaitingFreeText,
            hasFreeTextResponse: !!updated.freeTextResponse,
            conversationRound: history.length,
            accumulatedEffects: currentEffects,
          });
          return updated;
        });
        // 不设置 isPaused，允许继续对话
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('[Game] Free text LLM call failed:', errorMsg);

        // 无论是否出错，都必须解除 isWaitingFreeText 状态
        setActiveEvent((prev) => {
          if (!prev) return null;
          const fallbackResponse: FreeTextResponse = {
            reply: errorMsg.includes('timeout')
              ? '对方似乎在思考你的发言，但一时没有回应。'
              : '你的发言在会场中引起了一阵窃窃私语，但没有得到正式回应。',
            narration: errorMsg.includes('timeout')
              ? '你的发言让现场陷入短暂沉默。'
              : '你的发言产生了些许影响，但大多数人选择保持沉默。',
            effects: { supportDelta: {}, metricsDelta: { mediaAttention: 1 } },
          };
          // 构建虚拟 choice，延迟结算 effects（与正常情况一致）
          const fakeChoice: EventChoice = {
            id: 'free_text_fallback',
            text: playerText,
            consequence: fallbackResponse.narration,
            effects: fallbackResponse.effects,
          };
          return {
            ...prev,
            resolved: true,
            isWaitingFreeText: false,
            freeTextResponse: fallbackResponse,
            showChoices: false,
            pendingChoice: fakeChoice,
          };
        });
        setIsPaused(true);
      }
    })();
  }, [state.playerConfig]);

  const dismissEvent = useCallback(() => {
    setActiveEvent(null);
    setIsPaused(false);

    // 检查是否还有待处理的 AI 事件
    setState((prev) => {
      if (prev.currentAIEvents.length > 0) {
        return popNextAIEvent(prev);
      }
      return prev;
    });
  }, [popNextAIEvent]);

  /** 继续自由文本对话：清除上一轮 AI 回应与选项，回到可输入态 */
  const continueConversation = useCallback(() => {
    setActiveEvent((prev) => {
      if (!prev) return prev;
      return { ...prev, showChoices: false, freeTextResponse: undefined, isWaitingFreeText: false };
    });
  }, []);

  return (
    <GameContext.Provider
      value={{
        state,
        activeEvent,
        isPaused,
        isThinking,
        thinkingLogs,
        setPlayerConfig,
        advanceDialog,
        finishTyping,
        makeChoice,
        submitFreeText,
        continueConversation,
        dismissEvent,
        nextTurn,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};
