"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { charIcon } from "@/lib/char-icons";
import { useChatTrigger, type ChatTrigger } from "@/lib/chat-store";
import { logAction } from "@/lib/action-log";
import TanaIcon from "@/components/icons/TanaIcon";
import { parseToolName } from "@/lib/mcp-icons";
import { resolveIcon } from "@/lib/icon-map";
import {
  BookOpen, Bug, Copy, CornerUpRight, Loader2,
  Send, Square, Trash2, Plus, X,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type CharacterInfo = {
  id: string;
  name: string;
  color: string;
  defaultModel?: string;
  model?: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  charName?: string;
  duration?: number;
  tokens?: number;
};

type TabMeta = {
  id: string;
  charId: string;
  messages: Message[];
  modelOverride?: string;
};

/** Extract a short label from tool input JSON for display */
function toolInputLabel(tool: string, raw: string): string {
  try {
    const obj = JSON.parse(raw);
    if (tool === "Bash" && obj.command) {
      const cmd = obj.command.length > 60 ? obj.command.slice(0, 57) + "..." : obj.command;
      return cmd;
    }
    if ((tool === "Read" || tool === "Edit" || tool === "Write") && obj.file_path) {
      return obj.file_path.split("/").pop() || obj.file_path;
    }
    if (tool === "Glob" && obj.pattern) return obj.pattern;
    if (tool === "Grep" && obj.pattern) return obj.pattern;
  } catch {}
  return "";
}

// ─── Helpers (unchanged) ────────────────────────────────────────────────────

/** Split assistant message into self-talk (preamble) and structured output */
function openTanaNode(nodeId: string) {
  fetch("/api/tana-tasks/action", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodeId, action: "open" }),
  }).catch(() => {});
}

function openGmail(threadId: string, account: string) {
  const idx = account === "school" ? 1 : 0;
  window.open(`https://mail.google.com/mail/u/${idx}/#inbox/${threadId}`, "_blank");
}

const LINK_RE = /(\[[^\]]+\]\((?:tana|gmail):[^)]+\))/g;
const TANA_LINK_RE = /^\[([^\]]+)\]\(tana:([^)]+)\)$/;
const GMAIL_LINK_RE = /^\[([^\]]+)\]\(gmail:([^:]+):([^)]+)\)$/;

function processLinks(s: string, accent?: string): React.ReactNode[] {
  const parts = s.split(LINK_RE);
  return parts.map((p, j) => {
    const tana = p.match(TANA_LINK_RE);
    if (tana) return <span key={j} onClick={() => openTanaNode(tana[2])} style={{
      color: accent || "var(--blue)", cursor: "pointer", fontWeight: 600,
      borderBottom: `1.5px solid ${accent || "var(--blue)"}40`, paddingBottom: 0.5,
    }}>{tana[1]}</span>;
    const gmail = p.match(GMAIL_LINK_RE);
    if (gmail) return <span key={j} onClick={() => openGmail(gmail[2], gmail[3])} style={{
      color: accent || "var(--blue)", cursor: "pointer", fontWeight: 600,
      borderBottom: `1.5px solid ${accent || "var(--blue)"}40`, paddingBottom: 0.5,
    }}>{gmail[1]}</span>;
    return p;
  });
}

function splitMessage(text: string): { thinking: string; output: string } {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (
      t.startsWith('##') ||
      /^---+$/.test(t) ||
      /^[✅🔴🟠🟡🟢❌⚠️☑️✓]/.test(t) ||
      /^\*\*(Status|Summary|Results|Action|Distribution|Routing)/.test(t)
    ) {
      const thinking = lines.slice(0, i).join('\n').trim();
      const output = lines.slice(i).join('\n').trim();
      return { thinking, output };
    }
  }
  return { thinking: '', output: text };
}

const EMOJI_MAP: Record<string, { label: string; color: string; bg: string }> = {
  "\u2705": { label: "OK", color: "#16a34a", bg: "#16a34a18" },
  "\u2714\uFE0F": { label: "OK", color: "#16a34a", bg: "#16a34a18" },
  "\u274C": { label: "X", color: "#dc2626", bg: "#dc262618" },
  "\u274E": { label: "X", color: "#dc2626", bg: "#dc262618" },
  "\u26A0\uFE0F": { label: "!", color: "#d97706", bg: "#d9770618" },
  "\u2139\uFE0F": { label: "i", color: "#2563eb", bg: "#2563eb18" },
  "\u{1F4E7}": { label: "MAIL", color: "#6366f1", bg: "#6366f118" },
  "\u{1F4DD}": { label: "NOTE", color: "#8b5cf6", bg: "#8b5cf618" },
  "\u{1F4CB}": { label: "LIST", color: "#0891b2", bg: "#0891b218" },
  "\u{1F4CC}": { label: "PIN", color: "#dc2626", bg: "#dc262618" },
  "\u{1F50D}": { label: "FIND", color: "#6366f1", bg: "#6366f118" },
  "\u{1F4C1}": { label: "DIR", color: "#d97706", bg: "#d9770618" },
  "\u{1F4C4}": { label: "FILE", color: "#6b7280", bg: "#6b728018" },
  "\u{1F6D1}": { label: "STOP", color: "#dc2626", bg: "#dc262618" },
  "\u{1F680}": { label: "GO", color: "#2563eb", bg: "#2563eb18" },
};
const EMOJI_KEYS = Object.keys(EMOJI_MAP);
const EMOJI_RE = new RegExp(`(${EMOJI_KEYS.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gu');

function renderEmoji(seg: string, key: string) {
  const em = EMOJI_MAP[seg];
  if (!em) return null;
  return <span key={key} style={{
    fontFamily: "var(--font-mono)", fontSize: "0.8em", fontWeight: 600,
    color: em.color, background: em.bg,
    padding: "1px 4px", borderRadius: 3, letterSpacing: 0.5,
    display: "inline-block", lineHeight: 1.4,
  }}>{em.label}</span>;
}

function expandEmoji(text: string, keyPrefix: string): React.ReactNode[] {
  EMOJI_RE.lastIndex = 0;
  if (!EMOJI_RE.test(text)) return [text];
  EMOJI_RE.lastIndex = 0;
  const parts = text.split(EMOJI_RE);
  return parts.map((seg, i) => {
    const em = renderEmoji(seg, `${keyPrefix}-e${i}`);
    return em || (seg ? <span key={`${keyPrefix}-e${i}`}>{seg}</span> : null);
  }).filter(Boolean) as React.ReactNode[];
}

function ChatMarkdown({ text, accent, onQuickReply }: { text: string; accent?: string; onQuickReply?: (text: string) => void }) {
  const processInline = (s: string): React.ReactNode[] => {
    const parts = s.split(/(==[^=]+=+=|==\S[^=]*\S==|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:tana|gmail):[^)]+\))/g);
    const nodes: React.ReactNode[] = [];
    parts.forEach((p, j) => {
      const tanaMatch = p.match(TANA_LINK_RE);
      if (tanaMatch) {
        nodes.push(<span key={j} onClick={() => openTanaNode(tanaMatch[2])} style={{
          color: accent || 'var(--blue)', cursor: 'pointer', fontWeight: 600,
          borderBottom: `1.5px solid ${accent || 'var(--blue)'}40`,
          paddingBottom: 0.5,
        }}>{tanaMatch[1]}</span>);
        return;
      }
      const gmailMatch = p.match(GMAIL_LINK_RE);
      if (gmailMatch) {
        nodes.push(<span key={j} onClick={() => openGmail(gmailMatch[2], gmailMatch[3])} style={{
          color: accent || 'var(--blue)', cursor: 'pointer', fontWeight: 600,
          borderBottom: `1.5px solid ${accent || 'var(--blue)'}40`,
          paddingBottom: 0.5,
        }}>{gmailMatch[1]}</span>);
        return;
      }
      if (p.startsWith('==') && p.endsWith('==')) {
        nodes.push(<mark key={j} style={{
          background: 'linear-gradient(transparent 60%, #fde68a 60%)',
          color: 'var(--text)', padding: 0, borderRadius: 0,
        }}>{p.slice(2, -2)}</mark>);
        return;
      }
      if (p.startsWith('**') && p.endsWith('**')) {
        nodes.push(<strong key={j} style={{
          color: accent || 'var(--text)',
          borderBottom: `1.5px solid ${accent || 'var(--text)'}30`,
          paddingBottom: 0.5,
        }}>{p.slice(2, -2)}</strong>);
        return;
      }
      if (p.startsWith('`') && p.endsWith('`')) {
        nodes.push(<code key={j} style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.9em',
          background: 'var(--bg-2)', padding: '1px 4px', borderRadius: 3,
          color: accent || 'var(--text)',
        }}>{p.slice(1, -1)}</code>);
        return;
      }
      // Plain text — expand emoji to styled labels
      nodes.push(...expandEmoji(p, `${j}`));
    });
    return nodes;
  };

  const parseTableCells = (row: string) =>
    row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  const isSeparator = (row: string) => /^\|[\s\-:|]+\|$/.test(row.trim());

  const lines = text.split('\n');
  const blocks: { type: 'line' | 'table'; content: string[] }[] = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith('|') && t.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      blocks.push({ type: 'table', content: tableLines });
    } else {
      blocks.push({ type: 'line', content: [lines[i]] });
      i++;
    }
  }

  return (
    <div>
      {blocks.map((block, bi) => {
        if (block.type === 'table') {
          const rows = block.content.filter(r => !isSeparator(r));
          if (rows.length === 0) return null;
          const header = parseTableCells(rows[0]);
          const body = rows.slice(1).map(r => parseTableCells(r));
          return (
            <table key={bi} style={{
              width: '100%', borderCollapse: 'collapse', margin: '6px 0',
              fontFamily: 'var(--font-mono)', fontSize: '10px',
            }}>
              <thead>
                <tr>
                  {header.map((h, hi) => (
                    <th key={hi} style={{
                      textAlign: 'left', padding: '3px 6px', fontWeight: 600,
                      borderBottom: `1px solid ${accent || 'var(--border)'}`,
                      color: accent || 'var(--text)',
                    }}>{processInline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{
                        padding: '2px 6px',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text-2)',
                      }}>{processInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }

        const line = block.content[0];
        const t = line.trim();
        if (!t) return <div key={bi} style={{ height: 6 }} />;
        if (/^---+$/.test(t))
          return <hr key={bi} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '6px 0' }} />;
        if (t.startsWith('### '))
          return <div key={bi} style={{ fontWeight: 600, fontSize: 11.5, marginTop: 6, color: accent }}>{processInline(t.slice(4))}</div>;
        if (t.startsWith('## '))
          return <div key={bi} style={{ fontWeight: 600, fontSize: 12, marginTop: 8, color: accent }}>{processInline(t.slice(3))}</div>;
        if (t.startsWith('- '))
          return (
            <div key={bi} style={{ paddingLeft: 10, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 1, color: accent || 'var(--text-3)' }}>·</span>
              {processInline(t.slice(2))}
            </div>
          );
        if (/^\d+\.\s/.test(t))
          return (
            <div key={bi} style={{ paddingLeft: 10, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: 'var(--text-3)', fontSize: '0.9em' }}>
                {t.match(/^(\d+\.)/)?.[1]}
              </span>
              <span style={{ paddingLeft: 6 }}>{processInline(t.replace(/^\d+\.\s*/, ''))}</span>
            </div>
          );
        // Quick-reply buttons
        const qrMatch = t.match(/^\[quick-reply:\s*(.+)\]$/);
        if (qrMatch) {
          const options = qrMatch[1].split('|').map(o => o.trim().replace(/^"(.*)"$/, '$1'));
          return (
            <div key={bi} style={{ display: 'flex', flexWrap: 'wrap', gap: 3, margin: '6px 0' }}>
              {options.map((opt, oi) => (
                <button
                  key={oi}
                  onClick={() => onQuickReply?.(opt)}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    padding: '4px 8px', borderRadius: 4, minWidth: 28, textAlign: 'center' as const,
                    border: `1px solid ${accent || 'var(--border)'}`,
                    background: 'transparent',
                    color: accent || 'var(--text)',
                    cursor: onQuickReply ? 'pointer' : 'default',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (onQuickReply) e.currentTarget.style.background = (accent || 'var(--text)') + '12'; }}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {opt}
                </button>
              ))}
            </div>
          );
        }
        return <div key={bi}>{processInline(t)}</div>;
      })}
    </div>
  );
}

function ThinkingAvatar({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: 5, flexShrink: 0,
      background: color + "16",
      border: `1.5px solid ${color}`,
      display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
      animation: "avatar-pulse 1.5s ease-in-out infinite",
      boxShadow: `0 0 6px ${color}30`,
    }}>
      {children}
    </div>
  );
}

function ThinkingBubble({ charName, color }: { charName: string; color: string }) {
  const TIcon = charIcon[charName] || BookOpen;
  return (
    <div className="chat-msg-row chat-msg-assistant">
      <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
        <ThinkingAvatar color={color}>
          <TIcon size={10} strokeWidth={1.5} style={{ color }} />
        </ThinkingAvatar>
        <div className="thinking-dots">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
      </div>
    </div>
  );
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "gc-chat";
const MODEL_CONTEXT: Record<string, number> = {
  haiku: 200_000, sonnet: 200_000, opus: 200_000,
};
const COMPRESS_THRESHOLD = 0.85; // auto-compress at 85%
const WARN_THRESHOLD = 0.70; // show warning at 70%

function estimateTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 3.5), 0);
}

function getContextLimit(model?: string): number {
  return MODEL_CONTEXT[model || 'sonnet'] || 200_000;
}

function genTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── ChatPanel (per-tab, fully isolated) ────────────────────────────────────

type ChatPanelProps = {
  tabId: string;
  characters: CharacterInfo[];
  charId: string;
  initialMessages: Message[];
  initialModel?: string;
  onMessagesChange: (msgs: Message[]) => void;
  onLoadingChange: (loading: boolean) => void;
  canSend: boolean;
  trigger: ChatTrigger;
  onTriggerConsumed: () => void;
};

function ChatPanel({
  tabId, characters, charId, initialMessages, initialModel,
  onMessagesChange, onLoadingChange, canSend,
  trigger, onTriggerConsumed,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeToolInput, setActiveToolInput] = useState<string>("");
  const [toolLog, setToolLog] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [pendingContext, setPendingContext] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const charDefault = characters.find(c => c.id === charId);
  const [modelOverride, setModelOverride] = useState<string>(initialModel || charDefault?.model || "sonnet");
  const bodyRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      const toCompress = messages.slice(0, -2); // keep last exchange
      const kept = messages.slice(-2);
      const historyText = toCompress.map(m =>
        `${m.role === 'user' ? 'User' : m.charName || 'Assistant'}: ${m.content}`
      ).join('\n\n');
      const res = await fetch('/api/inbox/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'summarize-text',
          text: historyText,
        }),
      });
      const data = await res.json();
      if (data.summary) {
        const compressedMsg: Message = {
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
  useEffect(() => {
    onMessagesChange(messages);
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync loading state
  useEffect(() => {
    onLoadingChange(isLoading);
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Elapsed timer while loading
  useEffect(() => {
    if (!isLoading) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [isLoading]);

  // Auto-scroll
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, isLoading, streamingText, toolLog]);

  // Handle trigger from wrapper
  useEffect(() => {
    if (!trigger || characters.length === 0) return;
    const { seedPrompt, context, model } = trigger;
    if (model) setModelOverride(model);
    setMessages([{ role: "user", content: seedPrompt }]);
    if (context) setPendingContext(context);
    onTriggerConsumed();
    sendMessage(seedPrompt, charId, context, undefined, model);
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Abort on unmount
  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  const sendMessage = async (msg: string, targetCharId?: string, context?: string | null, history?: Message[], modelOverride?: string) => {
    setIsLoading(true);
    setToolLog([]);
    let fullText = '';
    const cid = targetCharId || charId;
    const targetChar = characters.find(c => c.id === cid);
    const startTime = Date.now();

    const ctxToSend = context ?? pendingContext;
    if (pendingContext && !context) setPendingContext(null);

    const historyToSend = history && history.length > 0
      ? history.map(m => ({ role: m.role, content: m.content }))
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
          ...(modelOverride ? { model: modelOverride } : {}),
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
            if (eventMatch[1] === 'tool_result') {
              // Don't clear activeTool — keep showing last tool until next tool_call or text replaces it
              // Prevents flash where tool name appears and vanishes too fast to read
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
      // Ignore stale requests (StrictMode double-execution: first request aborted,
      // second request active — don't let stale catch overwrite active state)
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
    if (!input.trim() || isLoading || !activeChar || !canSend) return;
    const msg = input.trim();
    const currentMessages = [...messages];
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setInput("");
    const effectiveModel = modelOverride !== activeChar?.model ? modelOverride : undefined;
    sendMessage(msg, undefined, null, currentMessages, effectiveModel);
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    logAction({ widget: "chat", action: "stop", target: activeChar?.name || "unknown", character: activeChar?.id });
    // Immediately clear loading state so UI resets
    setStreamingText("");
    setActiveTool(null);
    setToolLog([]);
    setIsLoading(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const sendMsgToTana = async (text: string, charName?: string) => {
    try {
      await fetch('/api/tana-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${charName || 'Chat'} note`,
          content: text,
        }),
      });
    } catch {}
  };

  const sendToPostman = async (content: string) => {
    try {
      await fetch("/api/inbox/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "postman",
          emailId: "chat",
          account: "personal",
          from: activeChar?.name || "Chat",
          subject: content.slice(0, 80),
        }),
      });
      logAction({ widget: "chat", action: "send-to-postman", target: content.slice(0, 80), character: activeChar?.id });
    } catch {}
  };

  if (!activeChar) return null;

  return (
    <>
      <div ref={bodyRef} className="widget-body" style={{ padding: "14px" }}>
        {messages.length === 0 && !isLoading && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
              Start a conversation
            </span>
          </div>
        )}
        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div key={i} className="chat-msg-row chat-msg-user">
                <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                    background: "var(--text)" + "0a", border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
                    fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--text-2)",
                  }}>
                    K
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: "var(--text)",
                      borderLeft: "2px solid var(--text-3)",
                      padding: "2px 0 2px 6px",
                      wordBreak: "break-word" as const,
                    }}>
                      {processLinks(msg.content)}
                    </div>
                  </div>
                </div>
                <div className="chat-msg-actions" style={{ marginLeft: 29 }}>
                  <button className="item-action-btn" data-tip="Copy" onClick={() => copyToClipboard(msg.content)}>
                    <Copy size={10} strokeWidth={1.5} />
                  </button>
                  <button className="item-action-btn" data-tip="Send to Tana today" onClick={() => sendMsgToTana(msg.content)}>
                    <TanaIcon size={10} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            );
          }

          const msgChar = characters.find(c => c.name === msg.charName) || activeChar;
          const MIcon = charIcon[msgChar.name] || BookOpen;
          const { thinking, output } = splitMessage(msg.content);
          return (
            <div key={i} className="chat-msg-row chat-msg-assistant">
              <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                  background: msgChar.color + "16", border: `1px solid ${msgChar.color}28`,
                  display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
                }}>
                  <MIcon size={10} strokeWidth={1.5} style={{ color: msgChar.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {thinking && (
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-3)",
                      lineHeight: 1.5, marginBottom: 4, paddingLeft: 2,
                    }}>
                      {thinking}
                    </div>
                  )}
                  <div className="chat-bubble chat-bubble-assistant" style={{ borderLeftColor: msgChar.color + "40" }}>
                    <ChatMarkdown text={output} accent={msgChar.color} onQuickReply={(text) => {
                      if (!isLoading && canSend) {
                        const current = [...messages];
                        setMessages(prev => [...prev, { role: "user", content: text }]);
                        const effectiveModel = modelOverride !== activeChar?.model ? modelOverride : undefined;
                        sendMessage(text, undefined, null, current, effectiveModel);
                      }
                    }} />
                  </div>
                  {msg.duration != null && (
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)",
                      marginTop: 3, paddingLeft: 2, display: "flex", gap: 8,
                    }}>
                      <span>{msg.duration.toFixed(1)}s</span>
                      {msg.tokens != null && <span>{msg.tokens.toLocaleString()} tokens</span>}
                      {msgChar.defaultModel && <span>{msgChar.defaultModel}</span>}
                    </div>
                  )}
                </div>
              </div>
              <div className="chat-msg-actions" style={{ marginLeft: 29 }}>
                <button className="item-action-btn" data-tip="Copy" onClick={() => copyToClipboard(output)}>
                  <Copy size={10} strokeWidth={1.5} />
                </button>
                <button className="item-action-btn" data-tip="Send to Tana today" onClick={() => sendMsgToTana(output, msg.charName)}>
                  <TanaIcon size={10} strokeWidth={1.5} />
                </button>
                <button className="item-action-btn" data-tip="Send to Postman" onClick={() => sendToPostman(output)} style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, width: "auto",
                  padding: "0 5px", display: "flex", alignItems: "center", gap: 3,
                }}>
                  <CornerUpRight size={9} strokeWidth={1.5} /> Postman
                </button>
              </div>
            </div>
          );
        })}
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
                  {(activeTool || (!streamingText && toolLog.length > 0)) && (
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)",
                      marginTop: streamingText ? 4 : 0, paddingLeft: 2,
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <Loader2 size={10} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite", color: activeChar.color, opacity: 0.7 }} />
                      {(() => {
                        if (!activeTool) return <span>Working...</span>;
                        const info = parseToolName(activeTool);
                        const ToolIcon = resolveIcon(info.iconName);
                        const label = activeToolInput ? toolInputLabel(activeTool, activeToolInput) : "";
                        return (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, minWidth: 0 }}>
                            <ToolIcon size={10} strokeWidth={1.5} style={{ flexShrink: 0, color: activeChar.color, opacity: 0.6 }} />
                            <span>{info.displayName}</span>
                            {label && <span style={{ opacity: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>}
                          </span>
                        );
                      })()}
                      {toolLog.length > 1 && (
                        <span style={{ opacity: 0.4 }}>{toolLog.length} steps</span>
                      )}
                      {elapsed > 0 && (
                        <span style={{ opacity: 0.35 }}>{elapsed}s</span>
                      )}
                    </div>
                  )}
                  {!streamingText && !activeTool && toolLog.length === 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="thinking-dots">
                        <span className="thinking-dot" />
                        <span className="thinking-dot" />
                        <span className="thinking-dot" />
                      </div>
                      {elapsed > 2 && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", opacity: 0.5 }}>{elapsed}s</span>
                      )}
                    </div>
                  )}
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
              background: contextPct >= COMPRESS_THRESHOLD ? "#dc2626" : "#d97706",
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
      <div className="widget-footer" style={{ padding: "10px 12px", gap: 8, alignItems: "flex-end" }}>
        <textarea
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder={
            isLoading
              ? activeTool
                ? `${activeChar.name}: ${parseToolName(activeTool).displayName}${activeToolInput ? ` ${toolInputLabel(activeTool, activeToolInput)}` : ""}...`
                : toolLog.length > 0
                  ? `${activeChar.name}: working (${toolLog.length} steps, ${elapsed}s)...`
                  : `${activeChar.name} is thinking...`
            : !canSend ? "2 chats running — wait or stop one"
            : `Ask ${activeChar.name}...`
          }
          rows={1}
          disabled={isLoading || !canSend}
        />
        <button
          onClick={() => {
            const models = ["haiku", "sonnet", "opus"];
            const idx = models.indexOf(modelOverride);
            setModelOverride(models[(idx + 1) % models.length]);
          }}
          data-tip={`Model: ${modelOverride}${modelOverride === activeChar?.model ? " (default)" : " (override)"} — click to cycle`}
          style={{
            fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.04em",
            padding: 0, cursor: "pointer", flexShrink: 0, alignSelf: "center",
            border: "none", background: "transparent",
            color: modelOverride !== activeChar?.model
              ? activeChar?.color || "var(--text)"
              : "var(--text-3)",
            opacity: modelOverride !== activeChar?.model ? 1 : 0.5,
            transition: "all 0.12s",
          }}
        >
          {modelOverride}
        </button>
        {isLoading ? (
          <button
            onClick={handleStop}
            data-tip="Stop"
            style={{
              width: 30, height: 30, borderRadius: 5, cursor: "pointer", flexShrink: 0,
              background: "#dc262618", border: "1px solid #dc262630",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.12s",
            }}
          >
            <Square size={10} strokeWidth={2} style={{ color: "#dc2626", fill: "#dc2626" }} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            data-tip={!canSend ? "2 chats already running" : undefined}
            style={{
              width: 30, height: 30, borderRadius: 5, flexShrink: 0,
              cursor: canSend ? "pointer" : "default",
              background: activeChar.color + "18", border: `1px solid ${activeChar.color}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.12s",
              opacity: canSend ? 1 : 0.4,
            }}
          >
            <Send size={12} strokeWidth={1.5} style={{ color: activeChar.color }} />
          </button>
        )}
      </div>
    </>
  );
}

// ─── ChatWidget (wrapper — tab management) ──────────────────────────────────

export default function ChatWidget() {
  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [tabs, setTabs] = useState<TabMeta[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [loadingTabIds, setLoadingTabIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [showNewTabPicker, setShowNewTabPicker] = useState(false);
  const [pendingTrigger, setPendingTrigger] = useState<{ tabId: string; trigger: NonNullable<ChatTrigger> } | null>(null);
  const newTabRef = useRef<HTMLDivElement>(null);
  const { trigger, setTrigger } = useChatTrigger();

  // ── Hydrate from localStorage ─────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.tabs) {
          // New multi-tab format
          const savedTabs: TabMeta[] = (data.tabs || []).filter(
            (t: TabMeta) => t.messages?.length > 0
          );
          if (savedTabs.length > 0) {
            setTabs(savedTabs);
            setActiveTabId(
              savedTabs.some((t: TabMeta) => t.id === data.activeTabId)
                ? data.activeTabId
                : savedTabs[0].id
            );
          }
        } else if (data.messages?.length > 0 && data.activeCharId) {
          // Migrate from old single-chat format
          const tab: TabMeta = { id: genTabId(), charId: data.activeCharId, messages: data.messages };
          setTabs([tab]);
          setActiveTabId(tab.id);
        }
      }
    } catch {}
    setHydrated(true);
  }, []);

  // ── Persist to localStorage ───────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }));
    } catch {}
  }, [tabs, activeTabId, hydrated]);

  // ── Load characters ───────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/characters")
      .then(r => r.json())
      .then(d => setCharacters(d.characters as CharacterInfo[]))
      .catch(() => {});
  }, []);

  // ── Create default tab if none restored ───────────────────────────────
  useEffect(() => {
    if (characters.length === 0 || tabs.length > 0 || !hydrated) return;
    const postman = characters.find(c => c.name === "Postman");
    const charId = postman?.id || characters[0]?.id || "";
    if (!charId) return;
    const tab: TabMeta = { id: genTabId(), charId, messages: [] };
    setTabs([tab]);
    setActiveTabId(tab.id);
  }, [characters, hydrated, tabs.length]);

  // ── Close picker on outside click ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (newTabRef.current && !newTabRef.current.contains(e.target as Node))
        setShowNewTabPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Handle trigger from other widgets ─────────────────────────────────
  useEffect(() => {
    if (!trigger || characters.length === 0) return;
    const { charName, seedPrompt, action } = trigger;
    const char = characters.find(c => c.name === charName);
    if (!char) { setTrigger(null); return; }

    const newTab: TabMeta = { id: genTabId(), charId: char.id, messages: [], modelOverride: trigger.model };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);

    // openOnly = just open the tab, don't send a seed message
    if (!trigger.openOnly) {
      setPendingTrigger({ tabId: newTab.id, trigger });
    }

    logAction({
      widget: "chat",
      action: `trigger:${action}`,
      target: seedPrompt.slice(0, 60) || charName,
      character: charName,
    });

    setTrigger(null);
  }, [trigger, characters]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tab operations ────────────────────────────────────────────────────

  const createTab = useCallback((charId: string) => {
    const tab: TabMeta = { id: genTabId(), charId, messages: [] };
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
    setShowNewTabPicker(false);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(t => t.id === tabId);
      const next = prev.filter(t => t.id !== tabId);
      if (tabId === activeTabId) {
        const newActive = next[Math.min(idx, next.length - 1)];
        if (newActive) setActiveTabId(newActive.id);
      }
      return next;
    });
    setLoadingTabIds(prev => prev.filter(id => id !== tabId));
  }, [activeTabId]);

  const formatChat = useCallback((msgs: Message[]) => {
    return msgs.map(m => {
      const sender = m.role === 'user' ? '**You**' : `**${m.charName || 'Assistant'}**`;
      return `${sender}\n${m.content}`;
    }).join('\n\n---\n\n');
  }, []);

  const copyAllChat = useCallback(() => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.messages.length === 0) return;
    navigator.clipboard.writeText(formatChat(tab.messages)).catch(() => {});
  }, [tabs, activeTabId, formatChat]);

  const sendAllToTana = useCallback(async () => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.messages.length === 0) return;
    const char = characters.find(c => c.id === tab.charId);
    const title = `Chat with ${char?.name || 'Assistant'}`;
    const content = formatChat(tab.messages);
    try {
      await fetch('/api/tana-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });
    } catch {}
  }, [tabs, activeTabId, characters, formatChat]);

  const sendToArchitect = useCallback(() => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.messages.length === 0) return;
    const architect = characters.find(c => c.name === "Architect");
    if (!architect) return;
    const chatContent = formatChat(tab.messages);
    const newTab: TabMeta = { id: genTabId(), charId: architect.id, messages: [] };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setPendingTrigger({
      tabId: newTab.id,
      trigger: {
        charName: "Architect",
        seedPrompt: "Review this conversation and help me address any issues or errors.",
        context: chatContent,
        action: "forward-to-architect",
      },
    });
  }, [tabs, activeTabId, characters, formatChat]);

  const clearAllChats = useCallback(() => {
    const tab = tabs.find(t => t.id === activeTabId);
    const charId = tab?.charId || (characters[0]?.id ?? "");
    const newId = genTabId();
    setTabs([{ id: newId, charId, messages: [] }]);
    setLoadingTabIds([]);
    setActiveTabId(newId);
  }, [tabs, activeTabId, characters]);

  const handleMessagesChange = useCallback((tabId: string, msgs: Message[]) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, messages: msgs } : t));
  }, []);

  const handleLoadingChange = useCallback((tabId: string, loading: boolean) => {
    setLoadingTabIds(prev => {
      if (loading) return prev.includes(tabId) ? prev : [...prev, tabId];
      return prev.filter(id => id !== tabId);
    });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────

  const canSend = loadingTabIds.length < 2;

  if (characters.length === 0 || tabs.length === 0) {
    return <div className="widget" style={{ height: "100%" }} />;
  }

  return (
    <div className="widget" style={{ position: "relative", height: "100%", overflow: "visible" }}>
      {/* Header */}
      <div className="widget-header">
        <span className="widget-header-label">Chat</span>
        <div style={{ display: "flex", gap: 2 }}>
          <button className="widget-toolbar-btn" data-tip="Send to Tana today" onClick={sendAllToTana}>
            <TanaIcon size={12} strokeWidth={1.5} />
          </button>
          <button className="widget-toolbar-btn" data-tip="Send to Architect" onClick={sendToArchitect}>
            <Bug size={12} strokeWidth={1.5} />
          </button>
          <button className="widget-toolbar-btn" data-tip="Copy all" onClick={copyAllChat}>
            <Copy size={12} strokeWidth={1.5} />
          </button>
          <button className="widget-toolbar-btn" data-tip="Clear all chats" onClick={clearAllChats}>
            <Trash2 size={12} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 2,
        padding: "0 10px", height: 28, minHeight: 28,
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          const tabIsLoading = loadingTabIds.includes(tab.id);
          const char = characters.find(c => c.id === tab.charId);
          if (!char) return null;
          const TIcon = charIcon[char.name] || BookOpen;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 6px", border: "none", borderRadius: 4,
                cursor: "pointer", flexShrink: 0,
                background: isActive ? char.color + "15" : "transparent",
                fontFamily: "var(--font-mono)", fontSize: 9,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? char.color : "var(--text-3)",
                transition: "background 0.1s",
              }}
            >
              <TIcon size={10} strokeWidth={1.5} style={{ color: isActive ? char.color : "var(--text-3)" }} />
              <span>{char.name}</span>
              {tabIsLoading && (
                <Loader2 size={7} strokeWidth={2} style={{
                  color: char.color, flexShrink: 0,
                  animation: "spin 1s linear infinite",
                }} />
              )}
              {tabs.length > 1 && (
                <span
                  onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                  style={{
                    width: 12, height: 12, borderRadius: 2,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: "var(--text-3)",
                    opacity: isActive ? 0.6 : 0.3,
                    marginLeft: 1,
                  }}
                >
                  <X size={8} strokeWidth={2} />
                </span>
              )}
            </button>
          );
        })}

        {/* New tab button */}
        <div ref={newTabRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setShowNewTabPicker(v => !v)}
            style={{
              width: 18, height: 18, borderRadius: 3,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid var(--border)", background: "transparent",
              cursor: "pointer", color: "var(--text-3)",
            }}
          >
            <Plus size={9} strokeWidth={2} />
          </button>
          {showNewTabPicker && (
            <div style={{
              position: "absolute", top: 22, left: 0, zIndex: 100,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
              minWidth: 156, overflow: "hidden",
            }}>
              {characters.map(c => {
                const CIcon = charIcon[c.name] || BookOpen;
                return (
                  <button
                    key={c.id}
                    onClick={() => createTab(c.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "6px 12px", border: "none", cursor: "pointer",
                      textAlign: "left", background: "transparent",
                    }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                      background: c.color + "16", border: `1px solid ${c.color}28`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <CIcon size={11} strokeWidth={1.5} style={{ color: c.color }} />
                    </div>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 11,
                      color: "var(--text)",
                    }}>
                      {c.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Chat panels — active visible, loading hidden, idle unmounted */}
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;
        const tabIsLoading = loadingTabIds.includes(tab.id);
        const shouldMount = isActive || tabIsLoading;
        if (!shouldMount) return null;
        return (
          <div
            key={tab.id}
            style={{ display: isActive ? "contents" : "none" }}
          >
            <ChatPanel
              tabId={tab.id}
              characters={characters}
              charId={tab.charId}
              initialMessages={tab.messages}
              initialModel={tab.modelOverride}
              onMessagesChange={msgs => handleMessagesChange(tab.id, msgs)}
              onLoadingChange={loading => handleLoadingChange(tab.id, loading)}
              canSend={canSend}
              trigger={pendingTrigger?.tabId === tab.id ? pendingTrigger.trigger : null}
              onTriggerConsumed={() => setPendingTrigger(null)}
            />
          </div>
        );
      })}
    </div>
  );
}
