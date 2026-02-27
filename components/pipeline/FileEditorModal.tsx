"use client";
import { useState, useRef, useEffect } from "react";
import { X, Save, Loader2 } from "lucide-react";

type Props = {
  title: string;
  content: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
  readOnly?: boolean;
  lineLimit?: number;
};

export default function FileEditorModal({ title, content, onSave, onClose, readOnly, lineLimit }: Props) {
  const [text, setText] = useState(content);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const lineCount = text.split("\n").length;
  const overLimit = lineLimit && lineCount > lineLimit;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(text);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(720px, 90vw)", maxHeight: "80vh",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 8, display: "flex", flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", borderBottom: "1px solid var(--border)",
        }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
            color: "var(--text)",
          }}>
            {title}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {lineLimit && (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                color: overLimit ? "#ef4444" : "var(--text-3)",
              }}>
                {lineCount}/{lineLimit} lines
              </span>
            )}
            {!readOnly && (
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                style={{
                  display: "flex", alignItems: "center", gap: 3,
                  padding: "3px 8px", borderRadius: 4,
                  background: dirty ? "var(--blue)" : "var(--border)",
                  color: dirty ? "white" : "var(--text-3)",
                  border: "none", cursor: dirty ? "pointer" : "default",
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
                  opacity: saving ? 0.6 : 1,
                  transition: "all 0.15s",
                }}
              >
                {saving ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={10} />}
                Save
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 22, height: 22, borderRadius: 4,
                background: "transparent", border: "none", cursor: "pointer",
                color: "var(--text-3)",
              }}
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Editor */}
        <textarea
          ref={ref}
          value={text}
          readOnly={readOnly}
          onChange={e => { setText(e.target.value); setDirty(true); }}
          onKeyDown={e => {
            if (e.key === "s" && (e.metaKey || e.ctrlKey) && !readOnly && dirty) {
              e.preventDefault();
              handleSave();
            }
            if (e.key === "Escape") onClose();
          }}
          style={{
            flex: 1, minHeight: 300, maxHeight: "60vh",
            padding: 14, margin: 0,
            fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.6,
            color: "var(--text)", background: "var(--bg)",
            border: "none", outline: "none", resize: "none",
            overflow: "auto",
          }}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
