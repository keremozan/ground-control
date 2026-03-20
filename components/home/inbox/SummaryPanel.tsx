"use client";
import { Reply, X, Loader2 } from "lucide-react";

interface SummaryPanelProps {
  text: string;
  loading: boolean;
  onClose: () => void;
  onReply: () => void;
}

export default function SummaryPanel({ text, loading, onClose, onReply }: SummaryPanelProps) {
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
          Summary
        </span>
        <button className="item-action-btn" data-tip="Close" onClick={onClose} style={{ cursor: "pointer" }}>
          <X size={10} strokeWidth={1.5} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0" }}>
          <Loader2 size={12} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>Summarizing...</span>
        </div>
      ) : (
        <div style={{
          fontFamily: "var(--font-body)", fontSize: 11, lineHeight: 1.55,
          color: "var(--text)", background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: 4,
          padding: "8px 10px", whiteSpace: "pre-wrap",
        }}>
          {text}
        </div>
      )}

      {!loading && text && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            className="item-action-btn item-action-btn-blue"
            data-tip="Reply to this email"
            onClick={onReply}
            style={{
              cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
              width: "auto", padding: "0 6px",
              fontFamily: "var(--font-mono)", fontSize: 9,
            }}
          >
            <Reply size={10} strokeWidth={1.5} />
            Reply
          </button>
        </div>
      )}
    </div>
  );
}
