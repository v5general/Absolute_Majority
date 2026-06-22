import React, { useState, useEffect, useCallback } from 'react';
import { useGame } from '../hooks/useGameState';
import { BackgroundImage } from './BackgroundImage';
import type { Party, ChoiceEffect, PoliticalEvent } from '../types';

/**
 * 检测当前事件是否是「料亭」类密会场景。
 * 命中条件（满足任一）：
 *  - intentType === 'opposition_coalition'（在野联盟密会，prompt 里明确提到料亭）
 *  - 事件标题/摘要/对话/scenePrompt 文本里出现料亭、割烹、隠れ家、個室、密会 等关键词
 */
const RYOTEI_KEYWORDS = /料亭|割烹|隠れ家|個室|密会|私室|高級料理屋/;
function isRyoteiScene(event: PoliticalEvent | undefined): boolean {
  if (!event) return false;
  if (event.intentType === 'opposition_coalition') return true;
  const parts = [
    event.title,
    event.summary,
    event.freeText?.scenePrompt ?? '',
    ...event.dialogs.map(d => `${d.speaker ?? ''} ${d.text}`),
  ];
  return RYOTEI_KEYWORDS.test(parts.join(' '));
}

/**
 * Galgame 风格的事件弹窗
 * - 打字机效果逐字显示对话
 * - 角色立绘（彩色圆形 + 党首名）
 * - 对话结束后：显示选项 或 自由文本输入框
 * - AI 对自由文本的回应实时展示
 */
export const GalgameDialog: React.FC = () => {
  const { state, activeEvent, advanceDialog, finishTyping, makeChoice, submitFreeText, continueConversation, dismissEvent } = useGame();

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

  // 检测料亭密会场景：命中时叠加场景背景图，并让 window 背景半透明以露出图片。
  // 注意 isRyoteiScene 已对 undefined 入参做了兜底（返回 false），可以安全地
  // 在 early return 之外直接调用，避免触发 Hooks 顺序问题。
  const ryotei = isRyoteiScene(activeEvent?.event);
  const windowStyle: React.CSSProperties = ryotei
    ? { ...styles.window, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }
    : styles.window;

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      {/* 料亭场景背景图：命中时自动加载（WebP/PNG 自适应），未提供图片文件时静默不渲染 */}
      {ryotei && <BackgroundImage image="scene-ryotei" />}
      <div style={windowStyle} onClick={handleWindowClick}>
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
                  continueConversation();
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
                  (e.target as HTMLElement).style.backgroundColor = 'rgba(0,0,0,0.5)';
                  (e.target as HTMLElement).style.borderColor = COLOR_BORDER_ACTIVE;
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = 'rgba(0,0,0,0.4)';
                  (e.target as HTMLElement).style.borderColor = COLOR_BORDER;
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
const EffectSummary: React.FC<{ choice: { text: string; effects: ChoiceEffect }; parties: Party[] }> = ({ choice, parties }) => {
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

const FONT_SERIF = '"Noto Serif SC", "Source Han Serif SC", Georgia, serif';
const COLOR_GOLD = '#C0A882';
const COLOR_GOLD_DIM = '#B8A47C';
const COLOR_BORDER = 'rgba(192, 168, 130, 0.18)';
const COLOR_BORDER_ACTIVE = 'rgba(192, 168, 130, 0.4)';

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'stretch',
    zIndex: 1000,
    backdropFilter: 'blur(6px)',
  },
  window: {
    // 用 position:fixed + inset:0 而不是 100vw/100vh —— 后者在 iOS Safari 上
    // 会被动态工具栏截断，inset:0 由浏览器直接算到安全区内，所有设备都能正确铺满
    position: 'fixed',
    inset: 0,
    width: '100%',
    height: '100%',
    // 底部留白：让对话框（被 flex:1 的 sceneArea 顶到底边）整体上移一些，
    // 避免紧贴屏幕底部。clamp 在手机/桌面间自适应。
    paddingBottom: 'clamp(80px, 12vh, 180px)',
    background: 'rgba(0,0,0,0.88)',
    borderRadius: 0,
    border: 'none',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box' as const,
    backdropFilter: 'blur(12px)',
  },
  titleBar: {
    // 标题栏铺满整行（不再 max-width:820 居中），事件名称自然落到屏幕左侧
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px clamp(20px, 4vw, 48px)',
    background: 'rgba(0,0,0,0.35)',
    borderBottom: `1px solid ${COLOR_BORDER}`,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  severityBadge: {
    color: COLOR_GOLD,
    fontWeight: 800,
    fontSize: 'clamp(14px, 1.4vw, 18px)',
    letterSpacing: 2,
  },
  titleText: {
    color: COLOR_GOLD,
    fontSize: 'clamp(16px, 1.8vw, 22px)',
    fontWeight: 700,
    flex: 1,
    fontFamily: FONT_SERIF,
  },
  closeBtn: {
    background: 'rgba(0,0,0,0.5)',
    border: `1px solid ${COLOR_BORDER}`,
    color: '#aaa',
    padding: '4px 14px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: FONT_SERIF,
  },
  skipBtn: {
    background: 'rgba(239,83,80,0.15)',
    border: `1px solid rgba(239,83,80,0.4)`,
    color: '#EF5350',
    padding: '4px 14px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: FONT_SERIF,
  },
  sceneArea: {
    flex: 1,
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
    // clamp() 让立绘在小屏（手机）保持 72px，在大屏（桌面）放大到最多 144px，
    // 中间区间跟随视口宽度等比缩放，避免全屏后立绘小得看不清
    width: 'clamp(72px, 10vw, 144px)',
    height: 'clamp(72px, 10vw, 144px)',
    borderRadius: '50%',
    border: '3px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.3)',
  },
  portraitAbbr: {
    fontSize: 'clamp(20px, 2.6vw, 36px)',
    fontWeight: 800,
  },
  portraitName: {
    fontSize: 'clamp(13px, 1.4vw, 18px)',
    fontWeight: 600,
    fontFamily: FONT_SERIF,
  },
  portraitParty: {
    fontSize: 'clamp(11px, 1.1vw, 14px)',
    color: '#888',
  },
  narratorIcon: {
    fontSize: 32,
    color: '#555',
    fontWeight: 800,
  },
  dialogBox: {
    position: 'relative',
    margin: '8px auto',
    padding: '28px 20px 16px',
    background: 'rgba(0,0,0,0.4)',
    borderRadius: 4,
    border: `2px solid ${COLOR_BORDER}`,
    minHeight: 100,
    cursor: 'pointer',
    width: 'calc(100% - 32px)',
    maxWidth: 1200,
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
    fontFamily: FONT_SERIF,
  },
  clickHint: {
    textAlign: 'right',
    color: COLOR_GOLD,
    fontSize: 12,
    marginTop: 8,
    animation: 'blink 1s infinite',
    fontFamily: FONT_SERIF,
  },
  // 自由文本输入
  freeTextArea: {
    padding: '8px 16px 16px',
    margin: '0 auto',
    maxWidth: 1200,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    boxSizing: 'border-box',
  },
  freeTextInput: {
    background: 'rgba(0,0,0,0.4)',
    border: `1px solid ${COLOR_BORDER}`,
    borderRadius: 4,
    color: '#e0e0e0',
    fontSize: 14,
    lineHeight: 1.6,
    padding: '10px 14px',
    resize: 'none',
    outline: 'none',
    fontFamily: FONT_SERIF,
  },
  freeTextActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  freeTextSubmitBtn: {
    padding: '8px 24px',
    borderRadius: 4,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    border: `1px solid ${COLOR_BORDER_ACTIVE}`,
    color: COLOR_GOLD,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 2,
    fontFamily: FONT_SERIF,
  },
  freeTextHint: {
    fontSize: 11,
    color: 'rgba(192,168,130,0.5)',
  },
  quickChoicesDivider: {
    fontSize: 11,
    color: 'rgba(192,168,130,0.5)',
    borderTop: `1px solid ${COLOR_BORDER}`,
    paddingTop: 8,
    marginTop: 4,
  },
  quickChoices: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickChoiceBtn: {
    background: 'rgba(0,0,0,0.4)',
    border: `1px solid ${COLOR_BORDER}`,
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
    color: COLOR_GOLD,
    fontSize: 10,
    animation: 'blink 1s infinite',
  },
  waitingText: {
    color: COLOR_GOLD,
    fontSize: 13,
    fontFamily: FONT_SERIF,
  },
  // 固定选项
  choicesArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '8px 16px 16px',
    margin: '0 auto',
    maxWidth: 1200,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  choiceBtn: {
    background: 'rgba(0,0,0,0.4)',
    border: `1px solid ${COLOR_BORDER}`,
    color: '#e0e0e0',
    padding: '12px 18px',
    borderRadius: 4,
    fontSize: 14,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.15s',
    lineHeight: 1.5,
    fontFamily: FONT_SERIF,
  },
  effectPanel: {
    margin: '0 auto 16px',
    padding: '10px 14px',
    background: 'rgba(0,0,0,0.4)',
    borderRadius: 4,
    border: `2px solid ${COLOR_BORDER}`,
    width: 'calc(100% - 32px)',
    maxWidth: 1200,
    boxSizing: 'border-box' as const,
  },
  effectTitle: {
    fontSize: 12,
    color: COLOR_GOLD_DIM,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontFamily: FONT_SERIF,
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
    margin: '0 auto',
    maxWidth: 1200,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxSizing: 'border-box' as const,
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
    color: COLOR_GOLD_DIM,
    marginBottom: 4,
    fontFamily: FONT_SERIF,
  },
  historyItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '8px 12px',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 4,
    border: `2px solid ${COLOR_BORDER}`,
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
    borderRadius: 4,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    border: `1px solid ${COLOR_BORDER_ACTIVE}`,
    color: COLOR_GOLD,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 2,
    fontFamily: FONT_SERIF,
  },
  endConversationBtn: {
    flex: 1,
    padding: '10px 20px',
    borderRadius: 4,
    background: 'rgba(239,83,80,0.6)',
    backdropFilter: 'blur(8px)',
    border: `1px solid rgba(239,83,80,0.4)`,
    color: '#EF5350',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 2,
    fontFamily: FONT_SERIF,
  },
};
