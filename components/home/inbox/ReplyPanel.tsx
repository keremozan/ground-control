"use client";
import { useRef, useEffect } from "react";
import { Send, X } from "lucide-react";

interface ReplyPanelProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function ReplyPanel({ value, onChange, onSubmit, onCancel }: ReplyPanelProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => ref.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{
      borderTop: "1px solid var(--border)", background: "var(--surface-2)",
      padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)",
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          Reply notes
        </span>
        <button className="item-action-btn" data-tip="Cancel" onClick={onCancel} style={{ cursor: "pointer" }}>
          <X size={10} strokeWidth={1.5} />
        </button>
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && e.metaKey) onSubmit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="What should the reply say..."
        rows={3}
        style={{
          fontFamily: "var(--font-body)", fontSize: 11, lineHeight: 1.5,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 4, padding: "6px 8px", color: "var(--text)",
          outline: "none", resize: "vertical", minHeight: 56,
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          className="item-action-btn item-action-btn-blue"
          data-tip="Send to Postman (⌘↵)"
          onClick={onSubmit}
          style={{
            cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
            width: "auto", padding: "0 6px",
            fontFamily: "var(--font-mono)", fontSize: 9,
          }}
        >
          <Send size={10} strokeWidth={1.5} />
          Draft
        </button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)" }}>⌘↵</span>
      </div>
    </div>
  );
}
