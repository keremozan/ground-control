"use client";
import { useState, useEffect, useRef } from "react";
import { resolveIcon } from "@/lib/icon-map";
import { useChatTrigger } from "@/lib/chat-store";
import { logAction } from "@/lib/action-log";
import { Loader2, Play, X } from "lucide-react";

type ActionInfo = {
  label: string;
  icon: string;
  description: string;
  autonomous?: boolean;
  endpoint?: string;
};

type CharacterInfo = {
  id: string;
  name: string;
  tier: string;
  icon: string;
  color: string;
  domain?: string;
  actions?: ActionInfo[];
  seeds?: Record<string, string>;
};

export default function CrewWidget() {
  const { setTrigger } = useChatTrigger();
  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [runningActions, setRunningActions] = useState<Set<string>>(new Set());
  const runningRef = useRef(new Set<string>());
  const [promptAction, setPromptAction] = useState<{ charName: string; label: string; seed: string } | null>(null);
  const [promptInput, setPromptInput] = useState("");
  const promptRef = useRef<HTMLInputElement>(null);
  const [contextOn, setContextOn] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("crew-context-on");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    fetch("/api/characters")
      .then(r => r.json())
      .then(d => {
        setCharacters((d.characters || []).filter((c: CharacterInfo) => c.tier === "core" || c.tier === "meta"));
      })
      .catch(() => {});
  }, []);

  const runEndpoint = async (charName: string, action: string, endpoint: string) => {
    const key = `${charName}:${action}`;
    if (runningRef.current.has(key)) return;
    runningRef.current.add(key);
    setRunningActions(prev => new Set(prev).add(key));

    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      logAction({
        widget: "crew",
        action: "endpoint",
        target: `${charName} ${action}`,
        character: charName,
        detail: JSON.stringify(data.report || data),
      });
    } catch {
      // silent
    } finally {
      runningRef.current.delete(key);
      setRunningActions(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const runAutonomous = async (charName: string, action: string, seedPrompt: string) => {
    const key = `${charName}:${action}`;
    if (runningRef.current.has(key)) return;
    runningRef.current.add(key);
    setRunningActions(prev => new Set(prev).add(key));

    try {
      const res = await fetch("/api/schedule/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charName: charName.toLowerCase(), seedPrompt, label: `${charName} ${action}` }),
      });
      const data = await res.json();
      if (data.ok && data.result) {
        logAction({
          widget: "scheduler",
          action: "run",
          target: `${charName} ${action}`,
          character: charName,
          detail: `${Math.round(data.result.durationMs / 1000)}s`,
          jobId: data.result.jobId,
        });
      }
    } catch {
      // silent
    } finally {
      runningRef.current.delete(key);
      setRunningActions(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const toggleContext = (charName: string, label: string) => {
    const key = `${charName}:${label}`;
    setContextOn(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem("crew-context-on", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const fireAction = (charName: string, action: ActionInfo, seedPrompt: string) => {
    const key = `${charName}:${action.label}`;
    if (contextOn.has(key)) {
      setPromptAction({ charName, label: action.label, seed: seedPrompt });
      setPromptInput("");
      setTimeout(() => promptRef.current?.focus(), 50);
    } else {
      setTrigger({ charName, seedPrompt, action: action.label });
    }
  };

  const submitPrompt = () => {
    if (!promptAction) return;
    const ctx = promptInput.trim();
    const seed = ctx
      ? `${promptAction.seed}\n\nContext: ${ctx}`
      : promptAction.seed;
    setTrigger({ charName: promptAction.charName, seedPrompt: seed, action: promptAction.label });
    setPromptAction(null);
    setPromptInput("");
  };

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-header-label">Crew</span>
      </div>

      <div className="widget-body" style={{ padding: "4px 10px 6px" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "6px",
        }}>
          {characters.map((char) => {
            const Icon = resolveIcon(char.icon);
            const seeds = char.seeds || {};
            const actions = char.actions || [];
            const charBusy = [...runningActions].some(k => k.startsWith(`${char.name}:`));

            return (
              <div
                key={char.id}
                className="crew-card"
                style={{
                  padding: "6px 6px 5px",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                  onClick={() => setTrigger({ charName: char.name, seedPrompt: '', action: 'chat', openOnly: true })}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                    background: char.color + "16",
                    border: `1px solid ${char.color}28`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    animation: charBusy ? "pulse-crew 1.5s ease-in-out infinite" : undefined,
                  }}>
                    <Icon size={12} strokeWidth={1.5} style={{ color: char.color }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
                      color: "var(--text)", lineHeight: 1.3,
                    }}>
                      {char.name}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-body)", fontSize: 9,
                      color: "var(--text-3)", textTransform: "capitalize",
                    }}>
                      {char.domain || char.tier}
                    </div>
                  </div>
                </div>

                {actions.length > 0 && (
                  <div className="crew-card-actions" style={{ flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                    {actions.map((action) => {
                      const seedPrompt = seeds[action.label];
                      const AIcon = resolveIcon(action.icon);
                      const isAuto = action.autonomous === true;
                      const isDirect = !!action.endpoint;
                      const isRunning = runningActions.has(`${char.name}:${action.label}`);
                      const ctxKey = `${char.name}:${action.label}`;
                      const isCtxOn = !isAuto && !isDirect && contextOn.has(ctxKey);
                      return (
                        <span key={action.label} style={{ display: "inline-flex", alignItems: "center", gap: 0 }}>
                          <button
                            className="item-action-btn"
                            data-tip={action.description || action.label}
                            disabled={isRunning}
                            onClick={isDirect
                              ? () => runEndpoint(char.name, action.label, action.endpoint!)
                              : seedPrompt
                                ? isAuto
                                  ? () => runAutonomous(char.name, action.label, seedPrompt)
                                  : () => fireAction(char.name, action, seedPrompt)
                                : undefined
                            }
                            style={{
                              width: "auto", height: 18, gap: 3, padding: "0 5px 0 4px",
                              opacity: isRunning ? 0.5 : 1,
                              color: char.color,
                              borderRadius: 3, fontSize: 9,
                            }}
                          >
                            {isRunning
                              ? <Loader2 size={9} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
                              : <AIcon size={9} strokeWidth={1.5} />
                            }
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>{action.label}</span>
                          </button>
                          {!isAuto && !isDirect && (
                            <span
                              data-tip={isCtxOn ? "Context on" : "Context off"}
                              onClick={() => toggleContext(char.name, action.label)}
                              style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                width: 14, height: 14, cursor: "pointer", flexShrink: 0,
                              }}
                            >
                              <span style={{
                                width: 5, height: 5, borderRadius: "50%",
                                background: isCtxOn ? char.color : "var(--text-3)",
                                opacity: isCtxOn ? 1 : 0.25,
                                transition: "all 0.15s",
                              }} />
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Inline context prompt */}
                {promptAction?.charName === char.name && (
                  <div style={{
                    borderTop: "1px solid var(--border)", background: "var(--surface-2)",
                    borderRadius: "0 0 6px 6px", padding: "6px 6px",
                    marginTop: 4, marginLeft: -6, marginRight: -6, marginBottom: -5,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        ref={promptRef}
                        type="text"
                        value={promptInput}
                        onChange={e => setPromptInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") submitPrompt();
                          if (e.key === "Escape") { setPromptAction(null); setPromptInput(""); }
                        }}
                        placeholder="context"
                        style={{
                          flex: 1, fontFamily: "var(--font-mono)", fontSize: 10,
                          background: "var(--surface)", border: "1px solid var(--border)",
                          borderRadius: 4, padding: "4px 8px", color: "var(--text)",
                          outline: "none",
                        }}
                      />
                      <button
                        className="item-action-btn item-action-btn-blue"
                        onClick={submitPrompt}
                        style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 2, width: "auto", padding: "0 5px", fontFamily: "var(--font-mono)", fontSize: 9, height: 18 }}
                      >
                        <Play size={9} strokeWidth={1.5} />
                        Go
                      </button>
                      <button
                        className="item-action-btn"
                        onClick={() => { setPromptAction(null); setPromptInput(""); }}
                        style={{ cursor: "pointer", height: 18 }}
                      >
                        <X size={10} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
