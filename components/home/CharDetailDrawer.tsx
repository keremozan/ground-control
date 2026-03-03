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
}: {
  character: CharacterInfo;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("skills");
  const [memContent, setMemContent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("skills");
    setMemContent(null);
    setEditing(false);
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
          position: "fixed", inset: 0, zIndex: 900,
          background: "rgba(0,0,0,0.2)",
        }}
      />

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 901,
        width: "min(380px, 90vw)",
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
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
              {skills.map(s => (
                <div key={s} style={{
                  padding: "6px 10px", borderRadius: 4,
                  background: "var(--surface-2)",
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: "var(--text)",
                }}>
                  {s}
                </div>
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
              {knowledge.length === 0 && <Empty text="No knowledge files" />}
              {knowledge.map(k => (
                <div key={k} style={{
                  padding: "6px 10px", borderRadius: 4,
                  background: "var(--surface-2)",
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: "var(--text)",
                }}>
                  {k}.md
                </div>
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

      {/* File editor modal */}
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
