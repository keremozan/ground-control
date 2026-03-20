import type { ChatMessage } from "@/types";

// ─── Tool input helpers ─────────────────────────────────────────────────────

/** Extract a short label from tool input JSON for display */
export function toolInputLabel(tool: string, raw: string): string {
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

// ─── Link helpers ───────────────────────────────────────────────────────────

export function openTanaNode(nodeId: string) {
  fetch("/api/tana-tasks/action", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodeId, action: "open" }),
  }).catch(() => {});
}

export function openGmail(threadId: string, account: string) {
  const idx = account === "school" ? 1 : 0;
  window.open(`https://mail.google.com/mail/u/${idx}/#inbox/${threadId}`, "_blank");
}

export const LINK_RE = /(\[[^\]]+\]\((?:tana|gmail):[^)]+\))/g;
export const TANA_LINK_RE = /^\[([^\]]+)\]\(tana:([^)]+)\)$/;
export const GMAIL_LINK_RE = /^\[([^\]]+)\]\(gmail:([^:]+):([^)]+)\)$/;


// ─── Message splitting ──────────────────────────────────────────────────────

const NARRATION_RE = /^(let me|i('ll| will)|now i|first,?\s+i|reading|searching|checking|fetching|looking|scanning|found|processing|done\.|done!)/i;

export function splitMessage(text: string): { thinking: string; output: string } {
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

  const preLines = lines.slice(0, splitIdx).filter(l => l.trim());
  const hasNarration = preLines.some(l => NARRATION_RE.test(l.trim()));
  if (!hasNarration) return { thinking: '', output: text };

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

// ─── Emoji rendering ────────────────────────────────────────────────────────

export const EMOJI_MAP: Record<string, { label: string; color: string; bg: string }> = {
  "\u2705": { label: "OK", color: "var(--green)", bg: "var(--green-bg)" },
  "\u2714\uFE0F": { label: "OK", color: "var(--green)", bg: "var(--green-bg)" },
  "\u274C": { label: "X", color: "var(--red)", bg: "var(--red-bg)" },
  "\u274E": { label: "X", color: "var(--red)", bg: "var(--red-bg)" },
  "\u26A0\uFE0F": { label: "!", color: "var(--amber)", bg: "var(--amber-bg)" },
  "\u2139\uFE0F": { label: "i", color: "var(--blue)", bg: "var(--blue-bg)" },
  "\u{1F4E7}": { label: "MAIL", color: "var(--indigo)", bg: "var(--blue-bg)" },
  "\u{1F4DD}": { label: "NOTE", color: "var(--purple)", bg: "var(--blue-bg)" },
  "\u{1F4CB}": { label: "LIST", color: "var(--teal)", bg: "var(--green-bg)" },
  "\u{1F4CC}": { label: "PIN", color: "var(--red)", bg: "var(--red-bg)" },
  "\u{1F50D}": { label: "FIND", color: "var(--indigo)", bg: "var(--blue-bg)" },
  "\u{1F4C1}": { label: "DIR", color: "var(--amber)", bg: "var(--amber-bg)" },
  "\u{1F4C4}": { label: "FILE", color: "var(--text-3)", bg: "var(--surface-2)" },
  "\u{1F6D1}": { label: "STOP", color: "var(--red)", bg: "var(--red-bg)" },
  "\u{1F680}": { label: "GO", color: "var(--blue)", bg: "var(--blue-bg)" },
};
const EMOJI_KEYS = Object.keys(EMOJI_MAP);
const EMOJI_RE = new RegExp(`(${EMOJI_KEYS.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gu');

export function emojiInfo(seg: string): { label: string; color: string; bg: string } | null {
  return EMOJI_MAP[seg] || null;
}

export function splitEmoji(text: string): string[] {
  EMOJI_RE.lastIndex = 0;
  if (!EMOJI_RE.test(text)) return [text];
  EMOJI_RE.lastIndex = 0;
  return text.split(EMOJI_RE);
}

// ─── Token estimation & context ─────────────────────────────────────────────

const MODEL_CONTEXT: Record<string, number> = {
  haiku: 200_000, sonnet: 200_000, opus: 200_000,
};

export function estimateTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 3.5), 0);
}

export function getContextLimit(model?: string): number {
  return MODEL_CONTEXT[model || 'sonnet'] || 200_000;
}

// ─── Tab ID ─────────────────────────────────────────────────────────────────

export function genTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const STORAGE_KEY = "gc-chat";
export const COMPRESS_THRESHOLD = 0.85;
export const WARN_THRESHOLD = 0.70;
