"use client";
import { useState, useRef, useEffect } from "react";
import { charIcon } from "@/lib/char-icons";
import { useChatTrigger } from "@/lib/chat-store";
import {
  BookOpen, Copy, CornerUpRight,
  Send, Trash2, ChevronDown,
} from "lucide-react";

type CharacterInfo = {
  id: string;
  name: string;
  color: string;
  defaultModel?: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  charName?: string;
};

function ThinkingBubble({ charName, color }: { charName: string; color: string }) {
  const TIcon = charIcon[charName] || BookOpen;
  return (
    <div className="chat-msg-row chat-msg-assistant">
      <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5, flexShrink: 0,
          background: color + "16", border: `1px solid ${color}28`,
          display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
        }}>
          <TIcon size={10} strokeWidth={1.5} style={{ color }} />
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
  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [activeCharId, setActiveCharId] = useState<string>("");
  const [showPicker, setShowPicker] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const { trigger, setTrigger } = useChatTrigger();

  // Load characters
  useEffect(() => {
    fetch("/api/characters")
      .then(r => r.json())
      .then(d => {
        const chars = d.characters as CharacterInfo[];
        setCharacters(chars);
        const scholar = chars.find(c => c.name === "Scholar");
        if (scholar) setActiveCharId(scholar.id);
        else if (chars.length > 0) setActiveCharId(chars[0].id);
      })
      .catch(() => {});
  }, []);

  const activeChar = characters.find(c => c.id === activeCharId) || characters[0];
  const ActiveIcon = activeChar ? (charIcon[activeChar.name] || BookOpen) : BookOpen;

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, isLoading]);

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
    if (!trigger || characters.length === 0) return;
    const { charName, seedPrompt } = trigger;
    const char = characters.find(c => c.name === charName);
    if (char) setActiveCharId(char.id);
    setMessages(prev => [...prev, { role: "user", content: seedPrompt }]);
    setTrigger(null);
    if (char) sendMessage(seedPrompt, char.id);
  }, [trigger, characters]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = async (msg: string, charId?: string) => {
    setIsLoading(true);
    let fullText = '';
    const targetCharId = charId || activeCharId;
    const targetChar = characters.find(c => c.id === targetCharId);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: targetCharId, message: msg }),
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
            if (eventMatch[1] === 'text') fullText += parsed.text;
            if (eventMatch[1] === 'done') {
              setMessages(prev => [...prev, {
                role: 'assistant',
                charName: targetChar?.name,
                content: fullText || '(no response)',
              }]);
              setIsLoading(false);
            }
          } catch {}
        }
      }
    } catch {
      if (fullText) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          charName: targetChar?.name,
          content: fullText,
        }]);
      }
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (!input.trim() || isLoading || !activeChar) return;
    const msg = input.trim();
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setInput("");
    sendMessage(msg);
  };

  if (!activeChar) return <div className="widget" style={{ height: "100%" }} />;

  return (
    <div className="widget" style={{ position: "relative", height: "100%" }}>
      <div className="widget-header">
        <span className="widget-header-label">Chat</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }} ref={pickerRef}>
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

          <button className="widget-toolbar-btn" title="Clear chat" onClick={() => setMessages([])}>
            <Trash2 size={12} strokeWidth={1.5} />
          </button>

          {showPicker && (
            <div style={{
              position: "absolute", top: 42, right: 12, zIndex: 100,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
              minWidth: 156, overflow: "hidden",
            }}>
              {characters.map(c => {
                const CIcon = charIcon[c.name] || BookOpen;
                const isActive = c.id === activeCharId;
                return (
                  <button
                    key={c.id}
                    onClick={() => { setActiveCharId(c.id); setShowPicker(false); }}
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
        {isLoading && <ThinkingBubble charName={activeChar.name} color={activeChar.color} />}
      </div>

      <div className="widget-footer" style={{ padding: "10px 12px", gap: 8, alignItems: "flex-end" }}>
        <textarea
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder={isLoading ? `${activeChar.name} is thinking...` : `Ask ${activeChar.name}...`}
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
