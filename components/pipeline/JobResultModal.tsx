"use client";
import { type JobResult } from "@/lib/scheduler";
import { charIcon, charColor } from "@/lib/char-icons";
import { X, BookOpen, Copy, Check } from "lucide-react";
import { useState } from "react";

function SimpleMarkdown({ text }: { text: string }) {
  const processInline = (s: string): React.ReactNode[] => {
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((p, j) => {
      if (p.startsWith('**') && p.endsWith('**'))
        return <strong key={j} style={{ color: 'var(--text)' }}>{p.slice(2, -2)}</strong>;
      if (p.startsWith('`') && p.endsWith('`'))
        return <code key={j} style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.9em',
          background: 'var(--bg-2)', padding: '1px 4px', borderRadius: 3,
        }}>{p.slice(1, -1)}</code>;
      return p;
    });
  };

  return (
    <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
      {text.split('\n').map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 6 }} />;
        if (/^---+$/.test(t))
          return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />;
        if (t.startsWith('### '))
          return <div key={i} style={{ fontWeight: 600, fontSize: 12, marginTop: 8, color: 'var(--text)' }}>{processInline(t.slice(4))}</div>;
        if (t.startsWith('## '))
          return <div key={i} style={{ fontWeight: 600, fontSize: 13, marginTop: 10, color: 'var(--text)' }}>{processInline(t.slice(3))}</div>;
        if (t.startsWith('- '))
          return (
            <div key={i} style={{ paddingLeft: 12, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 2, color: 'var(--text-3)' }}>·</span>
              {processInline(t.slice(2))}
            </div>
          );
        if (/^\d+\.\s/.test(t))
          return (
            <div key={i} style={{ paddingLeft: 12, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: 'var(--text-3)', fontSize: '0.9em' }}>
                {t.match(/^(\d+\.)/)?.[1]}
              </span>
              <span style={{ paddingLeft: 8 }}>{processInline(t.replace(/^\d+\.\s*/, ''))}</span>
            </div>
          );
        return <div key={i}>{processInline(t)}</div>;
      })}
    </div>
  );
}

export default function JobResultModal({
  result,
  onClose,
}: {
  result: JobResult;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const Icon = charIcon[result.displayName] || BookOpen;
  const color = charColor[result.charName] || "#94a3b8";
  const date = new Date(result.timestamp);
  const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dateStr = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const durationStr = result.durationMs >= 60000
    ? `${Math.round(result.durationMs / 60000)}m`
    : `${Math.round(result.durationMs / 1000)}s`;

  const handleCopy = () => {
    navigator.clipboard.writeText(result.response).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 8, width: "100%", maxWidth: 640,
          maxHeight: "80vh", display: "flex", flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: 5, flexShrink: 0,
            background: color + "16", border: `1px solid ${color}28`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon size={12} strokeWidth={1.5} style={{ color }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--text)" }}>
              {result.displayName} — {result.jobId}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", marginTop: 1 }}>
              {dateStr} {timeStr} · {durationStr}
            </div>
          </div>
          <button
            onClick={handleCopy}
            data-tip="Copy"
            style={{
              background: "transparent", border: "1px solid var(--border)",
              borderRadius: 4, padding: "4px 8px", cursor: "pointer",
              color: copied ? "var(--green)" : "var(--text-3)",
              display: "flex", alignItems: "center", gap: 4,
              fontFamily: "var(--font-mono)", fontSize: 9,
            }}
          >
            {copied ? <Check size={10} strokeWidth={2} /> : <Copy size={10} strokeWidth={2} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none",
              cursor: "pointer", color: "var(--text-3)",
              display: "flex", alignItems: "center",
            }}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflow: "auto", padding: "16px",
        }}>
          {result.response ? (
            <SimpleMarkdown text={result.response} />
          ) : (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
              No response captured
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
