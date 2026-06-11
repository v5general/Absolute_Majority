import React, { useState, useEffect, useCallback } from 'react';
import { useGame } from '../hooks/useGameState';
import type { Party } from '../types';

/**
 * Galgame 风格的事件弹窗
 * - 打字机效果逐字显示对话
 * - 角色立绘（彩色圆形 + 党首名）
 * - 对话结束后：显示选项 或 自由文本输入框
 * - AI 对自由文本的回应实时展示
 */
export const GalgameDialog: React.FC = () => {
  const { state, activeEvent, advanceDialog, finishTyping, makeChoice, submitFreeText, dismissEvent } = useGame();

  const [displayedText, setDisplayedText] = useState('');
  const [showConsequence, setShowConsequence] = useState(false);
  const [freeTextInput, setFreeTextInput] = useState('');

  const currentDialog = activeEvent && !activeEvent.showChoices && !activeEvent.resolved
    ? activeEvent.event.dialogs[activeEvent.currentDialogIndex]
    : null;

  const fullText = currentDialog?.text ?? '';
  const isTyping = activeEvent?.isTyping ?? false;

  // 是否有自由文本模式
  const hasFreeText = activeEvent?.event.freeText != null;

  // 打字机效果
  useEffect(() => {
    if (!activeEvent || !currentDialog) {
      setDisplayedText('');
      return;
    }

    if (!activeEvent.isTyping) {
      setDisplayedText(fullText);
      return;
    }

    setDisplayedText('');
    let idx = 0;
    const timer = setInterval(() => {
      idx++;
      setDisplayedText(fullText.slice(0, idx));
      if (idx >= fullText.length) {
        clearInterval(timer);
        finishTyping();
      }
    }, 30);

    return () => clearInterval(timer);
  }, [activeEvent?.currentDialogIndex, activeEvent?.isTyping, fullText, finishTyping]);

  // 重置 consequence 显示
  useEffect(() => {
    if (activeEvent?.resolved) {
      setShowConsequence(false);
      setFreeTextInput('');
      const chosen = activeEvent.event.choices.find((c) => c.id === activeEvent.chosenId);
      if (chosen?.consequence) {
        const timer = setTimeout(() => setShowConsequence(true), 300);
        return () => clearTimeout(timer);
      } else if (activeEvent.freeTextResponse) {
        const timer = setTimeout(() => setShowConsequence(true), 300);
        return () => clearTimeout(timer);
      }
    }
  }, [activeEvent?.resolved, activeEvent?.chosenId]);

  const handleOverlayClick = useCallback(() => {
    if (!activeEvent) return;
    if (activeEvent.resolved || activeEvent.isWaitingFreeText) {
      dismissEvent();
      return;
    }
    advanceDialog();
  }, [activeEvent, advanceDialog, dismissEvent]);

  const handleDialogClick = useCallback(() => {
    if (!activeEvent) return;
    if (activeEvent.resolved) return;
    advanceDialog();
  }, [activeEvent, advanceDialog]);

  const handleChoice = useCallback((choiceId: string) => {
    makeChoice(choiceId);
  }, [makeChoice]);

  const handleFreeTextSubmit = useCallback(() => {
    console.log('[GalgameDialog] handleFreeTextSubmit called, input:', freeTextInput);
    if (!freeTextInput.trim()) {
      console.log('[GalgameDialog] Empty input, ignoring');
      return;
    }
    console.log('[GalgameDialog] Calling submitFreeText with:', freeTextInput.trim());
    submitFreeText(freeTextInput.trim());
  }, [freeTextInput, submitFreeText]);

  const handleFreeTextKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleFreeTextSubmit();
    }
  }, [handleFreeTextSubmit]);

  const handleWindowClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止冒泡到 overlay
    if (!activeEvent) return;
    // 等待 LLM 时，点击窗口任意位置也可关闭
    if (activeEvent.isWaitingFreeText) {
      dismissEvent();
    }
  }, [activeEvent, dismissEvent]);

  if (!activeEvent) return null;

  const partyMap = new Map(state.parties.map((p) => [p.id, p]));
  // 解析 speaker：精确匹配 party.id，若失败则尝试模糊匹配
  let speaker: typeof state.parties[0] | null | undefined = null;
  if (currentDialog?.speaker) {
    speaker = partyMap.get(currentDialog.speaker);
    // LLM 可能输出党派名称而非ID，做模糊匹配兜底
    if (!speaker) {
      speaker = state.parties.find(p =>
        p.name === currentDialog.speaker ||
        p.abbreviation === currentDialog.speaker ||
        p.leader === currentDialog.speaker,
      );
    }
  }

  const chosenChoice = activeEvent.resolved
    ? activeEvent.event.choices.find((c) => c.id === activeEvent.chosenId)
    : null;

  // 决定显示选项还是自由文本输入
  const showFreeTextInput = hasFreeText && activeEvent.showChoices && !activeEvent.resolved;
  const showFixedChoices = !hasFreeText && activeEvent.showChoices && !activeEvent.resolved;

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.window} onClick={handleWindowClick}>
        {/* 标题栏 */}
        <div style={styles.titleBar}>
          <span style={styles.severityBadge}>
            {'!'.repeat(activeEvent.event.severity)}
          </span>
          <span style={styles.titleText}>{activeEvent.event.title}</span>
          {activeEvent.resolved ? (
            <button style={styles.closeBtn} onClick={dismissEvent}>
              关闭
            </button>
          ) : activeEvent.showChoices || activeEvent.isWaitingFreeText ? (
            <button style={styles.skipBtn} onClick={dismissEvent}>
              跳过
            </button>
          ) : null}
        </div>

        {/* 立绘区域 */}
        <div style={styles.sceneArea}>
          {speaker && (
            <Portrait party={speaker} />
          )}
          {!speaker && (
            <div style={styles.narratorIcon}>...</div>
          )}
        </div>

        {/* 对话框 */}
        <div style={styles.dialogBox} onClick={handleDialogClick}>
          {speaker && (
            <div style={{ ...styles.namePlate, backgroundColor: speaker.color }}>
              {speaker.leader}
            </div>
          )}
          {!speaker && (
            <div style={{ ...styles.namePlate, backgroundColor: '#555' }}>旁白</div>
          )}

          <div style={styles.textArea}>
            {/* 正常对话 */}
            {!activeEvent.resolved && <span>{displayedText}</span>}

            {/* 选择后的后果旁白 */}
            {activeEvent.resolved && chosenChoice?.consequence && !showConsequence && (
              <span style={{ color: '#aaa' }}>{displayedText || chosenChoice.consequence}</span>
            )}
            {activeEvent.resolved && chosenChoice?.consequence && showConsequence && (
              <span style={{ color: '#FFD54F' }}>{chosenChoice.consequence}</span>
            )}

            {/* 自由文本回应 */}
            {activeEvent.resolved && activeEvent.freeTextResponse && !showConsequence && (
              <div>
                <span style={{ color: '#aaa' }}>{activeEvent.freeTextResponse.reply}</span>
              </div>
            )}
            {activeEvent.resolved && activeEvent.freeTextResponse && showConsequence && (
              <div>
                <div style={{ color: '#8aff5c', marginBottom: 8 }}>{activeEvent.freeTextResponse.reply}</div>
                <div style={{ color: '#FFD54F', fontSize: 13 }}>{activeEvent.freeTextResponse.narration}</div>
              </div>
            )}

            {activeEvent.resolved && !chosenChoice?.consequence && !activeEvent.freeTextResponse && (
              <span style={{ color: '#aaa' }}>事件已结束。</span>
            )}
          </div>

          {/* 点击继续提示 */}
          {!activeEvent.resolved && !activeEvent.showChoices && !isTyping && (
            <div style={styles.clickHint}>▼ 点击继续</div>
          )}
        </div>

        {/* 等待 LLM 回应自由文本 */}
        {activeEvent.isWaitingFreeText && (
          <div style={styles.waitingArea}>
            <span style={styles.waitingDot}>●</span>
            <span style={styles.waitingText}>对方正在思考你的发言...</span>
          </div>
        )}

        {/* 自由文本输入区域 */}
        {showFreeTextInput && (
          <div style={styles.freeTextArea}>
            <textarea
              style={styles.freeTextInput}
              value={freeTextInput}
              onChange={(e) => setFreeTextInput(e.target.value)}
              onKeyDown={handleFreeTextKeyDown}
              placeholder={activeEvent.event.freeText?.placeholder ?? '输入你想说的话...'}
              rows={3}
              autoFocus
            />
            <div style={styles.freeTextActions}>
              <button
                style={{
                  ...styles.freeTextSubmitBtn,
                  opacity: freeTextInput.trim() ? 1 : 0.4,
                }}
                onClick={handleFreeTextSubmit}
                disabled={!freeTextInput.trim()}
              >
                发言
              </button>
              <span style={styles.freeTextHint}>
                Enter 发送 · 也可以从下方选择快捷回应
              </span>
            </div>
            {/* 快捷选项也保留 */}
            {activeEvent.event.choices.length > 0 && (
              <div style={styles.quickChoicesDivider}>快捷回应</div>
            )}
            <div style={styles.quickChoices}>
              {activeEvent.event.choices.map((choice) => (
                <button
                  key={choice.id}
                  style={styles.quickChoiceBtn}
                  onClick={() => handleChoice(choice.id)}
                >
                  {choice.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 多轮对话继续选项 */}
        {activeEvent.isConversationActive && activeEvent.freeTextResponse && !activeEvent.isWaitingFreeText && (
          <div style={styles.multiRoundArea}>
            <div style={styles.conversationHistory}>
              <div style={styles.historyLabel}>对话记录（{activeEvent.conversationHistory?.length || 0} 轮）</div>
              {activeEvent.conversationHistory?.slice(-2).map((h, i) => (
                <div key={i} style={styles.historyItem}>
                  <div style={styles.playerInput}>你：{h.playerInput}</div>
                  <div style={styles.npcResponse}>对方：{h.npcResponse}</div>
                </div>
              ))}
            </div>
            <div style={styles.continueOptions}>
              <button
                style={styles.continueBtn}
                onClick={() => {
                  setFreeTextInput('');
                  setActiveEvent((prev) => ({
                    ...prev!,
                    showChoices: false,
                    freeTextResponse: undefined,
                  }));
                }}
              >
                继续对话
              </button>
              <button
                style={styles.endConversationBtn}
                onClick={() => {
                  // 结束对话，结算累积的效果
                  makeChoice('end_conversation');
                }}
              >
                结束对话
              </button>
            </div>
          </div>
        )}

        {/* 固定选项区域（非自由文本事件） */}
        {showFixedChoices && (
          <div style={styles.choicesArea}>
            {activeEvent.event.choices.map((choice) => (
              <button
                key={choice.id}
                style={styles.choiceBtn}
                onClick={() => handleChoice(choice.id)}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = '#2a3a5c';
                  (e.target as HTMLElement).style.borderColor = '#5c8aff';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = '#1a2540';
                  (e.target as HTMLElement).style.borderColor = '#3a4a6a';
                }}
              >
                {choice.text}
              </button>
            ))}
          </div>
        )}

        {/* 效果展示 */}
        {activeEvent.resolved && showConsequence && (
          (chosenChoice && <EffectSummary choice={chosenChoice} parties={state.parties} />)
          || (activeEvent.freeTextResponse && (
            <EffectSummary
              choice={{
                id: 'free_text',
                text: '',
                effects: activeEvent.freeTextResponse.effects,
              }}
              parties={state.parties}
            />
          ))
        )}
      </div>
    </div>
  );
};

/** 角色立绘 */
const Portrait: React.FC<{ party: Party }> = ({ party }) => (
  <div style={styles.portraitContainer}>
    <div style={{ ...styles.portraitCircle, borderColor: party.color }}>
      <span style={{ ...styles.portraitAbbr, color: party.color }}>{party.abbreviation}</span>
    </div>
    <div style={{ ...styles.portraitName, color: party.color }}>{party.leader}</div>
    <div style={styles.portraitParty}>{party.name}</div>
  </div>
);

/** 效果展示面板 */
const EffectSummary: React.FC<{ choice: { text: string; effects: Record<string, unknown> }; parties: Party[] }> = ({ choice, parties }) => {
  const partyMap = new Map(parties.map((p) => [p.id, p]));
  const effects = choice.effects as {
    supportDelta?: Record<string, number>;
    fundsDelta?: Record<string, number>;
    metricsDelta?: Record<string, number>;
  };
  const hasEffects =
    (effects.supportDelta && Object.keys(effects.supportDelta).length > 0) ||
    (effects.metricsDelta && Object.keys(effects.metricsDelta).length > 0);

  if (!hasEffects) return null;

  return (
    <div style={styles.effectPanel}>
      <div style={styles.effectTitle}>数据变动</div>
      <div style={styles.effectList}>
        {Object.entries(effects.supportDelta ?? {}).map(([pid, delta]) => {
          const party = partyMap.get(pid);
          if (!party || delta === 0) return null;
          return (
            <div key={pid} style={styles.effectRow}>
              <span style={{ color: party.color }}>{party.abbreviation}</span>
              <span style={{ color: delta > 0 ? '#66BB6A' : '#EF5350', fontWeight: 700 }}>
                {delta > 0 ? '+' : ''}{delta}% 支持率
              </span>
            </div>
          );
        })}
        {Object.entries(effects.fundsDelta ?? {}).map(([pid, delta]) => {
          const party = partyMap.get(pid);
          if (!party || delta === 0) return null;
          return (
            <div key={`f-${pid}`} style={styles.effectRow}>
              <span style={{ color: party.color }}>{party.abbreviation}</span>
              <span style={{ color: delta > 0 ? '#66BB6A' : '#EF5350', fontWeight: 700 }}>
                {delta > 0 ? '+' : ''}{delta} 资金
              </span>
            </div>
          );
        })}
        {Object.entries(effects.metricsDelta ?? {}).map(([key, delta]) => {
          if (delta === 0) return null;
          const labels: Record<string, string> = {
            mediaAttention: '媒体关注度',
            socialStabilityIndex: '社会稳定',
            economicIndex: '经济景气',
          };
          return (
            <div key={key} style={styles.effectRow}>
              <span style={{ color: '#888' }}>{labels[key] ?? key}</span>
              <span style={{ color: delta > 0 ? '#66BB6A' : '#EF5350', fontWeight: 700 }}>
                {delta > 0 ? '+' : ''}{delta}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ===== Styles =====

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  window: {
    width: 780,
    maxWidth: '95vw',
    maxHeight: '90vh',
    background: 'linear-gradient(180deg, #0d1b2a 0%, #1b2838 100%)',
    borderRadius: 12,
    border: '1px solid #2a3a5c',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 0 60px rgba(30,60,120,0.4)',
  },
  titleBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 16px',
    background: 'rgba(0,0,0,0.3)',
    borderBottom: '1px solid #2a3a5c',
  },
  severityBadge: {
    color: '#FF6D00',
    fontWeight: 800,
    fontSize: 14,
    letterSpacing: 2,
  },
  titleText: {
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: 700,
    flex: 1,
  },
  closeBtn: {
    background: '#2a3a5c',
    border: '1px solid #4a5a7c',
    color: '#aaa',
    padding: '4px 14px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
  skipBtn: {
    background: 'rgba(239,83,80,0.15)',
    border: '1px solid rgba(239,83,80,0.4)',
    color: '#EF5350',
    padding: '4px 14px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
  sceneArea: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '24px 0 8px',
    minHeight: 130,
  },
  portraitContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  portraitCircle: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    border: '3px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.3)',
  },
  portraitAbbr: {
    fontSize: 22,
    fontWeight: 800,
  },
  portraitName: {
    fontSize: 13,
    fontWeight: 600,
  },
  portraitParty: {
    fontSize: 11,
    color: '#888',
  },
  narratorIcon: {
    fontSize: 32,
    color: '#555',
    fontWeight: 800,
  },
  dialogBox: {
    position: 'relative',
    margin: '8px 16px',
    padding: '28px 20px 16px',
    background: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    border: '1px solid #2a3a5c',
    minHeight: 100,
    cursor: 'pointer',
  },
  namePlate: {
    position: 'absolute',
    top: -12,
    left: 16,
    padding: '2px 14px',
    borderRadius: 4,
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
  },
  textArea: {
    color: '#ddd',
    fontSize: 15,
    lineHeight: 1.7,
    minHeight: 60,
  },
  clickHint: {
    textAlign: 'right',
    color: '#5c8aff',
    fontSize: 12,
    marginTop: 8,
    animation: 'blink 1s infinite',
  },
  // 自由文本输入
  freeTextArea: {
    padding: '8px 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  freeTextInput: {
    background: 'rgba(0,0,0,0.5)',
    border: '1px solid #3a4a6a',
    borderRadius: 6,
    color: '#e0e0e0',
    fontSize: 14,
    lineHeight: 1.6,
    padding: '10px 14px',
    resize: 'none',
    outline: 'none',
    fontFamily: 'inherit',
  },
  freeTextActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  freeTextSubmitBtn: {
    padding: '8px 24px',
    borderRadius: 6,
    background: 'linear-gradient(135deg, #43A047, #66BB6A)',
    border: 'none',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 2,
  },
  freeTextHint: {
    fontSize: 11,
    color: '#555',
  },
  quickChoicesDivider: {
    fontSize: 11,
    color: '#444',
    borderTop: '1px solid #1a2540',
    paddingTop: 8,
    marginTop: 4,
  },
  quickChoices: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickChoiceBtn: {
    background: '#1a2540',
    border: '1px solid #2a3a5c',
    color: '#888',
    padding: '6px 12px',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  // 等待 LLM 回应
  waitingArea: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 16px',
  },
  waitingDot: {
    color: '#5c8aff',
    fontSize: 10,
    animation: 'blink 1s infinite',
  },
  waitingText: {
    color: '#5c8aff',
    fontSize: 13,
  },
  // 固定选项
  choicesArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '8px 16px 16px',
  },
  choiceBtn: {
    background: '#1a2540',
    border: '1px solid #3a4a6a',
    color: '#e0e0e0',
    padding: '12px 18px',
    borderRadius: 6,
    fontSize: 14,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.15s',
    lineHeight: 1.5,
  },
  effectPanel: {
    margin: '0 16px 16px',
    padding: '10px 14px',
    background: 'rgba(0,0,0,0.35)',
    borderRadius: 6,
    border: '1px solid #2a3a5c',
  },
  effectTitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  effectList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px 20px',
  },
  effectRow: {
    display: 'flex',
    gap: 8,
    fontSize: 13,
  },
  // 多轮对话
  multiRoundArea: {
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  conversationHistory: {
    maxHeight: 120,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  historyLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  historyItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '8px 12px',
    background: 'rgba(0,0,0,0.2)',
    borderRadius: 4,
    border: '1px solid #2a3a5c',
  },
  playerInput: {
    fontSize: 12,
    color: '#8aff5c',
  },
  npcResponse: {
    fontSize: 12,
    color: '#ddd',
  },
  continueOptions: {
    display: 'flex',
    gap: 8,
  },
  continueBtn: {
    flex: 1,
    padding: '10px 20px',
    borderRadius: 6,
    background: 'linear-gradient(135deg, #43A047, #66BB6A)',
    border: 'none',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 2,
  },
  endConversationBtn: {
    flex: 1,
    padding: '10px 20px',
    borderRadius: 6,
    background: 'linear-gradient(135deg, #EF5350, #E57373)',
    border: 'none',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 2,
  },
};
