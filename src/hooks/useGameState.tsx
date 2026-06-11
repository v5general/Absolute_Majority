import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { GameState, ActiveEvent, PoliticalEvent, EventChoice, PlayerConfig, FreeTextResponse, ThinkingLogEntry } from '../types';
import type { MPPersonality, PersonalityTrait, PoliticalIdeology } from '../types/mp';
import { createInitialState } from '../data/initialState';
import { applyChoice } from '../engine/eventEngine';
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
} from '../engine';

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
  if (state.playerConfig && (state.playerHealth === undefined || state.playerStress === undefined)) {
    needsMigration = true;
    return {
      ...state,
      mpPersonalities: migratedPersonalities,
      playerHealth: state.playerHealth ?? 85,
      playerStress: state.playerStress ?? 15,
      isPlayerDead: state.isPlayerDead ?? false,
    };
  }

  return needsMigration ? { ...state, mpPersonalities: migratedPersonalities } : state;
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

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GameState>(() => migrateGameState(createInitialState()));
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingLogs, setThinkingLogs] = useState<ThinkingLogEntry[]>([]);
  const isRunningRef = useRef(false);

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
          // 0. 回合开始：推进法案决策链、处理过期法案
          let turnState = { ...oldState };

          // 处理过期法案
          const updatedBills = turnState.bills.map(bill => {
            if (isBillExpired(bill, turnState.turn)) {
              return autoVoteBill(bill, turnState);
            }
            return bill;
          });
          turnState.bills = updatedBills;

          // 推进未过期法案的决策链
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

          // 1. Agent 推演：收集所有 Agent 意图（会调用 LLM）
          const agentResult = await runAgentTurn(turnState);

          // 实时推送思考日志
          setThinkingLogs(agentResult.logs);

          // 2. Political AI：200 名议员意图（不经过 LLM，纯规则）
          const politicalIntents = runPoliticalAI(turnState);

          // 结算政治 AI 意图
          turnState = settleIntents(turnState, politicalIntents);

          // 3. 获取事件（LLM 已在 Agent 调用中一并生成）
          let aiEvents = agentResult.events;
          if (aiEvents.length === 0 && agentResult.intents.length > 0) {
            aiEvents = await convertIntentsToEvents(agentResult.intents, turnState, turnState.playerConfig!);
          }

          // 4. 更新议员人格（压力、健康）
          let updatedPersonalities = updateAllPersonalities(turnState);

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
      const choice = prev.event.choices.find((c) => c.id === choiceId);
      if (!choice) return prev;

      setState((oldState) => applyChoice(oldState, choice));
      return { ...prev, resolved: true, chosenId: choiceId, showChoices: false };
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
        // 从 activeEvent 快照获取配置
        let currentEvent: ActiveEvent | null = null;
        setActiveEvent((prev) => { currentEvent = prev; return prev; });

        if (!currentEvent?.event.freeText) return;

        const freeTextConfig = currentEvent.event.freeText;
        const playerName = state.playerConfig
          ? `${state.playerConfig.lastName} ${state.playerConfig.firstName}`
          : '议员';

        const systemPrompt = `你是日本议会政治模拟游戏的AI角色扮演系统。

场景：${freeTextConfig.scenePrompt}

任务：玩家（议员${playerName}）说了话，你需要：
1. 以对方身份回应（生动、符合政治人物身份）
2. 用旁白描述影响
3. 评估对支持率等的影响

输出严格JSON：
{"reply":"回应台词","narration":"旁白描述","effects":{"supportDelta":{"党派id":数字},"metricsDelta":{"mediaAttention":数字}}}

规则：发言有力→正面，不当→负面，模糊→中性。supportDelta通常-3到+3。党派ID: reform,liberty,conservative,progressive,populist,solidarity。必须至少有一个非零metricsDelta值。`;

        const userPrompt = `玩家${playerName}说：\n\n"${playerText}"`;

        const result = await askLLMJSON<FreeTextResponse>(
          systemPrompt,
          userPrompt,
          {
            reply: '...你的发言引起了在场人的注意，但似乎没有人明确表态。',
            narration: '你的发言在会场中回荡，各方反应不一。',
            effects: { supportDelta: {}, metricsDelta: { mediaAttention: 2 } },
          },
          { maxTokens: 400, temperature: 0.7 },
        );

        // 应用效果并更新事件
        const fakeChoice: EventChoice = {
          id: 'free_text',
          text: playerText,
          consequence: result.narration,
          effects: result.effects,
        };

        setState((oldState) => applyChoice(oldState, fakeChoice));

        setActiveEvent((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            resolved: true,
            isWaitingFreeText: false,
            freeTextResponse: result,
            showChoices: false,
          };
        });
        setIsPaused(true);
      } catch (err) {
        console.error('[Game] Free text LLM call failed:', err);
        // 无论是否出错，都必须解除 isWaitingFreeText 状态
        setActiveEvent((prev) => {
          if (!prev) return null;
          const fallbackResponse: FreeTextResponse = {
            reply: '你的发言在会场中引起了一阵窃窃私语，但没有得到正式回应。',
            narration: '你的发言产生了些许影响，但大多数人选择保持沉默。',
            effects: { supportDelta: {}, metricsDelta: { mediaAttention: 1 } },
          };
          // 应用 fallback 效果
          const fakeChoice: EventChoice = {
            id: 'free_text_fallback',
            text: playerText,
            consequence: fallbackResponse.narration,
            effects: fallbackResponse.effects,
          };
          setState((oldState) => applyChoice(oldState, fakeChoice));
          return {
            ...prev,
            resolved: true,
            isWaitingFreeText: false,
            freeTextResponse: fallbackResponse,
            showChoices: false,
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
        dismissEvent,
        nextTurn,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};
