"use client";
import { useState, useEffect } from "react";
import { X, Loader2, BookOpenCheck, Database, FolderCog } from "lucide-react";
import type { ApiConfig } from "./SystemGraph.types";

const F = "var(--font-mono)";
const mono = (size: number, color: string, weight = 400): React.CSSProperties => ({
  fontFamily: F, fontSize: size, fontWeight: weight, color, lineHeight: 1.4,
});
const T = { section: 11, body: 10, small: 9 } as const;

type Props = {
  onClose: () => void;
  onOpenEditor: (title: string, fetchUrl: string, saveUrl: string, lineLimit?: number) => void;
  charColorMap: Record<string, string>;
};

export default function SystemConfigDrawer({ onClose, onOpenEditor, charColorMap }: Props) {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/system/config")
      .then(r => r.json())
      .then(d => { setConfig(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const dot = (ok: boolean) => (
    <span style={{
      width: 5, height: 5, borderRadius: "50%", flexShrink: 0, display: "inline-block",
      background: ok ? "var(--led-green)" : "var(--led-red)",
      boxShadow: ok ? "0 0 4px var(--led-green)" : "none",
    }} />
  );

  const subCard: React.CSSProperties = {
    padding: "10px 12px", borderRadius: 5,
    background: "var(--surface)", border: "1px solid var(--border)",
  };

  const subHead: React.CSSProperties = {
    ...mono(T.small, "var(--text-3)", 600),
    textTransform: "uppercase", letterSpacing: "0.06em",
    display: "block", marginBottom: 8,
  };

  const clickablePill = (label: string, onClick: () => void, icon?: React.ReactNode): React.ReactNode => (
    <span
      key={label}
      onClick={onClick}
      style={{
        ...mono(T.small, "var(--text-2)"),
        padding: "1px 5px", borderRadius: 3,
        background: "var(--surface-2)", border: "1px solid var(--border)",
        cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3,
        transition: "all 0.1s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--text-3)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      {icon}
      {label}
    </span>
  );

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9990,
        background: "rgba(0,0,0,0.2)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0,
          width: "min(480px, 90vw)",
          background: "var(--bg)", borderLeft: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
          animation: "enter 0.15s ease-out",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid var(--border)",
        }}>
          <span style={mono(T.section, "var(--text)", 700)}>System Config</span>
          <button
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 24, height: 24, borderRadius: 4,
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--text-3)",
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 20 }}>
              <Loader2 size={10} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
              <span style={mono(T.body, "var(--text-3)")}>Loading...</span>
            </div>
          ) : config ? (
            <>
              {/* Connections */}
              <div style={subCard}>
                <span style={subHead}>Connections</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {dot(config.tana.connected)}
                    <span style={mono(T.body, "var(--text-2)", 500)}>Tana MCP</span>
                    <span style={{ ...mono(T.small, "var(--text-3)"), marginLeft: "auto" }}>{config.tana.url}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {dot(config.gmail.personal)}
                    <span style={mono(T.body, "var(--text-2)", 500)}>Gmail (personal)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {dot(config.gmail.school)}
                    <span style={mono(T.body, "var(--text-2)", 500)}>Gmail (school)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {dot(config.calendar)}
                    <span style={mono(T.body, "var(--text-2)", 500)}>Google Calendar</span>
                  </div>
                </div>
              </div>

              {/* Paths */}
              <div style={subCard}>
                <span style={subHead}>Paths</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {config.paths.map(p => (
                    <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ ...mono(T.body, "var(--text-2)", 500), minWidth: 80, flexShrink: 0 }}>{p.label}</span>
                      <span style={{
                        ...mono(T.small, "var(--text-3)"),
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }} title={p.value}>{p.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sources & Outputs */}
              <div style={subCard}>
                <span style={subHead}>Sources & Outputs</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                  {config.sources.map(s => (
                    <span key={s.label} style={{
                      ...mono(T.small, s.color, 500),
                      padding: "1px 6px", borderRadius: 3,
                      background: s.color + "0a", border: `1px solid ${s.color}18`,
                    }}>{s.label}</span>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {config.outputs.map(o => (
                    <span key={o.label} style={{
                      ...mono(T.small, o.color, 500),
                      padding: "1px 6px", borderRadius: 3,
                      background: o.color + "0a", border: `1px solid ${o.color}18`,
                    }}>{o.label}</span>
                  ))}
                </div>
              </div>

              {/* Skills */}
              <div style={subCard}>
                <button
                  onClick={() => setExpandedSection(expandedSection === "skills" ? null : "skills")}
                  style={{
                    ...subHead, cursor: "pointer", background: "transparent", border: "none",
                    padding: 0, display: "flex", alignItems: "center", gap: 4, width: "100%",
                  }}
                >
                  <BookOpenCheck size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
                  Skills ({config.skills.length})
                </button>
                {expandedSection === "skills" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {config.skills.map(s =>
                      clickablePill(s, () => onOpenEditor(s, `/api/system/skill?name=${s}`, `/api/system/skill?name=${s}`))
                    )}
                  </div>
                )}
              </div>

              {/* Knowledge */}
              <div style={subCard}>
                <button
                  onClick={() => setExpandedSection(expandedSection === "knowledge" ? null : "knowledge")}
                  style={{
                    ...subHead, cursor: "pointer", background: "transparent", border: "none",
                    padding: 0, display: "flex", alignItems: "center", gap: 4, width: "100%",
                  }}
                >
                  <Database size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
                  Knowledge ({config.knowledge.length})
                </button>
                {expandedSection === "knowledge" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {config.knowledge.map(k =>
                      clickablePill(k, () => onOpenEditor(k + ".md", `/api/system/knowledge?key=${k}`, `/api/system/knowledge?key=${k}`))
                    )}
                  </div>
                )}
              </div>

              {/* Characters */}
              <div style={subCard}>
                <button
                  onClick={() => setExpandedSection(expandedSection === "characters" ? null : "characters")}
                  style={{
                    ...subHead, cursor: "pointer", background: "transparent", border: "none",
                    padding: 0, display: "flex", alignItems: "center", gap: 4, width: "100%",
                  }}
                >
                  <FolderCog size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
                  Characters ({config.characters.length})
                </button>
                {expandedSection === "characters" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {config.characters.map(c => {
                      const color = charColorMap[c.name] || "#6b7280";
                      return (
                        <span key={c.name} style={{
                          ...mono(T.small, color, 500),
                          padding: "1px 5px", borderRadius: 3,
                          background: color + "0a",
                          border: `1px solid ${color}18`,
                          display: "inline-flex", alignItems: "center", gap: 3,
                        }}>
                          {c.name}
                          <span style={{ ...mono(7, "var(--text-3)") }}>{c.tier}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <span style={mono(T.body, "var(--text-3)")}>Could not load configuration</span>
          )}
        </div>
      </div>
    </div>
  );
}
