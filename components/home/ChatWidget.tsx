"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { charIcon } from "@/lib/char-icons";
import { useChatTrigger, type ChatTrigger } from "@/lib/chat-store";
import { useCharacters } from "@/lib/shared-data";
import { logAction } from "@/lib/action-log";
import TanaIcon from "@/components/icons/TanaIcon";
import { parseToolName } from "@/lib/mcp-icons";
import { resolveIcon } from "@/lib/icon-map";
import {
  BookOpen, Check, Copy, CornerUpRight, Flag, GripHorizontal, Hammer, Layers, Loader2,
  MessageSquare, Send, Square, Trash2, Plus, X, Maximize2, Minimize2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type CharacterInfo = {
  id: string;
  name: string;
  color: string;
  defaultModel?: string;
  model?: string;
  suggestions?: string[];
};

type Message = {
  role: "user" | "assistant";
  content: string;
  images?: string[]; // base64 data URLs, for user messages with pasted images
  charName?: string;
  duration?: number;
  tokens?: number;
};

type TabMeta = {
  id: string;
  charId: string;
  messages: Message[];
  modelOverride?: string;
  label?: string;
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

const NARRATION_RE = /^(let me|i('ll| will)|now i|first,?\s+i|reading|searching|checking|fetching|looking|scanning|found|processing|done\.|done!)/i;

function splitMessage(text: string): { thinking: string; output: string } {
  const lines = text.split('\n');
  let splitIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (
      t.startsWith('##') ||
      /^---+$/.test(t) ||
      /^[✅🔴🟠🟡🟢❌⚠️☑️✓]/.test(t) ||
      /^\*\*(Status|Summary|Results|Action|Distribution|Routing)/.test(t)
    ) {
      splitIdx = i;
      break;
    }
  }
  if (splitIdx === -1) return { thinking: '', output: text };

  // Only treat pre-split content as thinking if it looks like step-narration.
  // If it's real content (paragraphs, sentences without narration markers), keep it in output.
  const preLines = lines.slice(0, splitIdx).filter(l => l.trim());
  const hasNarration = preLines.some(l => NARRATION_RE.test(l.trim()));
  if (!hasNarration) return { thinking: '', output: text };

  // If a quick-reply block appears before the split, move the split there so it renders as buttons
  for (let j = 0; j < splitIdx; j++) {
    if (/^\[quick-reply:/i.test(lines[j].trim())) {
      splitIdx = j;
      break;
    }
  }
  const thinking = lines.slice(0, splitIdx).join('\n').trim();
  const output = lines.slice(splitIdx).join('\n').trim();
  return { thinking, output };
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

function FormBlock({
  questions,
  submitLabel,
  accent,
  onSubmit,
}: {
  questions: { label: string; options: string[]; freeText: boolean }[];
  submitLabel: string;
  accent?: string;
  onSubmit?: (text: string) => void;
}) {
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const allAnswered = questions.every((q, i) => q.freeText ? !!selected[i]?.trim() : selected[i] !== undefined);
  const c = accent || 'var(--text)';
  return (
    <div style={{ margin: '6px 0' }}>
      {questions.map((q, qi) => (
        <div key={qi} style={{ marginBottom: 8 }}>
          <div style={{
            fontSize: 10, fontStyle: 'italic', color: c,
            marginBottom: 4, fontFamily: 'var(--font-mono)',
          }}>
            {qi + 1}. {q.label}
          </div>
          {q.freeText ? (
            <textarea
              disabled={submitted}
              value={selected[qi] || ''}
              onChange={e => setSelected(s => ({ ...s, [qi]: e.target.value }))}
              placeholder="type your answer..."
              rows={2}
              style={{
                width: '100%', fontFamily: 'var(--font-mono)', fontSize: 10,
                background: 'var(--surface)', border: `1px solid ${c}40`,
                borderRadius: 4, padding: '4px 8px', color: c,
                outline: 'none', resize: 'vertical', lineHeight: 1.5,
                boxSizing: 'border-box' as const,
                opacity: submitted ? 0.5 : 1,
              }}
            />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {q.options.map((opt, oi) => (
                <button
                  key={oi}
                  disabled={submitted}
                  onClick={() => !submitted && setSelected(s => ({ ...s, [qi]: opt }))}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    padding: '4px 8px', borderRadius: 4, minWidth: 28, textAlign: 'center' as const,
                    border: `1px solid ${selected[qi] === opt ? c : c + '40'}`,
                    background: selected[qi] === opt ? c + '18' : 'transparent',
                    color: selected[qi] === opt ? c : c + 'aa',
                    cursor: submitted ? 'default' : 'pointer',
                    transition: 'background 0.12s, border-color 0.12s',
                    fontWeight: selected[qi] === opt ? 600 : 400,
                    opacity: submitted && selected[qi] !== opt ? 0.3 : 1,
                  }}
                  onMouseEnter={e => { if (!submitted && selected[qi] !== opt) e.currentTarget.style.background = c + '0a'; }}
                  onMouseLeave={e => { if (selected[qi] !== opt) e.currentTarget.style.background = 'transparent'; }}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        disabled={!allAnswered || submitted}
        onClick={() => {
          if (!allAnswered || submitted) return;
          setSubmitted(true);
          const text = questions.map((q, i) => `${q.label.replace(/[?:]+$/, '').trim()}: ${selected[i]}`).join(', ');
          onSubmit?.(text);
        }}
        style={{
          marginTop: 4,
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          padding: '4px 12px', borderRadius: 4,
          border: `1px solid ${allAnswered && !submitted ? c : c + '30'}`,
          background: allAnswered && !submitted ? c + '18' : 'transparent',
          color: allAnswered && !submitted ? c : c + '40',
          cursor: allAnswered && !submitted ? 'pointer' : 'default',
          transition: 'background 0.12s, border-color 0.12s',
        }}
      >
        {submitted ? 'Submitted' : submitLabel}
      </button>
    </div>
  );
}

function ChatMarkdown({ text, accent, onQuickReply }: { text: string; accent?: string; onQuickReply?: (text: string) => void }) {
  const processInline = (s: string): React.ReactNode[] => {
    const parts = s.split(/(==[^=]+=+=|==\S[^=]*\S==|\*\*[^*]+\*\*|~~[^~\n]+~~|`[^`]+`|_[^_\n]+_|\[[^\]]+\]\((?:tana|gmail):[^)]+\))/g);
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
      if (p.startsWith('~~') && p.endsWith('~~')) {
        nodes.push(<s key={j} style={{ color: 'var(--text-3)', textDecoration: 'line-through' }}>{p.slice(2, -2)}</s>);
        return;
      }
      if (p.startsWith('_') && p.endsWith('_')) {
        nodes.push(<em key={j} style={{ fontStyle: 'italic', color: 'var(--text-2)' }}>{p.slice(1, -1)}</em>);
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
  const blocks: { type: 'line' | 'table' | 'form'; content: string[] }[] = [];
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
    } else if (/^\[form(\s|:|])/i.test(t)) {
      const formLines: string[] = [t];
      i++;
      while (i < lines.length && !/^\[\/form\]/i.test(lines[i].trim())) {
        formLines.push(lines[i].trim());
        i++;
      }
      if (i < lines.length) i++; // consume [/form]
      blocks.push({ type: 'form', content: formLines });
    } else {
      blocks.push({ type: 'line', content: [lines[i]] });
      i++;
    }
  }

  return (
    <div>
      {blocks.map((block, bi) => {
        if (block.type === 'form') {
          const headerLine = block.content[0];
          const submitLabel = headerLine.match(/"([^"]+)"/)?.[1] || 'Submit';
          const questions = block.content.slice(1).map(line => {
            const parts = line.split('::');
            const label = parts[0].trim();
            const options = (parts[1] || '').split('|').map(o => o.trim()).filter(Boolean);
            return { label, options, freeText: options.length === 0 };
          }).filter(q => q.label);
          if (questions.length === 0) return null;
          return (
            <FormBlock
              key={bi}
              questions={questions}
              submitLabel={submitLabel}
              accent={accent}
              onSubmit={onQuickReply}
            />
          );
        }
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
        if (t.startsWith('> '))
          return (
            <div key={bi} style={{
              borderLeft: `2px solid ${accent || 'var(--border)'}`,
              paddingLeft: 8, margin: '2px 0',
              color: 'var(--text-2)', fontStyle: 'italic',
            }}>
              {processInline(t.slice(2))}
            </div>
          );
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
  isActive: boolean;
};

function ChatPanel({
  tabId, characters, charId, initialMessages, initialModel,
  onMessagesChange, onLoadingChange, canSend,
  trigger, onTriggerConsumed, isActive,
}: ChatPanelProps) {
  const { setTrigger: setCharTrigger } = useChatTrigger();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
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
  const [inputHeight, setInputHeight] = useState(34);
  const [skillPicker, setSkillPicker] = useState(false);
  const [skillList, setSkillList] = useState<{ name: string; description: string; character?: string }[]>([]);
  const [skillFilter, setSkillFilter] = useState("");
  const messagesRef = useRef<Message[]>(messages);
  const charDefault = characters.find(c => c.id === charId);
  const [modelOverride, setModelOverride] = useState<string>(initialModel || charDefault?.model || "sonnet");
  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const triggerFiredRef = useRef<ChatTrigger>(null);

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

  // Keep messagesRef in sync
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Pre-fetch skill list for slash command detection
  useEffect(() => {
    fetch("/api/system/skills").then(r => r.json()).then(d => setSkillList(d.skills || [])).catch(() => {});
  }, []);

  // Auto-scroll — only if user is near the bottom (prevents jumping while reading up)
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 120) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isLoading, streamingText, toolLog]);

  // Scroll to bottom when tab becomes visible
  useEffect(() => {
    if (!isActive) return;
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
  }, [isActive]);

  // Handle trigger from wrapper
  useEffect(() => {
    if (!trigger || characters.length === 0) return;
    if (trigger === triggerFiredRef.current) return; // dedup: same trigger object already fired
    triggerFiredRef.current = trigger;
    const { seedPrompt, context, model } = trigger;
    if (model) setModelOverride(model);
    setMessages([{ role: "user", content: seedPrompt }]);
    if (context) setPendingContext(context);
    onTriggerConsumed();
    sendMessage(seedPrompt, charId, context, undefined, model);
    // No cleanup reset: resetting would allow StrictMode's simulated remount to re-fire and double-spawn
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Abort on real unmount (not StrictMode's simulated unmount)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      // Delay abort slightly so StrictMode's simulated unmount doesn't kill in-flight triggered requests
      const ctrl = abortRef.current;
      mountedRef.current = false;
      setTimeout(() => {
        if (!mountedRef.current && ctrl) ctrl.abort();
      }, 50);
    };
  }, []);

  const sendMessage = async (msg: string, targetCharId?: string, context?: string | null, history?: Message[], modelOverride?: string, images?: Array<{mediaType: string; data: string}>, skill?: string) => {
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
          ...(modelOverride ? { model: modelOverride } : {}),
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

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (dataUrl) setPastedImages(prev => [...prev, dataUrl]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSend = () => {
    if ((!input.trim() && pastedImages.length === 0) || !activeChar || !canSend) return;
    const msg = input.trim();

    // Queue if AI is already working
    if (isLoading) {
      if (msg) {
        setMessageQueue(prev => [...prev, msg]);
        setInput("");
        setPastedImages([]);
      }
      return;
    }

    // Extract /skill prefix if present
    let actualMsg = msg;
    let slashSkill: string | undefined;
    const slashMatch = msg.match(/^\/([a-z0-9-]+)\s*([\s\S]*)/);
    if (slashMatch) {
      const candidate = slashMatch[1];
      // Only treat as skill if it matches a known skill (check against fetched list)
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
    setSkillPicker(false);
    const effectiveModel = modelOverride !== activeChar?.model ? modelOverride : undefined;
    sendMessage(actualMsg || "(image)", undefined, null, currentMessages, effectiveModel, apiImages.length > 0 ? apiImages : undefined, slashSkill);
  };

  const handleChipClick = (suggestion: string) => {
    if (isLoading || !activeChar || !canSend) return;
    const currentMessages = [...messages];
    logAction({ widget: "chat", action: "chat-first-message", target: suggestion.slice(0, 80), character: activeChar.id, detail: suggestion });
    setMessages(prev => [...prev, { role: "user", content: suggestion }]);
    const effectiveModel = modelOverride !== activeChar?.model ? modelOverride : undefined;
    sendMessage(suggestion, undefined, null, currentMessages, effectiveModel);
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
    setMessageQueue([]);
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

  const deleteMessage = (index: number) => {
    setMessages(prev => prev.filter((_, i) => i !== index));
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
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      padding: "3px 8px",
                      border: `1px solid ${activeChar.color}50`,
                      borderRadius: 3,
                      background: "transparent",
                      color: activeChar.color,
                      cursor: "pointer",
                      lineHeight: 1.5,
                      transition: "background 0.1s, border-color 0.1s",
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
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: "var(--text)",
                      borderLeft: "2px solid var(--text-3)",
                      padding: "2px 0 2px 6px",
                      wordBreak: "break-word" as const,
                    }}>
                      {msg.content !== "(image)" && processLinks(msg.content)}
                      {msg.images && msg.images.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: msg.content && msg.content !== "(image)" ? 6 : 2 }}>
                          {msg.images.map((img, idx) => (
                            <img key={idx} src={img} style={{ maxWidth: 200, maxHeight: 150, borderRadius: 4, border: "1px solid var(--border)" }} />
                          ))}
                        </div>
                      )}
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
                  <button className="item-action-btn" data-tip="Delete message" onClick={() => deleteMessage(i)} style={{ color: "var(--text-3)" }}>
                    <Trash2 size={10} strokeWidth={1.5} />
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
                        // Check if quick-reply is an explicit navigation intent → open new tab with context
                        // Only switch if text starts with a navigation phrase like "Open in X", "Switch to X", "Ask X"
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
                <button className="item-action-btn" data-tip="Delete message" onClick={() => deleteMessage(i)} style={{ color: "var(--text-3)" }}>
                  <Trash2 size={10} strokeWidth={1.5} />
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
      {pastedImages.length > 0 && (
        <div style={{ padding: "6px 12px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {pastedImages.map((img, idx) => (
            <div key={idx} style={{ position: "relative" }}>
              <img src={img} style={{ height: 56, maxWidth: 100, borderRadius: 4, border: "1px solid var(--border)", objectFit: "cover", display: "block" }} />
              <button
                onClick={() => setPastedImages(prev => prev.filter((_, i) => i !== idx))}
                style={{
                  position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: "50%",
                  background: "var(--bg-2)", border: "1px solid var(--border)",
                  cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={8} strokeWidth={2} style={{ color: "var(--text-2)" }} />
              </button>
            </div>
          ))}
        </div>
      )}
      {messageQueue.length > 0 && (
        <div style={{ padding: "4px 12px 0", display: "flex", gap: 4, flexWrap: "wrap" }}>
          {messageQueue.map((qm, idx) => (
            <div key={idx} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "var(--bg-2)", borderRadius: 3, padding: "2px 6px",
              fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)",
              maxWidth: 240,
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                queued: {qm.length > 40 ? qm.slice(0, 40) + "..." : qm}
              </span>
              <button
                onClick={() => setMessageQueue(prev => prev.filter((_, i) => i !== idx))}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  padding: 0, display: "flex", alignItems: "center", flexShrink: 0,
                }}
              >
                <X size={8} strokeWidth={2} style={{ color: "var(--text-3)" }} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="widget-footer" style={{ padding: "10px 12px", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column" }}>
          <div
            onMouseDown={e => {
              e.preventDefault();
              const startY = e.clientY;
              const startH = inputHeight;
              const onMove = (ev: MouseEvent) => {
                const delta = startY - ev.clientY;
                setInputHeight(Math.max(34, Math.min(240, startH + delta)));
              };
              const onUp = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
              };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}
            style={{
              height: 6, cursor: "ns-resize",
              display: "flex", alignItems: "center", justifyContent: "flex-end",
              paddingRight: 4, flexShrink: 0,
            }}
          >
            <GripHorizontal size={8} strokeWidth={1.5} style={{ color: "var(--text-3)", opacity: 0.4 }} />
          </div>
          {skillPicker && (() => {
            const filtered = skillList.filter(s =>
              !skillFilter || s.name.includes(skillFilter) || (s.description || "").toLowerCase().includes(skillFilter)
            );
            return (
              <div style={{
                position: "absolute", bottom: "100%", left: 0, right: 0,
                maxHeight: 220, overflowY: "auto", zIndex: 20,
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 6, boxShadow: "0 -4px 16px rgba(0,0,0,0.3)",
                marginBottom: 2,
              }}>
                {filtered.length === 0 && (
                  <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
                    {skillList.length === 0 ? "Loading skills..." : "No matching skills"}
                  </div>
                )}
                {filtered.map(s => (
                  <div
                    key={s.name}
                    onClick={() => {
                      setInput(`/${s.name} `);
                      setSkillPicker(false);
                      textareaRef.current?.focus();
                    }}
                    style={{
                      padding: "6px 12px", cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                      transition: "background 0.08s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--text)" }}>
                        /{s.name}
                      </span>
                      {s.character && (
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-3)",
                          background: "var(--bg-2)", padding: "1px 5px", borderRadius: 3,
                        }}>
                          {s.character}
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-3)",
                      marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {s.description}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={e => {
              const v = e.target.value;
              setInput(v);
              if (v === "/") {
                setSkillPicker(true);
                setSkillFilter("");
                if (skillList.length === 0) {
                  fetch("/api/system/skills").then(r => r.json()).then(d => setSkillList(d.skills || [])).catch(() => {});
                }
              } else if (v.startsWith("/") && skillPicker) {
                setSkillFilter(v.slice(1).toLowerCase());
              } else if (!v.startsWith("/")) {
                setSkillPicker(false);
              }
            }}
            onPaste={handlePaste}
            onKeyDown={e => {
              if (skillPicker) {
                if (e.key === "Escape") { e.preventDefault(); setSkillPicker(false); setInput(""); return; }
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); return; } // handled by picker
              }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder={
              isLoading
                ? activeTool
                  ? `${activeChar.name}: ${parseToolName(activeTool).displayName}${activeToolInput ? ` ${toolInputLabel(activeTool, activeToolInput)}` : ""}...`
                  : toolLog.length > 0
                    ? `${activeChar.name}: working (${toolLog.length} steps, ${elapsed}s)...`
                    : `${activeChar.name} is thinking...`
              : !canSend ? "4 chats running — wait or stop one"
              : `Ask ${activeChar.name}... (type / for skills)`
            }
            rows={1}
            disabled={!canSend}
            style={{ height: inputHeight, resize: "none", flex: "none" }}
          />
        </div>
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
            data-tip={!canSend ? "4 chats already running" : undefined}
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
  const [fullscreen, setFullscreen] = useState(false);

  // Escape exits fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen]);
  const [loadingTabIds, setLoadingTabIds] = useState<string[]>([]);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [showNewTabPicker, setShowNewTabPicker] = useState(false);
  const [showEngineerInput, setShowEngineerInput] = useState(false);
  const [engineerInputValue, setEngineerInputValue] = useState("");
  const engineerInputRef = useRef<HTMLTextAreaElement>(null);
  const [showArchitectInput, setShowArchitectInput] = useState(false);
  const [architectInputValue, setArchitectInputValue] = useState("");
  const architectInputRef = useRef<HTMLTextAreaElement>(null);
  const [pendingTrigger, setPendingTrigger] = useState<{ tabId: string; trigger: NonNullable<ChatTrigger> } | null>(null);
  const newTabRef = useRef<HTMLDivElement>(null);
  const triggerHandledRef = useRef<ChatTrigger>(null);
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

  // ── Load characters from shared context ──────────────────────────────
  const sharedChars = useCharacters();
  useEffect(() => {
    if (sharedChars.length > 0) setCharacters(sharedChars as CharacterInfo[]);
  }, [sharedChars]);

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
    if (trigger === triggerHandledRef.current) return; // dedup: guard against re-fire if characters changes while trigger is set
    triggerHandledRef.current = trigger;
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

  const sendToEngineer = useCallback((extraContext?: string) => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.messages.length === 0) return;
    const engineer = characters.find(c => c.name === "Engineer");
    if (!engineer) return;
    const chatContent = formatChat(tab.messages);
    const baseSeed = "Review this conversation for code-level issues. Diagnose bugs, fix broken implementations, resolve errors, and implement requested changes. Focus on the technical problem, not system architecture.";
    const seed = extraContext ? `${baseSeed}\n\nContext: ${extraContext}` : baseSeed;
    const newTab: TabMeta = { id: genTabId(), charId: engineer.id, messages: [] };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setShowEngineerInput(false);
    setEngineerInputValue("");
    setPendingTrigger({
      tabId: newTab.id,
      trigger: {
        charName: "Engineer",
        seedPrompt: seed,
        context: chatContent,
        action: "forward-to-engineer",
      },
    });
  }, [tabs, activeTabId, characters, formatChat]);

  const sendToArchitect = useCallback((extraContext?: string) => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.messages.length === 0) return;
    const architect = characters.find(c => c.name === "Architect");
    if (!architect) return;
    const chatContent = formatChat(tab.messages);
    const baseSeed = "Review this conversation for system-level issues. Broken skills, wrong routing, missing tools, character misbehavior, prompt failures, schema problems. Diagnose what went wrong at the system/architecture level.";
    const seed = extraContext ? `${baseSeed}\n\nContext: ${extraContext}` : baseSeed;
    const newTab: TabMeta = { id: genTabId(), charId: architect.id, messages: [] };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setShowArchitectInput(false);
    setArchitectInputValue("");
    setPendingTrigger({
      tabId: newTab.id,
      trigger: {
        charName: "Architect",
        seedPrompt: seed,
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

  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState(false);

  const flagConversation = useCallback(async () => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.messages.length === 0) return;
    const char = characters.find(c => c.id === tab.charId);
    setFlagging(true);
    try {
      await fetch("/api/flag-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character: char?.name ?? "Unknown",
          tabLabel: tab.label || char?.name || "Chat",
          messages: tab.messages.map(m => ({ role: m.role, content: m.content.slice(0, 4000) })),
        }),
      });
      logAction({ widget: "chat", action: "flag", target: tab.label || char?.name || "Chat", character: char?.name });
      setFlagged(true);
      setTimeout(() => setFlagged(false), 2000);
    } catch { /* non-fatal */ }
    setFlagging(false);
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

  const startRename = useCallback((tabId: string, currentLabel: string) => {
    setRenamingTabId(tabId);
    setRenameValue(currentLabel);
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingTabId) return;
    const val = renameValue.trim();
    setTabs(prev => prev.map(t => t.id === renamingTabId ? { ...t, label: val || undefined } : t));
    setRenamingTabId(null);
    setRenameValue("");
  }, [renamingTabId, renameValue]);

  // ── Render ────────────────────────────────────────────────────────────

  const canSend = loadingTabIds.length < 4;

  if (characters.length === 0 || tabs.length === 0) {
    return <div className="widget" style={{ height: "100%" }} />;
  }

  return (
    <div className="widget" style={fullscreen ? {
      position: "fixed", inset: 0, zIndex: 1000,
      height: "100vh", width: "100vw",
      borderRadius: 0, overflow: "visible",
    } : { position: "relative", height: "100%", overflow: "visible" }}>
      {/* Header */}
      <div className="widget-header">
        <span className="widget-header-label"><MessageSquare size={13} strokeWidth={1.5} /> Chat</span>
        <div style={{ display: "flex", gap: 2 }}>
          <button className="widget-toolbar-btn" data-tip={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"} onClick={() => setFullscreen(v => !v)}>
            {fullscreen ? <Minimize2 size={12} strokeWidth={1.5} /> : <Maximize2 size={12} strokeWidth={1.5} />}
          </button>
          <button className="widget-toolbar-btn" data-tip="Send to Tana today" onClick={sendAllToTana}>
            <TanaIcon size={12} strokeWidth={1.5} />
          </button>
          <button
            className="widget-toolbar-btn"
            data-tip="Send to Engineer"
            onClick={() => setShowEngineerInput(v => !v)}
            style={showEngineerInput ? { color: "var(--blue)", opacity: 1 } : undefined}
          >
            <Hammer size={12} strokeWidth={1.5} />
          </button>
          <button
            className="widget-toolbar-btn"
            data-tip="Send to Architect"
            onClick={() => setShowArchitectInput(v => !v)}
            style={showArchitectInput ? { color: "var(--blue)", opacity: 1 } : undefined}
          >
            <Layers size={12} strokeWidth={1.5} />
          </button>
          <button
            className="widget-toolbar-btn"
            data-tip="Flag for review"
            onClick={flagConversation}
            disabled={flagging || flagged}
            style={flagged ? { color: "var(--green, #22c55e)", opacity: 1 } : flagging ? { opacity: 0.5 } : undefined}
          >
            {flagging
              ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
              : flagged
                ? <Check size={12} strokeWidth={1.5} />
                : <Flag size={12} strokeWidth={1.5} />}
          </button>
          <button className="widget-toolbar-btn" data-tip="Copy all" onClick={copyAllChat}>
            <Copy size={12} strokeWidth={1.5} />
          </button>
          <button className="widget-toolbar-btn" data-tip="Clear all chats" onClick={clearAllChats}>
            <Trash2 size={12} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Engineer context input */}
      {showEngineerInput && (
        <div style={{
          borderBottom: "1px solid var(--border)", background: "var(--surface-2)",
          padding: "6px 10px", flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
        }}>
          <textarea
            ref={engineerInputRef}
            autoFocus
            value={engineerInputValue}
            onChange={e => setEngineerInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendToEngineer(engineerInputValue.trim() || undefined); }
              if (e.key === "Escape") { setShowEngineerInput(false); setEngineerInputValue(""); }
            }}
            placeholder="context for engineer (optional)"
            rows={1}
            style={{
              flex: 1, fontFamily: "var(--font-mono)", fontSize: 10,
              color: "var(--text)", background: "transparent",
              border: "none", outline: "none", resize: "none",
              padding: 0, lineHeight: 1.5,
            }}
          />
          <button
            onClick={() => sendToEngineer(engineerInputValue.trim() || undefined)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--blue)", padding: 2, display: "flex", alignItems: "center",
            }}
          >
            <CornerUpRight size={11} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Architect context input */}
      {showArchitectInput && (
        <div style={{
          borderBottom: "1px solid var(--border)", background: "var(--surface-2)",
          padding: "6px 10px", flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
        }}>
          <textarea
            ref={architectInputRef}
            autoFocus
            value={architectInputValue}
            onChange={e => setArchitectInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendToArchitect(architectInputValue.trim() || undefined); }
              if (e.key === "Escape") { setShowArchitectInput(false); setArchitectInputValue(""); }
            }}
            placeholder="context for architect (optional)"
            rows={1}
            style={{
              flex: 1, fontFamily: "var(--font-mono)", fontSize: 10,
              color: "var(--text)", background: "transparent",
              border: "none", outline: "none", resize: "none",
              padding: 0, lineHeight: 1.5,
            }}
          />
          <button
            onClick={() => sendToArchitect(architectInputValue.trim() || undefined)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--blue)", padding: 2, display: "flex", alignItems: "center",
            }}
          >
            <CornerUpRight size={11} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 2,
        padding: "0 10px", height: 34, minHeight: 34,
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
                padding: "4px 10px", border: "none", borderRadius: 4,
                cursor: "pointer", flexShrink: 0,
                background: isActive ? char.color + "15" : "transparent",
                fontFamily: "var(--font-mono)", fontSize: 11,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? char.color : "var(--text-3)",
                transition: "background 0.1s",
              }}
            >
              <TIcon size={12} strokeWidth={1.5} style={{ color: isActive ? char.color : "var(--text-3)" }} />
              {renamingTabId === tab.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') { setRenamingTabId(null); setRenameValue(""); }
                  }}
                  onBlur={commitRename}
                  onClick={e => e.stopPropagation()}
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
                    color: char.color, background: "transparent", border: "none",
                    outline: "none", width: Math.max(40, renameValue.length * 6),
                    padding: 0, margin: 0,
                  }}
                />
              ) : (
                <span onDoubleClick={e => { e.stopPropagation(); startRename(tab.id, tab.label || char.name); }}>
                  {tab.label || char.name}
                </span>
              )}
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
              cursor: "pointer",
              color: "var(--text-3)",
            }}
          >
            <Plus size={9} strokeWidth={2} />
          </button>
          {showNewTabPicker && (
            <div style={{
              position: "absolute", top: 22, left: 0, zIndex: 100,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
              padding: 6,
              display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 3,
              width: 180,
            }}>
              {characters.map(c => {
                const CIcon = charIcon[c.name] || BookOpen;
                return (
                  <button
                    key={c.id}
                    data-tip={c.name}
                    onClick={() => createTab(c.id)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 30, height: 30, border: "none", cursor: "pointer",
                      background: c.color + "08", borderRadius: 5,
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = c.color + "20")}
                    onMouseLeave={e => (e.currentTarget.style.background = c.color + "08")}
                  >
                    <CIcon size={13} strokeWidth={1.5} style={{ color: c.color }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Chat panels — active visible, others hidden (kept mounted to preserve input state) */}
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;
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
              isActive={isActive}
            />
          </div>
        );
      })}
    </div>
  );
}
