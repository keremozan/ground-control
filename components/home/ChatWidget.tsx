"use client";
import { useState, useRef, useEffect } from "react";
import { characters } from "@/lib/mock-data";
import { charIcon } from "@/lib/char-icons";
import { useChatTrigger } from "@/lib/chat-store";
import {
  BookOpen, Copy, CornerUpRight,
  Send, Trash2, ChevronDown,
} from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
  charName?: string;
};

const demoMessages: Message[] = [
  { role: "user", content: "Can you help me outline the introduction for the plant sensing paper?" },
  { role: "assistant", charName: "Scholar", content: "Happy to. Open with a framing question about the boundary between sensing and cognition in living systems — positions the work at the HCI/biology intersection without front-loading theory. Then 2–3 sentences of empirical context, then the research questions." },
  { role: "user", content: "Should I mention the Cambridge collaboration in the intro?" },
  { role: "assistant", charName: "Scholar", content: "Yes, briefly. Situate it as empirical context, not the main argument. One sentence anchors the methodology. Don't let it read like a CV item." },
];

function ThinkingBubble({ charName }: { charName: string }) {
  const char = characters.find(c => c.name === charName) || characters[1];
  const TIcon = charIcon[char.name] || BookOpen;
  return (
    <div className="chat-msg-row chat-msg-assistant">
      <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5, flexShrink: 0,
          background: char.color + "16", border: `1px solid ${char.color}28`,
          display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
        }}>
          <TIcon size={10} strokeWidth={1.5} style={{ color: char.color }} />
        </div>
        <div className="thinking-dots">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
      </div>
    </div>
  );
}

export default function ChatWidget() {
  const [activeCharName, setActiveCharName] = useState("Scholar");
  const [showPicker, setShowPicker] = useState(false);
  const [messages, setMessages] = useState<Message[]>(demoMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const { trigger, setTrigger } = useChatTrigger();

  const activeChar = characters.find(c => c.name === activeCharName) || characters[1];
  const ActiveIcon = charIcon[activeChar.name] || BookOpen;

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, isLoading]);

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Handle Crew trigger
  useEffect(() => {
    if (!trigger) return;
    const { charName, seedPrompt, action } = trigger;
    setActiveCharName(charName);
    setMessages(prev => [...prev, { role: "user", content: seedPrompt }]);
    setTrigger(null);
    setIsLoading(true);
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: "assistant",
        charName,
        content: `On it. Starting: ${action}.`,
      }]);
      setIsLoading(false);
    }, 1600);
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    setMessages(prev => [...prev, { role: "user", content: input.trim() }]);
    setInput("");
  };

  return (
    <div className="widget" style={{ position: "relative", height: "100%" }}>
      {/* Header */}
      <div className="widget-header">
        <span className="widget-header-label">Chat</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }} ref={pickerRef}>
          {/* Character selector */}
          <button
            onClick={() => setShowPicker(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: activeChar.color + "12",
              border: `1px solid ${activeChar.color}28`,
              borderRadius: 5, padding: "3px 7px 3px 5px", cursor: "pointer",
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: 4,
              background: activeChar.color + "20",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ActiveIcon size={10} strokeWidth={1.5} style={{ color: activeChar.color }} />
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: activeChar.color, fontWeight: 500 }}>
              {activeChar.name}
            </span>
            <ChevronDown size={9} strokeWidth={2} style={{ color: activeChar.color }} />
          </button>

          {/* Clear */}
          <button className="widget-toolbar-btn" title="Clear chat" onClick={() => setMessages([])}>
            <Trash2 size={12} strokeWidth={1.5} />
          </button>

          {/* Dropdown picker */}
          {showPicker && (
            <div style={{
              position: "absolute", top: 42, right: 12, zIndex: 100,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
              minWidth: 156, overflow: "hidden",
            }}>
              {characters.map(c => {
                const CIcon = charIcon[c.name] || BookOpen;
                const isActive = c.name === activeCharName;
                return (
                  <button
                    key={c.name}
                    onClick={() => { setActiveCharName(c.name); setShowPicker(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "6px 12px", border: "none", cursor: "pointer", textAlign: "left",
                      background: isActive ? c.color + "12" : "transparent",
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
                      color: "var(--text)", fontWeight: isActive ? 500 : 400,
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

      {/* Messages */}
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
                <div className="chat-bubble chat-bubble-user">{msg.content}</div>
                <div className="chat-msg-actions">
                  <button className="item-action-btn" title="Copy"><Copy size={10} strokeWidth={1.5} /></button>
                </div>
              </div>
            );
          }

          const msgChar = characters.find(c => c.name === msg.charName) || activeChar;
          const MIcon = charIcon[msgChar.name] || BookOpen;
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
                <div className="chat-bubble chat-bubble-assistant">{msg.content}</div>
              </div>
              <div className="chat-msg-actions" style={{ marginLeft: 29 }}>
                <button className="item-action-btn" title="Copy">
                  <Copy size={10} strokeWidth={1.5} />
                </button>
                <button className="item-action-btn" title="Send to Postman" style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, width: "auto",
                  padding: "0 5px", display: "flex", alignItems: "center", gap: 3,
                }}>
                  <CornerUpRight size={9} strokeWidth={1.5} /> Postman
                </button>
              </div>
            </div>
          );
        })}
        {isLoading && <ThinkingBubble charName={activeCharName} />}
      </div>

      {/* Input */}
      <div className="widget-footer" style={{ padding: "10px 12px", gap: 8, alignItems: "flex-end" }}>
        <textarea
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder={isLoading ? `${activeCharName} is thinking...` : `Ask ${activeChar.name}...`}
          rows={1}
          disabled={isLoading}
        />
        <button
          onClick={handleSend}
          disabled={isLoading}
          style={{
            width: 30, height: 30, borderRadius: 5, cursor: isLoading ? "default" : "pointer", flexShrink: 0,
            background: activeChar.color + "18", border: `1px solid ${activeChar.color}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.12s",
            opacity: isLoading ? 0.4 : 1,
          }}
        >
          <Send size={12} strokeWidth={1.5} style={{ color: activeChar.color }} />
        </button>
      </div>
    </div>
  );
}
