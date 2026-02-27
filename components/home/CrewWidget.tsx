"use client";
import { useState, useEffect, useRef } from "react";
import { resolveIcon } from "@/lib/icon-map";
import { useChatTrigger } from "@/lib/chat-store";
import { logAction } from "@/lib/action-log";
import { Loader2 } from "lucide-react";

type ActionInfo = {
  label: string;
  icon: string;
  description: string;
  autonomous?: boolean;
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

  useEffect(() => {
    fetch("/api/characters")
      .then(r => r.json())
      .then(d => {
        setCharacters((d.characters || []).filter((c: CharacterInfo) => c.tier === "core" || c.tier === "meta"));
      })
      .catch(() => {});
  }, []);

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
                      const isRunning = runningActions.has(`${char.name}:${action.label}`);
                      return (
                        <button
                          key={action.label}
                          className="item-action-btn"
                          data-tip={action.description || action.label}
                          disabled={isRunning}
                          onClick={seedPrompt
                            ? isAuto
                              ? () => runAutonomous(char.name, action.label, seedPrompt)
                              : () => setTrigger({ charName: char.name, seedPrompt, action: action.label })
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
                      );
                    })}
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
