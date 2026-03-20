"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  BookOpen, Check, Copy, CornerUpRight, Flag, Hammer, Layers, Loader2,
  MessageSquare, Plus, Trash2, X, Maximize2, Minimize2,
} from "lucide-react";
import { charIcon } from "@/lib/char-icons";
import { useChatTrigger, type ChatTrigger } from "@/lib/chat-store";
import { useCharacters } from "@/lib/shared-data";
import { logAction } from "@/lib/action-log";
import TanaIcon from "@/components/icons/TanaIcon";
import type { ChatMessage } from "@/types";
import ChatPanel from "./ChatPanel";
import { genTabId, STORAGE_KEY } from "./helpers";

// ─── Local types ────────────────────────────────────────────────────────────

type CharacterInfo = {
  id: string;
  name: string;
  color: string;
  defaultModel?: string;
  model?: string;
  suggestions?: string[];
};

type TabMeta = {
  id: string;
  charId: string;
  messages: ChatMessage[];
  modelOverride?: string;
  label?: string;
};

// ─── ChatWidget (outer tab manager) ─────────────────────────────────────────

export default function ChatWidget() {
  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [tabs, setTabs] = useState<TabMeta[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

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

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.tabs) {
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
          const tab: TabMeta = { id: genTabId(), charId: data.activeCharId, messages: data.messages };
          setTabs([tab]);
          setActiveTabId(tab.id);
        }
      }
    } catch {}
    setHydrated(true);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }));
    } catch {}
  }, [tabs, activeTabId, hydrated]);

  // Load characters from shared context
  const sharedChars = useCharacters();
  useEffect(() => {
    if (sharedChars.length > 0) setCharacters(sharedChars as CharacterInfo[]);
  }, [sharedChars]);

  // Create default tab if none restored
  useEffect(() => {
    if (characters.length === 0 || tabs.length > 0 || !hydrated) return;
    const postman = characters.find(c => c.name === "Postman");
    const charId = postman?.id || characters[0]?.id || "";
    if (!charId) return;
    const tab: TabMeta = { id: genTabId(), charId, messages: [] };
    setTabs([tab]);
    setActiveTabId(tab.id);
  }, [characters, hydrated, tabs.length]);

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (newTabRef.current && !newTabRef.current.contains(e.target as Node))
        setShowNewTabPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Handle trigger from other widgets
  useEffect(() => {
    if (!trigger || characters.length === 0) return;
    if (trigger === triggerHandledRef.current) return;
    triggerHandledRef.current = trigger;
    const { charName, seedPrompt, action } = trigger;
    const char = characters.find(c => c.name === charName);
    if (!char) { setTrigger(null); return; }

    const newTab: TabMeta = { id: genTabId(), charId: char.id, messages: [], modelOverride: trigger.model };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);

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

  // Tab operations
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

  const formatChat = useCallback((msgs: ChatMessage[]) => {
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
    } catch {}
    setFlagging(false);
  }, [tabs, activeTabId, characters]);

  const handleMessagesChange = useCallback((tabId: string, msgs: ChatMessage[]) => {
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

  // Render
  const canSend = loadingTabIds.length < 4;

  if (characters.length === 0 || tabs.length === 0) {
    return <div className="widget" style={{ height: "100%" }} />;
  }

  return (
    <div className="widget" data-fullscreen={fullscreen || undefined} style={fullscreen ? {
      position: "fixed", inset: 0, zIndex: 1000,
      height: "100vh", width: "100vw",
      borderRadius: 0, overflow: "hidden",
    } : { position: "relative", height: "100%", overflow: "visible" }}>
      {/* Header */}
      <div className="widget-header">
        <span className="widget-header-label"><MessageSquare size={13} strokeWidth={1.5} /> Chat</span>
        <div style={{ display: "flex", gap: 2 }}>
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
          <button className="widget-toolbar-btn" data-tip={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"} onClick={() => setFullscreen(v => !v)}>
            {fullscreen ? <Minimize2 size={12} strokeWidth={1.5} /> : <Maximize2 size={12} strokeWidth={1.5} />}
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

      {/* Chat panels */}
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
