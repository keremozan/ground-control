"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { BookOpen } from "lucide-react";
import { charIcon } from "@/lib/char-icons";
import { useChatTrigger, type ChatTrigger } from "@/lib/chat-store";
import { logAction } from "@/lib/action-log";
import type { ChatMessage as ChatMessageType } from "@/types";
import ChatMessage, { ThinkingAvatar, ThinkingBubble } from "./ChatMessage";
import ChatMarkdown from "./ChatMarkdown";
import ChatToolOutput from "./ChatToolOutput";
import ChatForm from "./ChatForm";
import {
  splitMessage, estimateTokens, getContextLimit,
  COMPRESS_THRESHOLD, WARN_THRESHOLD,
} from "./helpers";

// ─── Types ──────────────────────────────────────────────────────────────────

type ChatCharInfo = {
  id: string;
  name: string;
  color: string;
  defaultModel?: string;
  model?: string;
  suggestions?: string[];
};

export type ChatPanelProps = {
  tabId: string;
  characters: ChatCharInfo[];
  charId: string;
  initialMessages: ChatMessageType[];
  initialModel?: string;
  onMessagesChange: (msgs: ChatMessageType[]) => void;
  onLoadingChange: (loading: boolean) => void;
  canSend: boolean;
  trigger: ChatTrigger | null;
  onTriggerConsumed: () => void;
  isActive: boolean;
};

// ─── ChatPanel ──────────────────────────────────────────────────────────────

export default function ChatPanel({
  tabId, characters, charId, initialMessages, initialModel,
  onMessagesChange, onLoadingChange, canSend,
  trigger, onTriggerConsumed, isActive,
}: ChatPanelProps) {
  const { setTrigger: setCharTrigger } = useChatTrigger();
  const [messages, setMessages] = useState<ChatMessageType[]>(initialMessages);
  const [input, setInput] = useState("");
  const [pastedImages, setPastedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeToolInput, setActiveToolInput] = useState<string>("");
  const [toolLog, setToolLog] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [pendingContext, setPendingContext] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [skillList, setSkillList] = useState<{ name: string; description: string; character?: string }[]>([]);
  const messagesRef = useRef<ChatMessageType[]>(messages);
  const charDefault = characters.find(c => c.id === charId);
  const [modelOverride, setModelOverride] = useState<string>(initialModel || charDefault?.model || "sonnet");
  const bodyRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const triggerFiredRef = useRef<ChatTrigger | null>(null);

  const activeChar = characters.find(c => c.id === charId) || characters[0];
  const ActiveIcon = activeChar ? (charIcon[activeChar.name] || BookOpen) : BookOpen;

  // Context usage
  const contextLimit = getContextLimit(activeChar?.defaultModel);
  const usedTokens = estimateTokens(messages);
  const contextPct = usedTokens / contextLimit;

  // Auto-compress when threshold hit
  useEffect(() => {
    if (contextPct >= COMPRESS_THRESHOLD && !compressing && !isLoading && messages.length >= 4) {
      compressHistory();
    }
  }, [contextPct]); // eslint-disable-line react-hooks/exhaustive-deps

  const compressHistory = async () => {
    if (compressing || messages.length < 4) return;
    setCompressing(true);
    try {
      const toCompress = messages.slice(0, -2);
      const kept = messages.slice(-2);
      const historyText = toCompress.map(m =>
        `${m.role === 'user' ? 'User' : m.charName || 'Assistant'}: ${m.content}`
      ).join('\n\n');
      const res = await fetch('/api/inbox/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarize-text', text: historyText }),
      });
      const raw = await res.json();
      const data = raw?.data ?? raw;
      if (data.summary) {
        const compressedMsg: ChatMessageType = {
          role: 'assistant',
          charName: 'system',
          content: `**Context compressed** (${toCompress.length} messages)\n\n${data.summary}`,
        };
        setMessages([compressedMsg, ...kept]);
      }
    } catch {} finally {
      setCompressing(false);
    }
  };

  // Sync messages back to wrapper for persistence
  useEffect(() => { onMessagesChange(messages); }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onLoadingChange(isLoading); }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Elapsed timer while loading
  useEffect(() => {
    if (!isLoading) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [isLoading]);

  // Drain message queue when AI finishes
  useEffect(() => {
    if (isLoading || !canSend) return;
    if (messageQueue.length === 0) return;
    const [next, ...rest] = messageQueue;
    const currentMessages = messagesRef.current;
    setMessageQueue(rest);
    setMessages(m => [...m, { role: "user", content: next }]);
    const effectiveModel = modelOverride !== activeChar?.model ? modelOverride : undefined;
    sendMessage(next, undefined, null, currentMessages, effectiveModel);
  }, [isLoading, canSend, messageQueue]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Pre-fetch skill list
  useEffect(() => {
    fetch("/api/system/skills").then(r => r.json()).then(raw => { const d = raw?.data ?? raw; setSkillList(d.skills || []); }).catch(() => {});
  }, []);

  // Auto-scroll
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 120) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading, streamingText, toolLog]);

  // Scroll to bottom when tab becomes visible
  useEffect(() => {
    if (!isActive) return;
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [isActive]);

  // Handle trigger from wrapper
  useEffect(() => {
    if (!trigger || characters.length === 0) return;
    if (trigger === triggerFiredRef.current) return;
    triggerFiredRef.current = trigger;
    const { seedPrompt, context, model } = trigger;
    if (model) setModelOverride(model);
    setMessages([{ role: "user", content: seedPrompt }]);
    if (context) setPendingContext(context);
    onTriggerConsumed();
    sendMessage(seedPrompt, charId, context, undefined, model);
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Abort on real unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      const ctrl = abortRef.current;
      mountedRef.current = false;
      setTimeout(() => {
        if (!mountedRef.current && ctrl) ctrl.abort();
      }, 50);
    };
  }, []);

  const sendMessage = async (msg: string, targetCharId?: string, context?: string | null, history?: ChatMessageType[], modelOvr?: string, images?: Array<{mediaType: string; data: string}>, skill?: string) => {
    setIsLoading(true);
    setToolLog([]);
    let fullText = '';
    const cid = targetCharId || charId;
    const targetChar = characters.find(c => c.id === cid);
    const startTime = Date.now();
    const ctxToSend = context ?? pendingContext;
    if (pendingContext && !context) setPendingContext(null);

    const historyToSend = history && history.length > 0
      ? history.map(m => ({
          role: m.role,
          content: m.content,
          ...(m.images && m.images.length > 0 ? {
            images: m.images.map(dataUrl => {
              const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
              return match ? { mediaType: match[1], data: match[2] } : null;
            }).filter((x): x is { mediaType: string; data: string } => x !== null),
          } : {}),
        }))
      : undefined;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: cid,
          message: msg,
          ...(ctxToSend ? { context: ctxToSend } : {}),
          ...(historyToSend ? { history: historyToSend } : {}),
          ...(modelOvr ? { model: modelOvr } : {}),
          ...(images && images.length > 0 ? { images } : {}),
          ...(skill ? { skill } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.body) throw new Error('no body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)/m);
          const dataMatch = part.match(/^data: (.+)/m);
          if (!eventMatch || !dataMatch) continue;
          try {
            const parsed = JSON.parse(dataMatch[1]);
            if (eventMatch[1] === 'text') {
              fullText += parsed.text;
              setStreamingText(fullText);
              setActiveTool(null);
            }
            if (eventMatch[1] === 'tool_call') {
              setActiveTool(parsed.tool);
              setActiveToolInput(parsed.input || "");
              setToolLog(prev => [...prev, parsed.tool]);
            }
            if (eventMatch[1] === 'done') {
              const duration = (Date.now() - startTime) / 1000;
              const tokens = Math.round((msg.length + fullText.length) / 4);
              setMessages(prev => [...prev, {
                role: 'assistant',
                charName: targetChar?.name,
                content: fullText || '(no response)',
                duration,
                tokens,
              }]);
              setStreamingText("");
              setActiveTool(null);
              setToolLog([]);
              setIsLoading(false);
              abortRef.current = null;
            }
          } catch {}
        }
      }
    } catch (e) {
      if (abortRef.current !== controller) return;
      const duration = (Date.now() - startTime) / 1000;
      if (fullText) {
        const tokens = Math.round((msg.length + fullText.length) / 4);
        setMessages(prev => [...prev, {
          role: 'assistant',
          charName: targetChar?.name,
          content: fullText,
          duration,
          tokens,
        }]);
      } else if (e instanceof DOMException && e.name === 'AbortError') {
        if (duration >= 0.5) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            charName: targetChar?.name,
            content: '(stopped)',
            duration,
          }]);
        }
      }
      setStreamingText("");
      setActiveTool(null);
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const handleSend = () => {
    if ((!input.trim() && pastedImages.length === 0) || !activeChar || !canSend) return;
    const msg = input.trim();

    if (isLoading) {
      if (msg) {
        setMessageQueue(prev => [...prev, msg]);
        setInput("");
        setPastedImages([]);
      }
      return;
    }

    let actualMsg = msg;
    let slashSkill: string | undefined;
    const slashMatch = msg.match(/^\/([a-z0-9-]+)\s*([\s\S]*)/);
    if (slashMatch) {
      const candidate = slashMatch[1];
      if (skillList.some(s => s.name === candidate)) {
        slashSkill = candidate;
        actualMsg = slashMatch[2].trim() || `Run /${candidate}`;
      }
    }

    const currentMessages = [...messages];
    if (currentMessages.length === 0) {
      logAction({ widget: "chat", action: "chat-first-message", target: actualMsg.slice(0, 80), character: activeChar.id, detail: actualMsg });
    }
    const apiImages: Array<{mediaType: string; data: string}> = pastedImages.map(dataUrl => {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      return match ? { mediaType: match[1], data: match[2] } : null;
    }).filter(Boolean) as Array<{mediaType: string; data: string}>;
    setMessages(prev => [...prev, {
      role: "user",
      content: slashSkill ? `/${slashSkill} ${actualMsg}` : actualMsg,
      images: pastedImages.length > 0 ? [...pastedImages] : undefined,
    }]);
    setInput("");
    setPastedImages([]);
    const effectiveModel = modelOverride !== activeChar?.model ? modelOverride : undefined;
    sendMessage(actualMsg || "(image)", undefined, null, currentMessages, effectiveModel, apiImages.length > 0 ? apiImages : undefined, slashSkill);
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    logAction({ widget: "chat", action: "stop", target: activeChar?.name || "unknown", character: activeChar?.id });
    setStreamingText("");
    setActiveTool(null);
    setToolLog([]);
    setMessageQueue([]);
    setIsLoading(false);
  };

  const handleQuickReply = useCallback((text: string) => {
    if (isLoading || !canSend) return;
    const navPattern = /^(?:open in|switch to|ask|send to|forward to)\s+(\w+)/i;
    const navMatch = text.match(navPattern);
    const targetSwitch = navMatch
      ? characters.find(c => c.id !== charId && c.name.toLowerCase() === navMatch[1].toLowerCase())
      : undefined;
    if (targetSwitch) {
      const ctx = messages.map(m =>
        `${m.role === 'user' ? 'User' : m.charName || 'Assistant'}: ${m.content}`
      ).join('\n\n');
      setCharTrigger({ charName: targetSwitch.name, seedPrompt: text, action: 'char-switch', context: ctx });
    } else {
      const current = [...messages];
      setMessages(prev => [...prev, { role: "user", content: text }]);
      const effectiveModel = modelOverride !== activeChar?.model ? modelOverride : undefined;
      sendMessage(text, undefined, null, current, effectiveModel);
    }
  }, [isLoading, canSend, characters, charId, messages, modelOverride, activeChar]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  const sendMsgToTana = useCallback(async (text: string, charName?: string) => {
    try {
      await fetch('/api/tana-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `${charName || 'Chat'} note`, content: text }),
      });
    } catch {}
  }, []);

  const deleteMessage = useCallback((index: number) => {
    setMessages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleChipClick = (suggestion: string) => {
    if (isLoading || !activeChar || !canSend) return;
    const currentMessages = [...messages];
    logAction({ widget: "chat", action: "chat-first-message", target: suggestion.slice(0, 80), character: activeChar.id, detail: suggestion });
    setMessages(prev => [...prev, { role: "user", content: suggestion }]);
    const effectiveModel = modelOverride !== activeChar?.model ? modelOverride : undefined;
    sendMessage(suggestion, undefined, null, currentMessages, effectiveModel);
  };

  if (!activeChar) return null;

  return (
    <>
      <div ref={bodyRef} className="widget-body" style={{ padding: "14px" }}>
        {messages.length === 0 && !isLoading && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, padding: "0 20px" }}>
            {activeChar?.suggestions && activeChar.suggestions.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center", maxWidth: 480 }}>
                {activeChar.suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleChipClick(s)}
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: 9,
                      padding: "3px 8px",
                      border: `1px solid ${activeChar.color}50`,
                      borderRadius: 3, background: "transparent",
                      color: activeChar.color, cursor: "pointer",
                      lineHeight: 1.5, transition: "background 0.1s, border-color 0.1s",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = `${activeChar.color}18`;
                      e.currentTarget.style.borderColor = `${activeChar.color}90`;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = `${activeChar.color}50`;
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
                Start a conversation
              </span>
            )}
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            msg={msg}
            index={i}
            activeChar={activeChar}
            characters={characters}
            isLoading={isLoading}
            canSend={canSend}
            onCopy={copyToClipboard}
            onSendToTana={sendMsgToTana}
            onDelete={deleteMessage}
            onQuickReply={handleQuickReply}
          />
        ))}
        {isLoading && (
          (streamingText || activeTool) ? (
            <div className="chat-msg-row chat-msg-assistant">
              <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <ThinkingAvatar color={activeChar.color}>
                  <ActiveIcon size={10} strokeWidth={1.5} style={{ color: activeChar.color }} />
                </ThinkingAvatar>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {streamingText && (
                    <div className="chat-bubble chat-bubble-assistant" style={{ borderLeftColor: activeChar.color + "40" }}>
                      <ChatMarkdown text={splitMessage(streamingText).output} accent={activeChar.color} />
                    </div>
                  )}
                  <ChatToolOutput
                    activeTool={activeTool}
                    activeToolInput={activeToolInput}
                    toolLog={toolLog}
                    elapsed={elapsed}
                    accent={activeChar.color}
                    streamingText={streamingText}
                  />
                </div>
              </div>
            </div>
          ) : (
            <ThinkingBubble charName={activeChar.name} color={activeChar.color} />
          )
        )}
      </div>

      {(contextPct >= WARN_THRESHOLD || compressing) && (
        <div style={{
          padding: "3px 12px", display: "flex", alignItems: "center", gap: 6,
          borderTop: "1px solid var(--border)", background: "var(--surface-2)",
        }}>
          <div style={{
            flex: 1, height: 3, borderRadius: 2, background: "var(--border)",
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 2,
              width: `${Math.min(contextPct * 100, 100)}%`,
              background: contextPct >= COMPRESS_THRESHOLD ? "var(--red)" : "var(--amber)",
              transition: "width 0.3s",
            }} />
          </div>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-3)", flexShrink: 0,
          }}>
            {compressing ? "Compressing..." : `${Math.round(contextPct * 100)}% context`}
          </span>
        </div>
      )}

      <ChatForm
        input={input}
        setInput={setInput}
        onSend={handleSend}
        isLoading={isLoading}
        onStop={handleStop}
        canSend={canSend}
        charName={activeChar.name}
        accent={activeChar.color}
        activeTool={activeTool}
        activeToolInput={activeToolInput}
        toolLogCount={toolLog.length}
        elapsed={elapsed}
        pastedImages={pastedImages}
        onPasteImage={(dataUrl) => setPastedImages(prev => [...prev, dataUrl])}
        onRemoveImage={(idx) => setPastedImages(prev => prev.filter((_, i) => i !== idx))}
        modelOverride={modelOverride}
        setModelOverride={setModelOverride}
        charDefaultModel={activeChar?.model}
        messageQueue={messageQueue}
        onRemoveQueueItem={(idx) => setMessageQueue(prev => prev.filter((_, i) => i !== idx))}
      />
    </>
  );
}
