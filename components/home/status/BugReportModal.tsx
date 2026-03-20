"use client";
import { useState, useRef } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { logAction } from "@/lib/action-log";

/* ── Props ───────────────────────────────────────────────────── */

interface BugReportModalProps {
  open: boolean;
  onClose: () => void;
}

/* ── Component ───────────────────────────────────────────────── */

export default function BugReportModal({ open, onClose }: BugReportModalProps) {
  const [bugText, setBugText] = useState("");
  const [bugSent, setBugSent] = useState(false);
  const bugRef = useRef<HTMLTextAreaElement>(null);

  const handleClose = () => {
    onClose();
    setBugText("");
  };

  const submitBug = async () => {
    if (!bugText.trim()) return;
    logAction({
      widget: "bug",
      action: "report",
      target: bugText.trim().slice(0, 200),
      detail: bugText.trim(),
    });
    setBugSent(true);
    setTimeout(() => { onClose(); setBugText(""); setBugSent(false); }, 1200);
  };

  return (
    <Modal open={open} onClose={handleClose} width={420}>
      <div style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            Report a bug
          </span>
          <button
            onClick={handleClose}
            style={{
              background: "transparent", border: "none", color: "var(--text-3)",
              cursor: "pointer", padding: 2,
            }}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
        <textarea
          ref={bugRef}
          value={bugText}
          onChange={e => setBugText(e.target.value)}
          placeholder="What went wrong?"
          rows={4}
          style={{
            width: "100%", resize: "vertical",
            fontFamily: "var(--font-body)", fontSize: 12,
            color: "var(--text)", background: "var(--bg)",
            border: "1px solid var(--border)", borderRadius: 4,
            padding: "8px 10px", outline: "none", lineHeight: 1.5,
          }}
          onKeyDown={e => { if (e.key === "Enter" && e.metaKey) submitBug(); }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)" }}>
            Logged to Architect watcher
          </span>
          <button
            className="calc-btn calc-btn-sm"
            onClick={submitBug}
            disabled={!bugText.trim() || bugSent}
            style={{ opacity: bugText.trim() && !bugSent ? 1 : 0.5 }}
          >
            {bugSent ? "Sent" : "Submit"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
