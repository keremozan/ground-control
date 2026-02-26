"use client";
import { useState, useEffect, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Settings, Plus, X, Loader2, BookOpenCheck, Brain, AlertTriangle,
  ArrowRight, Clock,
  type LucideIcon,
} from "lucide-react";
import type { CharacterNodeData } from "../SystemGraph.types";

const F = "var(--font-mono)";
const mono = (size: number, color: string, weight = 400): React.CSSProperties => ({
  fontFamily: F, fontSize: size, fontWeight: weight, color, lineHeight: 1.4,
});
const T = { section: 11, body: 10, small: 9 } as const;

type LiveCharData = {
  skills: string[];
  routingKeywords: string[];
  sharedKnowledge: string[];
};

type LiveFileStatus = {
  skills: { name: string; exists: boolean }[];
  knowledge: { name: string; exists: boolean }[];
  memoryExists: boolean;
};

export default function CharacterNode({ data }: NodeProps) {
  const d = data as unknown as CharacterNodeData;
  const Icon = d.icon;
  const charId = d.id;

  const [expanded, setExpanded] = useState(false);
  const [live, setLive] = useState<LiveCharData | null>(null);
  const [fileStatus, setFileStatus] = useState<LiveFileStatus | null>(null);
  const [addingKeyword, setAddingKeyword] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [addingSkill, setAddingSkill] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const [saving, setSaving] = useState(false);
  const keywordInputRef = useRef<HTMLInputElement>(null);
  const skillInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!expanded) return;
    fetch(`/api/system/character?name=${charId}`)
      .then(r => r.json())
      .then(res => {
        if (res.character) {
          setLive({
            skills: res.character.skills || [],
            routingKeywords: res.character.routingKeywords || [],
            sharedKnowledge: res.character.sharedKnowledge || [],
          });
        }
      })
      .catch(() => {});
    fetch(`/api/system/files?char=${charId}`)
      .then(r => r.json())
      .then(res => { if (res.status) setFileStatus(res.status); })
      .catch(() => {});
  }, [expanded, charId]);

  const currentKeywords = live?.routingKeywords ?? d.routing;
  const currentSkills = live?.skills ?? d.skills;
  const currentKnowledge = live?.sharedKnowledge ?? d.sharedKnowledge;

  const updateChar = async (field: string, value: string[]) => {
    setSaving(true);
    try {
      await fetch(`/api/system/character?name=${charId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      setLive(prev => prev ? { ...prev, [field]: value } : prev);
    } finally {
      setSaving(false);
    }
  };

  const removeKeyword = (k: string) => updateChar("routingKeywords", currentKeywords.filter(x => x !== k));
  const addKeyword = () => {
    const k = newKeyword.trim().toLowerCase();
    if (!k || currentKeywords.includes(k)) return;
    updateChar("routingKeywords", [...currentKeywords, k]);
    setNewKeyword("");
    setAddingKeyword(false);
  };
  const removeSkill = (s: string) => updateChar("skills", currentSkills.filter(x => x !== s));
  const addSkill = () => {
    const s = newSkill.trim().toLowerCase();
    if (!s || currentSkills.includes(s)) return;
    updateChar("skills", [...currentSkills, s]);
    setNewSkill("");
    setAddingSkill(false);
  };

  const skillFileExists = (name: string) => {
    if (!fileStatus) return true;
    return fileStatus.skills.find(s => s.name === name)?.exists ?? false;
  };
  const knowledgeFileExists = (name: string) => {
    if (!fileStatus) return true;
    return fileStatus.knowledge.find(k => k.name === name)?.exists ?? false;
  };

  const sectionLabel: React.CSSProperties = {
    ...mono(T.small, "var(--text-3)"),
    textTransform: "uppercase", letterSpacing: "0.06em",
  };

  return (
    <div
      className="nowheel nodrag nopan"
      style={{
        display: "flex", flexDirection: "column", gap: 6,
        padding: "10px 12px", borderRadius: 6,
        background: d.color + (expanded ? "0c" : "06"),
        border: `1px solid ${d.color}${expanded ? "30" : "15"}`,
        transition: "all 0.15s",
        width: 280,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 6, height: 6 }} />

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
          <Icon size={11} strokeWidth={1.5} style={{ color: d.color, flexShrink: 0 }} />
          <span style={mono(T.body, d.color, 700)}>{d.name}</span>
          <span style={{
            ...mono(8, "var(--text-3)"),
            padding: "0 4px", borderRadius: 3,
            background: "var(--surface)", border: "1px solid var(--border)",
          }}>{d.model}</span>
          <span style={mono(8, "var(--text-3)")}>{d.domain}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {saving && <Loader2 size={8} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />}
          <button
            onClick={() => setExpanded(prev => !prev)}
            title={`${d.name} options`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 18, height: 18, borderRadius: 3,
              background: expanded ? d.color + "18" : "transparent",
              border: `1px solid ${expanded ? d.color + "30" : "transparent"}`,
              cursor: "pointer", color: expanded ? d.color : "var(--text-3)",
              transition: "all 0.15s",
            }}
          >
            <Settings size={10} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ── Schedules ── */}
      {d.schedules.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {d.schedules.map((s, i) => (
            <span key={`${s.displayName}-${i}`} style={{
              ...mono(8, "var(--text-3)"),
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "1px 5px", borderRadius: 3,
              background: "var(--surface)", border: "1px solid var(--border)",
            }}>
              <Clock size={7} strokeWidth={1.5} style={{ color: d.color, flexShrink: 0 }} />
              {s.displayName} {s.cron}
            </span>
          ))}
        </div>
      )}

      {/* ── Crew shortcuts ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        {d.actions.map(a => {
          const AIcon = a.icon;
          return (
            <span key={a.label} style={{
              display: "inline-flex", alignItems: "center", gap: 2,
              padding: "2px 6px 2px 4px", borderRadius: 3,
              background: d.color + "0a", border: `1px solid ${d.color}18`,
            }} title={a.description}>
              <AIcon size={8} strokeWidth={1.5} style={{ color: d.color }} />
              <span style={mono(8, d.color, 500)}>{a.label}</span>
            </span>
          );
        })}
      </div>

      {/* ── Outputs ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 3,
        paddingTop: 4, borderTop: `1px solid ${d.color}10`,
      }}>
        <ArrowRight size={8} strokeWidth={1.5} style={{ color: "var(--text-3)", flexShrink: 0 }} />
        <span style={mono(8, "var(--text-3)")}>{d.outputs.join(" · ")}</span>
      </div>

      {/* ── Expanded: editable options ── */}
      {expanded && (
        <div style={{
          borderTop: `1px solid ${d.color}15`,
          paddingTop: 10, marginTop: 2,
          display: "flex", flexDirection: "column", gap: 12,
        }}>

          {/* Routing keywords */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
              <span style={sectionLabel}>Routing Keywords</span>
              <button
                onClick={() => { setAddingKeyword(true); setTimeout(() => keywordInputRef.current?.focus(), 50); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 14, height: 14, borderRadius: 3,
                  background: d.color + "10", border: `1px solid ${d.color}20`,
                  cursor: "pointer", color: d.color,
                }}
              ><Plus size={8} strokeWidth={2} /></button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {currentKeywords.map(k => (
                <span key={k} style={{
                  ...mono(T.small, d.color, 500),
                  padding: "1px 4px 1px 5px", borderRadius: 3,
                  background: d.color + "0c", border: `1px solid ${d.color}18`,
                  display: "inline-flex", alignItems: "center", gap: 2,
                }}>
                  {k}
                  <button
                    onClick={() => removeKeyword(k)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 12, height: 12, borderRadius: 2,
                      background: "transparent", border: "none",
                      cursor: "pointer", color: d.color, opacity: 0.4,
                    }}
                  ><X size={7} strokeWidth={2} /></button>
                </span>
              ))}
              {addingKeyword && (
                <input
                  ref={keywordInputRef}
                  value={newKeyword}
                  onChange={e => setNewKeyword(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addKeyword(); if (e.key === "Escape") { setAddingKeyword(false); setNewKeyword(""); } }}
                  onBlur={() => { if (newKeyword.trim()) addKeyword(); else setAddingKeyword(false); }}
                  placeholder="keyword"
                  style={{
                    ...mono(T.small, d.color, 500),
                    width: 70, padding: "1px 5px", borderRadius: 3,
                    background: d.color + "08", border: `1px solid ${d.color}30`, outline: "none",
                  }}
                />
              )}
            </div>
          </div>

          {/* Gates */}
          {d.gates && d.gates.length > 0 && (
            <div>
              <span style={{ ...sectionLabel, display: "block", marginBottom: 3 }}>Gates</span>
              {d.gates.map(g => (
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
              <button
                onClick={() => { setAddingSkill(true); setTimeout(() => skillInputRef.current?.focus(), 50); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 14, height: 14, borderRadius: 3,
                  background: "var(--border)", border: "1px solid var(--border)",
                  cursor: "pointer", color: "var(--text-3)",
                }}
              ><Plus size={8} strokeWidth={2} /></button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {currentSkills.map(s => {
                const exists = skillFileExists(s);
                return (
                  <span key={s} style={{
                    ...mono(T.small, exists ? "var(--text-2)" : "#ef4444"),
                    padding: "1px 4px 1px 5px", borderRadius: 3,
                    background: exists ? "var(--surface)" : "#ef44440a",
                    border: `1px solid ${exists ? "var(--border)" : "#ef444430"}`,
                    display: "inline-flex", alignItems: "center", gap: 2,
                    cursor: "pointer", transition: "all 0.1s",
                  }}
                    onClick={() => d.onOpenEditor(s, `/api/system/skill?name=${s}`, `/api/system/skill?name=${s}`)}
                  >
                    {!exists && <AlertTriangle size={7} strokeWidth={2} style={{ color: "#ef4444", flexShrink: 0 }} />}
                    {s}
                    <button
                      onClick={e => { e.stopPropagation(); removeSkill(s); }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 12, height: 12, borderRadius: 2,
                        background: "transparent", border: "none",
                        cursor: "pointer", color: "var(--text-3)", opacity: 0.4,
                      }}
                    ><X size={7} strokeWidth={2} /></button>
                  </span>
                );
              })}
              {addingSkill && (
                <input
                  ref={skillInputRef}
                  value={newSkill}
                  onChange={e => setNewSkill(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addSkill(); if (e.key === "Escape") { setAddingSkill(false); setNewSkill(""); } }}
                  onBlur={() => { if (newSkill.trim()) addSkill(); else setAddingSkill(false); }}
                  placeholder="skill-name"
                  style={{
                    ...mono(T.small, "var(--text-2)"),
                    width: 100, padding: "1px 5px", borderRadius: 3,
                    background: "var(--surface)", border: "1px solid var(--border)", outline: "none",
                  }}
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
                  const exists = knowledgeFileExists(k);
                  return (
                    <span key={k} style={{
                      ...mono(T.small, exists ? "var(--text-2)" : "#ef4444"),
                      padding: "1px 5px", borderRadius: 3,
                      background: exists ? "var(--surface)" : "#ef44440a",
                      border: `1px solid ${exists ? "var(--border)" : "#ef444430"}`,
                      cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3,
                      transition: "all 0.1s",
                    }}
                      onClick={() => d.onOpenEditor(k + ".md", `/api/system/knowledge?key=${k}`, `/api/system/knowledge?key=${k}`)}
                    >
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
            <span style={{
              ...mono(T.small, fileStatus && !fileStatus.memoryExists ? "#ef4444" : "var(--text-2)"),
              padding: "1px 5px", borderRadius: 3,
              background: fileStatus && !fileStatus.memoryExists ? "#ef44440a" : "var(--surface)",
              border: `1px solid ${fileStatus && !fileStatus.memoryExists ? "#ef444430" : "var(--border)"}`,
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3,
              transition: "all 0.1s",
            }}
              onClick={() => d.onOpenEditor(`${charId}.memory.md`, `/api/system/memory?char=${charId}`, `/api/system/memory?char=${charId}`, 100)}
            >
              {fileStatus && !fileStatus.memoryExists && <AlertTriangle size={7} strokeWidth={2} style={{ color: "#ef4444", flexShrink: 0 }} />}
              <Brain size={8} strokeWidth={1.5} style={{ color: fileStatus && !fileStatus.memoryExists ? "#ef4444" : "#7c3aed" }} />
              Memory
            </span>
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} id="right" style={{ opacity: 0, width: 6, height: 6 }} />
    </div>
  );
}
