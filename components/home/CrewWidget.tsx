"use client";
import { useState, useEffect } from "react";
import { charIcon, charSeeds } from "@/lib/char-icons";
import { useChatTrigger } from "@/lib/chat-store";
import { BookOpen } from "lucide-react";

type CharacterInfo = {
  id: string;
  name: string;
  tier: string;
  color: string;
  domain?: string;
  defaultModel?: string;
};

const modelBadge: Record<string, { label: string; color: string; bg: string }> = {
  haiku:  { label: "haiku",  color: "var(--text-3)", bg: "var(--bg)"      },
  sonnet: { label: "sonnet", color: "var(--blue)",   bg: "var(--blue-bg)" },
  opus:   { label: "opus",   color: "#9333ea",       bg: "#f5f0ff"        },
};

export default function CrewWidget() {
  const { setTrigger } = useChatTrigger();
  const [characters, setCharacters] = useState<CharacterInfo[]>([]);

  useEffect(() => {
    fetch("/api/characters")
      .then(r => r.json())
      .then(d => setCharacters(d.characters))
      .catch(() => {});
  }, []);

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-header-label">Crew</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
          {characters.length}
        </span>
      </div>

      <div className="widget-body" style={{ padding: "4px 0" }}>
        {characters.map((char, i) => {
          const Icon = charIcon[char.name] || BookOpen;
          const model = modelBadge[char.defaultModel || "haiku"] || modelBadge.haiku;
          const seeds = charSeeds[char.name] || {};
          const actions = Object.keys(seeds);

          return (
            <div
              className="item-row"
              key={char.id}
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 16px", cursor: "pointer" }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                  background: char.color + "16",
                  border: `1px solid ${char.color}28`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={14} strokeWidth={1.5} style={{ color: char.color }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
                    color: "var(--text)", lineHeight: 1.3,
                  }}>
                    {char.name}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-body)", fontSize: 10,
                    color: "var(--text-3)", textTransform: "capitalize",
                  }}>
                    {char.domain || char.tier}
                  </div>
                </div>

                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 500,
                  color: model.color, background: model.bg,
                  padding: "2px 5px", borderRadius: 3,
                  textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0,
                }}>
                  {model.label}
                </span>
              </div>

              {actions.length > 0 && (
                <div className="item-actions" style={{ padding: "0 16px 5px", gap: 3 }}>
                  {actions.map((action) => {
                    const seedPrompt = seeds[action];
                    return (
                      <button
                        key={action}
                        className="item-action-btn"
                        title={seedPrompt || action}
                        onClick={seedPrompt
                          ? () => setTrigger({ charName: char.name, seedPrompt, action })
                          : undefined
                        }
                        style={{
                          fontFamily: "var(--font-mono)", fontSize: 9,
                          width: "auto", padding: "0 6px", height: 20,
                        }}
                      >
                        {action}
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
  );
}
