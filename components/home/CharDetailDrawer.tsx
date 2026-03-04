"use client";
import { useState, useEffect } from "react";
import { X, Brain, Route, BookOpen, FileText } from "lucide-react";
import FileEditorModal from "@/components/pipeline/FileEditorModal";

type CharacterInfo = {
  id: string;
  name: string;
  color: string;
  skills?: string[];
  routingKeywords?: string[];
  sharedKnowledge?: string[];
};

type Tab = "skills" | "keywords" | "knowledge" | "memory";

const TABS: { key: Tab; label: string; icon: typeof Brain }[] = [
  { key: "skills", label: "Skills", icon: Brain },
  { key: "keywords", label: "Keywords", icon: Route },
  { key: "knowledge", label: "Knowledge", icon: BookOpen },
  { key: "memory", label: "Memory", icon: FileText },
];

export default function CharDetailDrawer({
  character,
  open,
  onClose,
  contained,
}: {
  character: CharacterInfo;
  open: boolean;
  onClose: () => void;
  contained?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("skills");
  const [memContent, setMemContent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [selectedKnowledge, setSelectedKnowledge] = useState<string | null>(null);
  const [knowledgeContent, setKnowledgeContent] = useState<string | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);

  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState<string | null>(null);
  const [skillLoading, setSkillLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("skills");
    setMemContent(null);
    setEditing(false);
    setSelectedKnowledge(null);
    setKnowledgeContent(null);
    setSelectedSkill(null);
    setSkillContent(null);
  }, [open, character.id]);

  useEffect(() => {
    if (open && tab === "memory" && memContent === null) {
      fetch(`/api/system/memory?char=${character.id}`)
        .then(r => r.json())
        .then(d => setMemContent(d.content || ""))
        .catch(() => setMemContent(""));
    }
  }, [open, tab, character.id, memContent]);

  if (!open) return null;

  const skills = character.skills || [];
  const keywords = character.routingKeywords || [];
  const knowledge = character.sharedKnowledge || [];

  const pos = contained ? "absolute" : "fixed";
  const z = contained ? 10 : 900;

  const handleSkillClick = async (name: string) => {
    setSelectedSkill(name);
    setSkillContent(null);
    setSkillLoading(true);
    try {
      const r = await fetch(`/api/system/skill?name=${name}`);
      const d = await r.json();
      setSkillContent(d.content ?? "");
    } catch {
      setSkillContent("");
    } finally {
      setSkillLoading(false);
    }
  };

  const handleSkillSave = async (content: string) => {
    if (!selectedSkill) return;
    await fetch(`/api/system/skill?name=${selectedSkill}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setSkillContent(content);
    setSelectedSkill(null);
  };

  const handleKnowledgeClick = async (key: string) => {
    setSelectedKnowledge(key);
    setKnowledgeContent(null);
    setKnowledgeLoading(true);
    try {
      const r = await fetch(`/api/system/knowledge?key=${key}`);
      const d = await r.json();
      setKnowledgeContent(d.content ?? "");
    } catch {
      setKnowledgeContent("");
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const handleKnowledgeSave = async (content: string) => {
    if (!selectedKnowledge) return;
    await fetch(`/api/system/knowledge?key=${selectedKnowledge}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setKnowledgeContent(content);
    setSelectedKnowledge(null);
  };

  const handleMemSave = async (content: string) => {
    await fetch(`/api/system/memory?char=${character.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setMemContent(content);
    setEditing(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: pos, inset: 0, zIndex: z,
          background: "rgba(0,0,0,0.2)",
        }}
      />

      {/* Drawer */}
      <div style={{
        position: pos, top: 0, right: 0, bottom: 0, zIndex: z + 1,
        width: contained ? "100%" : "min(380px, 90vw)",
        background: "var(--surface)",
        borderLeft: contained ? "none" : "1px solid var(--border)",
        boxShadow: "-4px 0 20px rgba(0,0,0,0.08)",
        display: "flex", flexDirection: "column",
        animation: "slideIn 0.15s ease-out",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: character.color,
            }} />
            <span style={{
              fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600,
              color: "var(--text)",
            }}>
              {character.name}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 24, height: 24, borderRadius: 4,
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--text-3)",
            }}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 0,
          borderBottom: "1px solid var(--border)",
          padding: "0 12px",
        }}>
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "8px 10px",
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: active ? 600 : 400,
                  color: active ? character.color : "var(--text-3)",
                  background: "transparent", border: "none",
                  borderBottom: active ? `2px solid ${character.color}` : "2px solid transparent",
                  cursor: "pointer", transition: "all 0.12s",
                }}
              >
                <Icon size={10} strokeWidth={1.5} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
          {tab === "skills" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {skills.length === 0 && <Empty text="No skills configured" />}
              {skillLoading && <Empty text="Loading..." />}
              {skills.map(s => (
                <button
                  key={s}
                  onClick={() => handleSkillClick(s)}
                  style={{
                    padding: "6px 10px", borderRadius: 4,
                    background: "var(--surface-2)",
                    border: "1px solid transparent",
                    fontFamily: "var(--font-mono)", fontSize: 11,
                    color: "var(--text)",
                    cursor: "pointer", textAlign: "left",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = character.color + "40")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "transparent")}
                >
                  <span>{s}</span>
                  <span style={{ fontSize: 9, color: character.color, opacity: 0.7 }}>edit →</span>
                </button>
              ))}
            </div>
          )}

          {tab === "keywords" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {keywords.length === 0 && <Empty text="No routing keywords" />}
              {keywords.map(k => (
                <span key={k} style={{
                  padding: "3px 8px", borderRadius: 3,
                  background: character.color + "12",
                  border: `1px solid ${character.color}24`,
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: character.color,
                }}>
                  {k}
                </span>
              ))}
            </div>
          )}

          {tab === "knowledge" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {knowledgeLoading && <Empty text="Loading..." />}
              {knowledge.length === 0 && <Empty text="No knowledge files" />}
              {knowledge.map(k => (
                <button
                  key={k}
                  onClick={() => handleKnowledgeClick(k)}
                  style={{
                    padding: "6px 10px", borderRadius: 4,
                    background: "var(--surface-2)",
                    border: "1px solid transparent",
                    fontFamily: "var(--font-mono)", fontSize: 11,
                    color: "var(--text)",
                    cursor: "pointer", textAlign: "left",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = character.color + "40")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "transparent")}
                >
                  <span>{k}.md</span>
                  <span style={{ fontSize: 9, color: character.color, opacity: 0.7 }}>edit →</span>
                </button>
              ))}
            </div>
          )}

          {tab === "memory" && (
            <div>
              {memContent === null ? (
                <Empty text="Loading..." />
              ) : memContent === "" ? (
                <Empty text="Memory file is empty" />
              ) : (
                <pre style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.6,
                  color: "var(--text-2)", whiteSpace: "pre-wrap", wordBreak: "break-word",
                  margin: 0, padding: 0,
                }}>
                  {memContent}
                </pre>
              )}
              <button
                onClick={() => setEditing(true)}
                style={{
                  marginTop: 10,
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", borderRadius: 4,
                  background: "transparent",
                  border: `1px solid ${character.color}30`,
                  color: character.color,
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  cursor: "pointer",
                }}
              >
                <FileText size={10} strokeWidth={1.5} />
                Edit memory
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Skill editor modal */}
      {selectedSkill !== null && !skillLoading && skillContent !== null && (
        <FileEditorModal
          title={`${selectedSkill}/SKILL.md`}
          content={skillContent}
          onSave={handleSkillSave}
          onClose={() => { setSelectedSkill(null); setSkillContent(null); }}
        />
      )}

      {/* Knowledge editor modal */}
      {selectedKnowledge !== null && !knowledgeLoading && knowledgeContent !== null && (
        <FileEditorModal
          title={`${selectedKnowledge}.md`}
          content={knowledgeContent}
          onSave={handleKnowledgeSave}
          onClose={() => { setSelectedKnowledge(null); setKnowledgeContent(null); }}
        />
      )}

      {/* Memory editor modal */}
      {editing && memContent !== null && (
        <FileEditorModal
          title={`${character.name} — memory`}
          content={memContent}
          onSave={handleMemSave}
          onClose={() => setEditing(false)}
          lineLimit={100}
        />
      )}

      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 10,
      color: "var(--text-3)",
    }}>
      {text}
    </span>
  );
}
