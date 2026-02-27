"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Loader2, Settings, ArrowRight, Zap, MessageSquare, Clock,
  Plus, X, BookOpenCheck, Brain, AlertTriangle,
} from "lucide-react";
import { resolveIcon } from "@/lib/icon-map";
import type { ApiCharacter, ApiConfig, CharSchedule } from "./SystemGraph.types";
import FileEditorModal from "./FileEditorModal";
import SystemConfigDrawer from "./SystemConfigDrawer";
import StatsPanel from "./StatsPanel";

const F = "var(--font-mono)";
const mono = (size: number, color: string, weight = 400): React.CSSProperties => ({
  fontFamily: F, fontSize: size, fontWeight: weight, color, lineHeight: 1.4,
});
const T = { section: 11, body: 10, small: 9 } as const;

type CharAction = { label: string; icon: string; description: string; autonomous?: boolean };

type TraceData = {
  charId: string;
  charName: string;
  charColor: string;
  charIcon: string;
  actionLabel: string;
  actionDescription: string;
  autonomous: boolean;
  seedPrompt: string;
  model: string;
  skills: string[];
  knowledge: string[];
  outputs: string[];
  gates: string[];
};

type LiveCharData = { skills: string[]; routingKeywords: string[]; sharedKnowledge: string[]; schedules: CharSchedule[] };
type LiveFileStatus = {
  skills: { name: string; exists: boolean }[];
  knowledge: { name: string; exists: boolean }[];
  memoryExists: boolean;
};

/* ── Trace Panel ─────────────────────────────────────────────────── */

function TracePanel({ trace, onClose }: { trace: TraceData; onClose: () => void }) {
  const Icon = resolveIcon(trace.charIcon);
  const isChat = !trace.autonomous;

  type Step = { label: string; content: string; detail?: string; isCode?: boolean };

  const promptChain = [
    "System prompt",
    ...trace.knowledge,
    `${trace.charId}.memory.md`,
    ...trace.skills,
    ...(trace.autonomous ? ["SCHEDULED_AUTONOMY rules"] : []),
    ...(trace.charId === "architect" ? ["CHANGELOG.md"] : []),
  ];

  const steps: Step[] = [
    isChat
      ? { label: "TRIGGER", content: `Opens new Chat tab for ${trace.charName}`, detail: "Seed prompt sent as first user message" }
      : { label: "TRIGGER", content: "POST /api/schedule/run", detail: "Fire-and-forget (non-blocking)" },
    { label: "SEED", content: trace.seedPrompt || "(no seed prompt)", isCode: true },
    isChat
      ? { label: "API", content: "POST /api/chat", detail: "Response: Server-Sent Events (real-time streaming)" }
      : { label: "API", content: "POST /api/schedule/run", detail: "Response: JSON { ok, result: { response, durationMs } }" },
    { label: "PROMPT", content: promptChain.join("  \u2192  ") },
    { label: "SPAWN", content: `claude --model ${trace.model} --max-turns 25 --output-format stream-json --mcp-config mcp-tasks.json`, isCode: true },
    { label: "MCP", content: "tana-local \u00b7 supertag \u00b7 web-traversal" },
    isChat
      ? { label: "RESPONSE", content: "SSE stream \u2192 ChatWidget renders incrementally", detail: "Tool calls shown inline during streaming" }
      : { label: "RESPONSE", content: "Full output buffered \u2192 /data/job-results.json", detail: "Appears in Pipeline \u2192 LogsWidget" },
    ...(trace.outputs.length > 0 ? [{ label: "OUTPUTS", content: trace.outputs.join(" \u00b7 ") }] : []),
    ...(trace.gates.length > 0 ? [{ label: "GATES", content: trace.gates.join("; ") }] : []),
  ];

  return (
    <div style={{
      padding: "12px 14px", borderRadius: 6,
      background: "var(--surface)",
      border: `1px solid ${trace.charColor}20`,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon size={12} strokeWidth={1.5} style={{ color: trace.charColor }} />
          <span style={mono(T.section, trace.charColor, 700)}>{trace.charName}</span>
          <span style={mono(T.body, "var(--text-3)")}>{"\u2192"}</span>
          <span style={mono(T.section, "var(--text)", 600)}>{trace.actionLabel}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 18, height: 18, borderRadius: 3,
              background: "transparent", border: "none",
              cursor: "pointer", color: "var(--text-3)",
            }}
          ><X size={12} strokeWidth={2} /></button>
        </div>
      </div>

      {/* Description */}
      <div style={mono(T.small, "var(--text-3)")}>{trace.actionDescription}</div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {steps.map((step, i) => (
          <div key={i} style={{
            display: "flex", gap: 10,
            padding: "6px 0",
            borderTop: i > 0 ? "1px solid var(--border)" : "none",
          }}>
            <span style={{
              ...mono(8, "var(--text-3)", 700),
              width: 56, flexShrink: 0,
              textTransform: "uppercase", letterSpacing: "0.06em",
              paddingTop: 1,
            }}>{step.label}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                ...mono(step.isCode ? T.small : T.body, step.isCode ? "var(--text-3)" : "var(--text-2)"),
                wordBreak: "break-word",
                ...(step.isCode ? {
                  padding: "3px 6px", borderRadius: 3,
                  background: "var(--surface-2)", border: "1px solid var(--border)",
                } : {}),
              }}>
                {step.content}
              </div>
              {step.detail && (
                <div style={{ ...mono(T.small, "var(--text-3)"), marginTop: 2 }}>{step.detail}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Character Card ──────────────────────────────────────────────── */

function CharCard({
  char, activeTrace, onActionClick, expanded, onExpandToggle, onOpenEditor,
}: {
  char: ApiCharacter;
  activeTrace: { charId: string; actionLabel: string } | null;
  onActionClick: (char: ApiCharacter, action: CharAction) => void;
  expanded: boolean;
  onExpandToggle: () => void;
  onOpenEditor: (title: string, fetchUrl: string, saveUrl: string, lineLimit?: number) => void;
}) {
  const Icon = resolveIcon(char.icon);
  const charId = char.id;

  const [live, setLive] = useState<LiveCharData | null>(null);
  const [fileStatus, setFileStatus] = useState<LiveFileStatus | null>(null);
  const [addingKeyword, setAddingKeyword] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [addingSkill, setAddingSkill] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [newSchedName, setNewSchedName] = useState("");
  const [newSchedCron, setNewSchedCron] = useState("");
  const [saving, setSaving] = useState(false);
  const keywordInputRef = useRef<HTMLInputElement>(null);
  const skillInputRef = useRef<HTMLInputElement>(null);
  const schedNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!expanded) return;
    fetch(`/api/system/character?name=${charId}`).then(r => r.json())
      .then(res => { if (res.character) setLive({ skills: res.character.skills || [], routingKeywords: res.character.routingKeywords || [], sharedKnowledge: res.character.sharedKnowledge || [], schedules: res.character.schedules || [] }); })
      .catch(() => {});
    fetch(`/api/system/files?char=${charId}`).then(r => r.json())
      .then(res => { if (res.status) setFileStatus(res.status); })
      .catch(() => {});
  }, [expanded, charId]);

  const currentKeywords = live?.routingKeywords ?? char.routingKeywords;
  const currentSkills = live?.skills ?? char.skills;
  const currentKnowledge = live?.sharedKnowledge ?? char.sharedKnowledge;
  const currentSchedules: CharSchedule[] = live?.schedules ?? char.schedules ?? [];

  const updateChar = async (field: string, value: unknown) => {
    setSaving(true);
    try {
      await fetch(`/api/system/character?name=${charId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      setLive(prev => prev ? { ...prev, [field]: value } : prev);
    } finally { setSaving(false); }
  };

  const removeKeyword = (k: string) => updateChar("routingKeywords", currentKeywords.filter(x => x !== k));
  const addKeyword = () => {
    const k = newKeyword.trim().toLowerCase();
    if (!k || currentKeywords.includes(k)) return;
    updateChar("routingKeywords", [...currentKeywords, k]);
    setNewKeyword(""); setAddingKeyword(false);
  };
  const removeSkill = (s: string) => updateChar("skills", currentSkills.filter(x => x !== s));
  const addSkill = () => {
    const s = newSkill.trim().toLowerCase();
    if (!s || currentSkills.includes(s)) return;
    updateChar("skills", [...currentSkills, s]);
    setNewSkill(""); setAddingSkill(false);
  };
  const removeSchedule = (id: string) => updateChar("schedules", currentSchedules.filter(s => s.id !== id));
  const toggleSchedule = (id: string) => updateChar("schedules", currentSchedules.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  const addSchedule = () => {
    const name = newSchedName.trim();
    const cron = newSchedCron.trim();
    if (!name || !cron) return;
    const id = `${charId}-${name.toLowerCase().replace(/\s+/g, '-')}`;
    if (currentSchedules.some(s => s.id === id)) return;
    const sched: CharSchedule = { id, displayName: name, seedPrompt: "", cron, label: name.toLowerCase(), enabled: true };
    updateChar("schedules", [...currentSchedules, sched]);
    setNewSchedName(""); setNewSchedCron(""); setAddingSchedule(false);
  };

  const skillExists = (name: string) => !fileStatus || (fileStatus.skills.find(s => s.name === name)?.exists ?? true);
  const knowledgeExists = (name: string) => !fileStatus || (fileStatus.knowledge.find(k => k.name === name)?.exists ?? true);

  const sectionLabel: React.CSSProperties = { ...mono(T.small, "var(--text-3)"), textTransform: "uppercase", letterSpacing: "0.06em" };

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 6,
      padding: "10px 12px", borderRadius: 6,
      background: char.color + (expanded ? "0c" : "06"),
      border: `1px solid ${char.color}${expanded ? "30" : "15"}`,
      transition: "all 0.15s",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
          <Icon size={11} strokeWidth={1.5} style={{ color: char.color, flexShrink: 0 }} />
          <span style={mono(T.body, char.color, 700)}>{char.name}</span>
          <span style={{ ...mono(8, "var(--text-3)"), padding: "0 4px", borderRadius: 3, background: "var(--surface)", border: "1px solid var(--border)" }}>{char.model}</span>
          <span style={mono(8, "var(--text-3)")}>{char.domain}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {saving && <Loader2 size={8} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />}
          <button onClick={onExpandToggle} data-tip={`${char.name} options`} style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 18, height: 18, borderRadius: 3,
            background: expanded ? char.color + "18" : "transparent",
            border: `1px solid ${expanded ? char.color + "30" : "transparent"}`,
            cursor: "pointer", color: expanded ? char.color : "var(--text-3)", transition: "all 0.15s",
          }}><Settings size={10} strokeWidth={1.5} /></button>
        </div>
      </div>

      {/* Schedules */}
      {(expanded ? true : currentSchedules.some(s => s.enabled)) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {(expanded ? currentSchedules : currentSchedules.filter(s => s.enabled)).map(s => (
            <span key={s.id} data-tip={expanded ? "Click to toggle" : s.seedPrompt || s.displayName}
              onClick={expanded ? () => toggleSchedule(s.id) : undefined}
              style={{
                ...mono(8, s.enabled ? "var(--text-3)" : "var(--text-3)"), display: "inline-flex", alignItems: "center", gap: 3,
                padding: expanded ? "1px 4px 1px 5px" : "1px 5px", borderRadius: 3,
                background: "var(--surface)", border: "1px solid var(--border)",
                opacity: s.enabled ? 1 : 0.4,
                cursor: expanded ? "pointer" : "default",
                transition: "opacity 0.1s",
              }}>
              <Clock size={7} strokeWidth={1.5} style={{ color: char.color, flexShrink: 0 }} />
              {s.displayName} {s.cron}
              {expanded && (
                <button onClick={e => { e.stopPropagation(); removeSchedule(s.id); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 12, height: 12, borderRadius: 2, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", opacity: 0.4 }}><X size={7} strokeWidth={2} /></button>
              )}
            </span>
          ))}
          {expanded && (
            addingSchedule ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                <input ref={schedNameRef} value={newSchedName} onChange={e => setNewSchedName(e.target.value)} placeholder="name"
                  onKeyDown={e => { if (e.key === "Escape") { setAddingSchedule(false); setNewSchedName(""); setNewSchedCron(""); } }}
                  style={{ ...mono(8, "var(--text-2)"), width: 60, padding: "1px 4px", borderRadius: 3, background: "var(--surface)", border: "1px solid var(--border)", outline: "none" }} />
                <input value={newSchedCron} onChange={e => setNewSchedCron(e.target.value)} placeholder="08:00 daily"
                  onKeyDown={e => { if (e.key === "Enter") addSchedule(); if (e.key === "Escape") { setAddingSchedule(false); setNewSchedName(""); setNewSchedCron(""); } }}
                  onBlur={() => { if (newSchedName.trim() && newSchedCron.trim()) addSchedule(); else if (!newSchedName.trim() && !newSchedCron.trim()) setAddingSchedule(false); }}
                  style={{ ...mono(8, "var(--text-2)"), width: 80, padding: "1px 4px", borderRadius: 3, background: "var(--surface)", border: "1px solid var(--border)", outline: "none" }} />
              </span>
            ) : (
              <button onClick={() => { setAddingSchedule(true); setTimeout(() => schedNameRef.current?.focus(), 50); }} style={{
                display: "flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: 3,
                background: "var(--surface)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-3)",
              }}><Plus size={8} strokeWidth={2} /></button>
            )
          )}
        </div>
      )}
      {expanded && currentSchedules.length === 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={mono(8, "var(--text-3)")}>No schedules</span>
          {addingSchedule ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
              <input ref={schedNameRef} value={newSchedName} onChange={e => setNewSchedName(e.target.value)} placeholder="name"
                onKeyDown={e => { if (e.key === "Escape") { setAddingSchedule(false); setNewSchedName(""); setNewSchedCron(""); } }}
                style={{ ...mono(8, "var(--text-2)"), width: 60, padding: "1px 4px", borderRadius: 3, background: "var(--surface)", border: "1px solid var(--border)", outline: "none" }} />
              <input value={newSchedCron} onChange={e => setNewSchedCron(e.target.value)} placeholder="08:00 daily"
                onKeyDown={e => { if (e.key === "Enter") addSchedule(); if (e.key === "Escape") { setAddingSchedule(false); setNewSchedName(""); setNewSchedCron(""); } }}
                onBlur={() => { if (newSchedName.trim() && newSchedCron.trim()) addSchedule(); else if (!newSchedName.trim() && !newSchedCron.trim()) setAddingSchedule(false); }}
                style={{ ...mono(8, "var(--text-2)"), width: 80, padding: "1px 4px", borderRadius: 3, background: "var(--surface)", border: "1px solid var(--border)", outline: "none" }} />
            </span>
          ) : (
            <button onClick={() => { setAddingSchedule(true); setTimeout(() => schedNameRef.current?.focus(), 50); }} style={{
              display: "flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: 3,
              background: "var(--surface)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-3)",
            }}><Plus size={8} strokeWidth={2} /></button>
          )}
        </div>
      )}

      {/* Actions — clickable to show trace */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        {(char.actions as CharAction[]).map(a => {
          const AIcon = resolveIcon(a.icon);
          const isActive = activeTrace?.charId === char.id && activeTrace?.actionLabel === a.label;
          return (
            <button key={a.label} onClick={() => onActionClick(char, a)} data-tip={a.description} style={{
              display: "inline-flex", alignItems: "center", gap: 2,
              padding: "2px 6px 2px 4px", borderRadius: 3,
              background: isActive ? char.color + "20" : char.color + "0a",
              border: `1px solid ${isActive ? char.color + "40" : char.color + "18"}`,
              cursor: "pointer", transition: "all 0.1s",
            }}>
              <AIcon size={8} strokeWidth={1.5} style={{ color: char.color }} />
              <span style={mono(8, char.color, isActive ? 700 : 500)}>{a.label}</span>
            </button>
          );
        })}
      </div>

      {/* Outputs */}
      {char.outputs.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 3, paddingTop: 4, borderTop: `1px solid ${char.color}10` }}>
          <ArrowRight size={8} strokeWidth={1.5} style={{ color: "var(--text-3)", flexShrink: 0 }} />
          <span style={mono(8, "var(--text-3)")}>{char.outputs.join(" \u00b7 ")}</span>
        </div>
      )}

      {/* ── Expanded: editable config ── */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${char.color}15`, paddingTop: 10, marginTop: 2, display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Routing keywords */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
              <span style={sectionLabel}>Routing Keywords</span>
              <button onClick={() => { setAddingKeyword(true); setTimeout(() => keywordInputRef.current?.focus(), 50); }} style={{
                display: "flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: 3,
                background: char.color + "10", border: `1px solid ${char.color}20`, cursor: "pointer", color: char.color,
              }}><Plus size={8} strokeWidth={2} /></button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {currentKeywords.map(k => (
                <span key={k} style={{ ...mono(T.small, char.color, 500), padding: "1px 4px 1px 5px", borderRadius: 3, background: char.color + "0c", border: `1px solid ${char.color}18`, display: "inline-flex", alignItems: "center", gap: 2 }}>
                  {k}
                  <button onClick={() => removeKeyword(k)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 12, height: 12, borderRadius: 2, background: "transparent", border: "none", cursor: "pointer", color: char.color, opacity: 0.4 }}><X size={7} strokeWidth={2} /></button>
                </span>
              ))}
              {addingKeyword && (
                <input ref={keywordInputRef} value={newKeyword} onChange={e => setNewKeyword(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addKeyword(); if (e.key === "Escape") { setAddingKeyword(false); setNewKeyword(""); } }}
                  onBlur={() => { if (newKeyword.trim()) addKeyword(); else setAddingKeyword(false); }}
                  placeholder="keyword" style={{ ...mono(T.small, char.color, 500), width: 70, padding: "1px 5px", borderRadius: 3, background: char.color + "08", border: `1px solid ${char.color}30`, outline: "none" }}
                />
              )}
            </div>
          </div>

          {/* Gates */}
          {char.gates.length > 0 && (
            <div>
              <span style={{ ...sectionLabel, display: "block", marginBottom: 3 }}>Gates</span>
              {char.gates.map(g => (
                <div key={g} style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                  <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
                  <span style={mono(T.small, "var(--text-2)")}>{g}</span>
                </div>
              ))}
            </div>
          )}

          {/* Skills */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
              <span style={sectionLabel}>Skills</span>
              <button onClick={() => { setAddingSkill(true); setTimeout(() => skillInputRef.current?.focus(), 50); }} style={{
                display: "flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: 3,
                background: "var(--border)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-3)",
              }}><Plus size={8} strokeWidth={2} /></button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {currentSkills.map(s => {
                const exists = skillExists(s);
                return (
                  <span key={s} onClick={() => onOpenEditor(s, `/api/system/skill?name=${s}`, `/api/system/skill?name=${s}`)} style={{
                    ...mono(T.small, exists ? "var(--text-2)" : "#ef4444"), padding: "1px 4px 1px 5px", borderRadius: 3,
                    background: exists ? "var(--surface)" : "#ef44440a", border: `1px solid ${exists ? "var(--border)" : "#ef444430"}`,
                    display: "inline-flex", alignItems: "center", gap: 2, cursor: "pointer", transition: "all 0.1s",
                  }}>
                    {!exists && <AlertTriangle size={7} strokeWidth={2} style={{ color: "#ef4444", flexShrink: 0 }} />}
                    {s}
                    <button onClick={e => { e.stopPropagation(); removeSkill(s); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 12, height: 12, borderRadius: 2, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", opacity: 0.4 }}><X size={7} strokeWidth={2} /></button>
                  </span>
                );
              })}
              {addingSkill && (
                <input ref={skillInputRef} value={newSkill} onChange={e => setNewSkill(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addSkill(); if (e.key === "Escape") { setAddingSkill(false); setNewSkill(""); } }}
                  onBlur={() => { if (newSkill.trim()) addSkill(); else setAddingSkill(false); }}
                  placeholder="skill-name" style={{ ...mono(T.small, "var(--text-2)"), width: 100, padding: "1px 5px", borderRadius: 3, background: "var(--surface)", border: "1px solid var(--border)", outline: "none" }}
                />
              )}
            </div>
          </div>

          {/* Knowledge */}
          {currentKnowledge.length > 0 && (
            <div>
              <span style={{ ...sectionLabel, display: "block", marginBottom: 4 }}>Knowledge</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                {currentKnowledge.map(k => {
                  const exists = knowledgeExists(k);
                  return (
                    <span key={k} onClick={() => onOpenEditor(k + ".md", `/api/system/knowledge?key=${k}`, `/api/system/knowledge?key=${k}`)} style={{
                      ...mono(T.small, exists ? "var(--text-2)" : "#ef4444"), padding: "1px 5px", borderRadius: 3,
                      background: exists ? "var(--surface)" : "#ef44440a", border: `1px solid ${exists ? "var(--border)" : "#ef444430"}`,
                      cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, transition: "all 0.1s",
                    }}>
                      {!exists && <AlertTriangle size={7} strokeWidth={2} style={{ color: "#ef4444", flexShrink: 0 }} />}
                      <BookOpenCheck size={8} strokeWidth={1.5} style={{ color: exists ? "#0891b2" : "#ef4444" }} />
                      {k}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Memory */}
          <div>
            <span onClick={() => onOpenEditor(`${charId}.memory.md`, `/api/system/memory?char=${charId}`, `/api/system/memory?char=${charId}`, 100)} style={{
              ...mono(T.small, fileStatus && !fileStatus.memoryExists ? "#ef4444" : "var(--text-2)"),
              padding: "1px 5px", borderRadius: 3,
              background: fileStatus && !fileStatus.memoryExists ? "#ef44440a" : "var(--surface)",
              border: `1px solid ${fileStatus && !fileStatus.memoryExists ? "#ef444430" : "var(--border)"}`,
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, transition: "all 0.1s",
            }}>
              {fileStatus && !fileStatus.memoryExists && <AlertTriangle size={7} strokeWidth={2} style={{ color: "#ef4444", flexShrink: 0 }} />}
              <Brain size={8} strokeWidth={1.5} style={{ color: fileStatus && !fileStatus.memoryExists ? "#ef4444" : "#7c3aed" }} />
              Memory
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────── */

export default function FlowExplorer() {
  const [apiChars, setApiChars] = useState<ApiCharacter[]>([]);
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [expandedChar, setExpandedChar] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ title: string; content: string; saveUrl: string; lineLimit?: number } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/characters").then(r => r.json()),
      fetch("/api/system/config").then(r => r.json()),
    ]).then(([charData, configData]) => {
      setApiChars(charData.characters || []);
      setApiConfig(configData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const openEditor = useCallback(async (title: string, fetchUrl: string, saveUrl: string, lineLimit?: number) => {
    try {
      const res = await fetch(fetchUrl);
      const data = await res.json();
      if (data.content !== undefined) {
        setEditor({ title, content: data.content, saveUrl, lineLimit });
      } else if (data.error) {
        setEditor({ title, content: `---\nname: ${title.replace('.md', '')}\ndescription: \n---\n\n`, saveUrl, lineLimit });
      }
    } catch {}
  }, []);

  const handleEditorSave = useCallback(async (content: string) => {
    if (!editor) return;
    await fetch(editor.saveUrl, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
  }, [editor]);

  const charColorMap = useMemo(() =>
    Object.fromEntries(apiChars.map(c => [c.id, c.color])),
    [apiChars]
  );

  const postman = apiChars.find(c => c.id === "postman");
  const characters = apiChars.filter(c => c.id !== "postman" && c.tier !== "stationed");
  const sources = apiConfig?.sources || [];
  const outputs = apiConfig?.outputs || [];

  const handleActionClick = (char: ApiCharacter, action: CharAction) => {
    if (trace?.charId === char.id && trace?.actionLabel === action.label) {
      setTrace(null);
      return;
    }
    setTrace({
      charId: char.id, charName: char.name, charColor: char.color, charIcon: char.icon,
      actionLabel: action.label, actionDescription: action.description,
      autonomous: (action as CharAction).autonomous === true,
      seedPrompt: char.seeds?.[action.label] || "",
      model: char.model, skills: char.skills, knowledge: char.sharedKnowledge,
      outputs: char.outputs, gates: char.gates,
    });
  };

  if (loading) {
    return (
      <div className="widget" style={{ overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="widget-header"><span className="widget-header-label">Flow Explorer</span></div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Loader2 size={14} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
          <span style={{ fontFamily: F, fontSize: 10, color: "var(--text-3)" }}>Loading system data...</span>
        </div>
      </div>
    );
  }

  const activeTrace = trace ? { charId: trace.charId, actionLabel: trace.actionLabel } : null;

  return (
    <div className="widget" style={{ overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="widget-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="widget-header-label">Flow Explorer</span>
        <button onClick={() => setShowConfig(true)} style={{
          display: "flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 3,
          background: "transparent", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-3)", fontFamily: F, fontSize: 9,
        }}>
          <Settings size={10} strokeWidth={1.5} />
          Config
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Pipeline overview */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
          padding: "8px 10px", borderRadius: 5,
          background: "var(--surface)", border: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            {sources.map(s => (
              <span key={s.label} style={{ ...mono(8, s.color, 500), padding: "1px 5px", borderRadius: 3, background: s.color + "0a", border: `1px solid ${s.color}18` }}>{s.label}</span>
            ))}
          </div>
          <ArrowRight size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
          <span style={mono(T.small, postman?.color || "var(--text-2)", 600)}>Postman</span>
          <ArrowRight size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
          <span style={mono(T.small, "#f59e0b", 600)}>#post</span>
          <ArrowRight size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
          <span style={mono(T.small, "#f59e0b", 600)}>#task</span>
          <ArrowRight size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
          <span style={mono(T.small, "var(--text-2)")}>Characters</span>
          <ArrowRight size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            {outputs.map(o => (
              <span key={o.label} style={{ ...mono(8, o.color, 500), padding: "1px 5px", borderRadius: 3, background: o.color + "0a", border: `1px solid ${o.color}18` }}>{o.label}</span>
            ))}
          </div>
        </div>

        {/* Hint */}
        {!trace && (
          <div style={mono(T.small, "var(--text-3)")}>Click any action button to see its execution flow.</div>
        )}

        {/* Trace panel */}
        {trace && <TracePanel trace={trace} onClose={() => setTrace(null)} />}

        {/* Character grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8, alignItems: "start" }}>
          {postman && (
            <CharCard char={postman} activeTrace={activeTrace}
              onActionClick={handleActionClick} expanded={expandedChar === postman.id}
              onExpandToggle={() => setExpandedChar(prev => prev === postman.id ? null : postman.id)} onOpenEditor={openEditor} />
          )}
          {characters.map(c => (
            <CharCard key={c.id} char={c} activeTrace={activeTrace}
              onActionClick={handleActionClick} expanded={expandedChar === c.id}
              onExpandToggle={() => setExpandedChar(prev => prev === c.id ? null : c.id)} onOpenEditor={openEditor} />
          ))}
        </div>

        {/* System statistics */}
        <StatsPanel />
      </div>

      {showConfig && <SystemConfigDrawer onClose={() => setShowConfig(false)} onOpenEditor={openEditor} charColorMap={charColorMap} />}
      {editor && <FileEditorModal title={editor.title} content={editor.content} onSave={handleEditorSave} onClose={() => setEditor(null)} lineLimit={editor.lineLimit} />}
    </div>
  );
}
