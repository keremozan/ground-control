"use client";
import { useState, useEffect, useRef } from "react";
import { X, Brain, Route, BookOpen, FileText, Plus } from "lucide-react";
import FileEditorModal from "./FileEditorModal";

type CharacterInfo = { id: string; name: string; color: string; skills?: string[]; routingKeywords?: string[]; sharedKnowledge?: string[] };
type Tab = "skills" | "keywords" | "knowledge" | "memory";
const TABS: { key: Tab; label: string; icon: typeof Brain }[] = [
  { key: "skills", label: "Skills", icon: Brain }, { key: "keywords", label: "Keywords", icon: Route },
  { key: "knowledge", label: "Knowledge", icon: BookOpen }, { key: "memory", label: "Memory", icon: FileText },
];
const mono = (size: number, extra?: React.CSSProperties): React.CSSProperties => ({ fontFamily: "var(--font-mono)", fontSize: size, ...extra });
const Empty = ({ text }: { text: string }) => <span style={mono(10, { color: "var(--text-3)" })}>{text}</span>;

function ListButton({ label, hint, color, onClick }: { label: string; hint: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: "6px 10px", borderRadius: 4, background: "var(--surface-2)", border: "1px solid transparent", ...mono(11), color: "var(--text)", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = color + "40")} onMouseLeave={e => (e.currentTarget.style.borderColor = "transparent")}>
      <span>{label}</span><span style={{ fontSize: 9, color, opacity: 0.7 }}>{hint}</span>
    </button>
  );
}

export default function CharDetailDrawer({ character, open, onClose, contained }: { character: CharacterInfo; open: boolean; onClose: () => void; contained?: boolean }) {
  const [tab, setTab] = useState<Tab>("skills");
  const [memContent, setMemContent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedKnowledge, setSelectedKnowledge] = useState<string | null>(null);
  const [knowledgeContent, setKnowledgeContent] = useState<string | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState<string | null>(null);
  const [skillLoading, setSkillLoading] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const newKeywordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTab("skills"); setMemContent(null); setEditing(false);
    setSelectedKnowledge(null); setKnowledgeContent(null);
    setSelectedSkill(null); setSkillContent(null);
    setKeywords(character.routingKeywords || []); setNewKeyword("");
  }, [open, character.id]);

  useEffect(() => {
    if (open && tab === "memory" && memContent === null)
      fetch(`/api/system/memory?char=${character.id}`).then(r => r.json()).then(raw => { const d = raw?.data ?? raw; setMemContent(d.content || ""); }).catch(() => setMemContent(""));
  }, [open, tab, character.id, memContent]);

  if (!open) return null;
  const skills = character.skills || [];
  const knowledge = character.sharedKnowledge || [];
  const pos = contained ? "absolute" : "fixed";
  const z = contained ? 10 : 900;

  const fetchAndSet = async (url: string, setter: (v: string) => void, loadSetter: (v: boolean) => void) => {
    loadSetter(true);
    try { const r = await fetch(url); const raw = await r.json(); const d = raw?.data ?? raw; setter(d.content ?? ""); } catch { setter(""); } finally { loadSetter(false); }
  };
  const saveAndClear = async (url: string, content: string, setter: (v: string) => void, closer: (v: null) => void) => {
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
    setter(content); closer(null);
  };
  const handleSkillClick = (name: string) => { setSelectedSkill(name); setSkillContent(null); fetchAndSet(`/api/system/skill?name=${name}`, setSkillContent, setSkillLoading); };
  const handleSkillSave = async (content: string) => { if (selectedSkill) await saveAndClear(`/api/system/skill?name=${selectedSkill}`, content, setSkillContent, setSelectedSkill); };
  const handleKnowledgeClick = (key: string) => { setSelectedKnowledge(key); setKnowledgeContent(null); fetchAndSet(`/api/system/knowledge?key=${key}`, setKnowledgeContent, setKnowledgeLoading); };
  const handleKnowledgeSave = async (content: string) => { if (selectedKnowledge) await saveAndClear(`/api/system/knowledge?key=${selectedKnowledge}`, content, setKnowledgeContent, setSelectedKnowledge); };

  const saveKeywords = async (next: string[]) => {
    setKeywords(next);
    await fetch(`/api/system/character?name=${character.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ routingKeywords: next }) });
  };
  const addKeyword = () => { const kw = newKeyword.trim().toLowerCase(); if (!kw || keywords.includes(kw)) { setNewKeyword(""); return; } saveKeywords([...keywords, kw]); setNewKeyword(""); setTimeout(() => newKeywordRef.current?.focus(), 50); };
  const handleMemSave = async (content: string) => {
    await fetch(`/api/system/memory?char=${character.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
    setMemContent(content); setEditing(false);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: pos, inset: 0, zIndex: z, background: "rgba(0,0,0,0.2)" }} />
      <div style={{ position: pos, top: 0, right: 0, bottom: 0, zIndex: z + 1, width: contained ? "100%" : "min(380px, 90vw)", background: "var(--surface)", borderLeft: contained ? "none" : "1px solid var(--border)", boxShadow: "-4px 0 20px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", animation: "slideIn 0.15s ease-out" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: character.color }} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{character.name}</span>
          </div>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)" }}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", padding: "0 12px" }}>
          {TABS.map(t => { const Icon = t.icon; const active = tab === t.key; return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 10px", ...mono(10, { fontWeight: active ? 600 : 400 }), color: active ? character.color : "var(--text-3)", background: "transparent", border: "none", borderBottom: active ? `2px solid ${character.color}` : "2px solid transparent", cursor: "pointer", transition: "all 0.12s" }}>
              <Icon size={10} strokeWidth={1.5} />{t.label}
            </button>
          ); })}
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
          {tab === "skills" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {skills.length === 0 && <Empty text="No skills configured" />}
              {skillLoading && <Empty text="Loading..." />}
              {skills.map(s => <ListButton key={s} label={s} hint="edit" color={character.color} onClick={() => handleSkillClick(s)} />)}
            </div>
          )}
          {tab === "keywords" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {keywords.length === 0 && <Empty text="No routing keywords" />}
                {keywords.map(k => (
                  <span key={k} style={{ padding: "3px 8px", borderRadius: 3, background: character.color + "12", border: `1px solid ${character.color}24`, ...mono(10), color: character.color, display: "flex", alignItems: "center", gap: 4 }}>
                    {k}
                    <button onClick={() => saveKeywords(keywords.filter(x => x !== k))} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 12, height: 12, borderRadius: 2, background: "transparent", border: "none", cursor: "pointer", color: character.color, opacity: 0.5, padding: 0 }} onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}>
                      <X size={8} strokeWidth={2} />
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input ref={newKeywordRef} value={newKeyword} onChange={e => setNewKeyword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addKeyword(); }} placeholder="Add keyword..." style={{ flex: 1, ...mono(10), padding: "4px 8px", borderRadius: 4, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }} />
                <button onClick={addKeyword} disabled={!newKeyword.trim()} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 4, background: newKeyword.trim() ? character.color + "18" : "transparent", border: `1px solid ${newKeyword.trim() ? character.color + "40" : "var(--border)"}`, cursor: newKeyword.trim() ? "pointer" : "default", color: newKeyword.trim() ? character.color : "var(--text-3)" }}>
                  <Plus size={12} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}
          {tab === "knowledge" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {knowledgeLoading && <Empty text="Loading..." />}
              {knowledge.length === 0 && <Empty text="No knowledge files" />}
              {knowledge.map(k => <ListButton key={k} label={`${k}.md`} hint="edit" color={character.color} onClick={() => handleKnowledgeClick(k)} />)}
            </div>
          )}
          {tab === "memory" && (
            <div>
              {memContent === null ? <Empty text="Loading..." /> : memContent === "" ? <Empty text="Memory file is empty" /> : (
                <pre style={{ ...mono(10, { lineHeight: 1.6 }), color: "var(--text-2)", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, padding: 0 }}>{memContent}</pre>
              )}
              <button onClick={() => setEditing(true)} style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 4, background: "transparent", border: `1px solid ${character.color}30`, color: character.color, ...mono(10), cursor: "pointer" }}>
                <FileText size={10} strokeWidth={1.5} /> Edit memory
              </button>
            </div>
          )}
        </div>
      </div>
      {selectedSkill !== null && !skillLoading && skillContent !== null && (
        <FileEditorModal title={`${selectedSkill}/SKILL.md`} content={skillContent} onSave={handleSkillSave} onClose={() => { setSelectedSkill(null); setSkillContent(null); }} />
      )}
      {selectedKnowledge !== null && !knowledgeLoading && knowledgeContent !== null && (
        <FileEditorModal title={`${selectedKnowledge}.md`} content={knowledgeContent} onSave={handleKnowledgeSave} onClose={() => { setSelectedKnowledge(null); setKnowledgeContent(null); }} />
      )}
      {editing && memContent !== null && (
        <FileEditorModal title={`${character.name} -- memory`} content={memContent} onSave={handleMemSave} onClose={() => setEditing(false)} lineLimit={100} />
      )}
      <style jsx>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </>
  );
}
