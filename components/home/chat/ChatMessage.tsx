"use client";
import React from "react";
import { BookOpen, Copy, Trash2 } from "lucide-react";
import { charIcon } from "@/lib/char-icons";
import type { ChatMessage as ChatMessageType } from "@/types";
import TanaIcon from "@/components/icons/TanaIcon";
import ChatMarkdown, { processLinks } from "./ChatMarkdown";
import { splitMessage } from "./helpers";

// ─── Thinking avatar & bubble (streaming state) ─────────────────────────────

export function ThinkingAvatar({ color, children }: { color: string; children: React.ReactNode }) {
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

export function ThinkingBubble({ charName, color }: { charName: string; color: string }) {
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

// ─── ChatMessage ────────────────────────────────────────────────────────────

type CharInfo = {
  name: string;
  color: string;
  defaultModel?: string;
};

type ChatMessageProps = {
  msg: ChatMessageType;
  index: number;
  activeChar: CharInfo;
  characters: CharInfo[];
  isLoading: boolean;
  canSend: boolean;
  onCopy: (text: string) => void;
  onSendToTana: (text: string, charName?: string) => void;
  onDelete: (index: number) => void;
  onQuickReply: (text: string) => void;
};

const ChatMessage = React.memo(function ChatMessage({
  msg, index, activeChar, characters, isLoading, canSend,
  onCopy, onSendToTana, onDelete, onQuickReply,
}: ChatMessageProps) {
  if (msg.role === "user") {
    return (
      <div className="chat-msg-row chat-msg-user">
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
          <button className="item-action-btn" data-tip="Copy" onClick={() => onCopy(msg.content)}>
            <Copy size={10} strokeWidth={1.5} />
          </button>
          <button className="item-action-btn" data-tip="Send to Tana today" onClick={() => onSendToTana(msg.content)}>
            <TanaIcon size={10} strokeWidth={1.5} />
          </button>
          <button className="item-action-btn" data-tip="Delete message" onClick={() => onDelete(index)} style={{ color: "var(--text-3)" }}>
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
    <div className="chat-msg-row chat-msg-assistant">
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
            <ChatMarkdown text={output} accent={msgChar.color} onQuickReply={(!isLoading && canSend) ? onQuickReply : undefined} />
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
        <button className="item-action-btn" data-tip="Copy" onClick={() => onCopy(output)}>
          <Copy size={10} strokeWidth={1.5} />
        </button>
        <button className="item-action-btn" data-tip="Delete message" onClick={() => onDelete(index)} style={{ color: "var(--text-3)" }}>
          <Trash2 size={10} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
});

export default ChatMessage;
