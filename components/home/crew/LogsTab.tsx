"use client";
import { useState, useEffect } from "react";
import { getLog, logAction, clearLog, subscribeLog, type ActionLogEntry } from "@/lib/action-log";
import { charIcon, charColor } from "@/lib/char-icons";
import type { JobResult } from "@/lib/scheduler";
import { BookOpen, RefreshCw, ExternalLink, Trash2 } from "lucide-react";

const actionColor: Record<string, string> = {
  reply:    "var(--blue)",
  task:     "var(--green)",
  schedule: "var(--blue)",
  start:    "var(--blue)",
  done:     "var(--green)",
  archive:  "var(--amber)",
  delete:   "var(--red)",
  run:      "var(--blue)",
  flag:     "var(--amber)",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function LogsTab({
  onShowResult,
  hideHeader,
}: {
  onShowResult?: (result: JobResult) => void;
  hideHeader?: boolean;
}) {
  const [entries, setEntries] = useState<ActionLogEntry[]>([]);

  useEffect(() => {
    setEntries(getLog());
    const unsub = subscribeLog(() => setEntries([...getLog()]));

    // Inject scheduled job results that haven't been logged yet
    const INJECTED_KEY = "gc-injected-jobs";
    let injected: Set<string>;
    try {
      injected = new Set(JSON.parse(localStorage.getItem(INJECTED_KEY) || "[]"));
    } catch {
      injected = new Set();
    }

    fetch("/api/schedule/results")
      .then(r => r.json())
      .then((raw: any) => { const data = (raw?.data ?? raw) as { results?: import("@/lib/scheduler").JobResult[] };
        const results = data.results || [];
        // Re-read from localStorage at resolution time to avoid React StrictMode double-inject
        let fresh: Set<string>;
        try {
          fresh = new Set(JSON.parse(localStorage.getItem(INJECTED_KEY) || "[]"));
        } catch {
          fresh = new Set();
        }
        let changed = false;
        for (const r of results) {
          if (fresh.has(r.jobId)) continue;
          logAction({
            widget: "scheduler",
            action: "run",
            target: r.displayName + (r.durationMs ? ` (${Math.round(r.durationMs / 1000)}s)` : ""),
            character: r.charName === "system" ? undefined : r.charName,
            detail: new Date(r.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
            jobId: r.jobId,
            timestamp: r.timestamp,
          });
          fresh.add(r.jobId);
          changed = true;
        }
        if (changed) {
          try { localStorage.setItem(INJECTED_KEY, JSON.stringify([...fresh])); } catch {}
        }
      })
      .catch(() => {});

    return unsub;
  }, []);

  const handleEntryClick = async (entry: ActionLogEntry) => {
    if (entry.widget !== "scheduler" || !entry.jobId || !onShowResult) return;

    try {
      const res = await fetch("/api/schedule/results");
      const raw = await res.json();
      const data = raw?.data ?? raw;
      const results = (data.results || []) as JobResult[];
      const match = results.find(r => r.jobId === entry.jobId);
      if (match) onShowResult(match);
    } catch {
      // silent
    }
  };

  const handleClear = () => {
    clearLog();
    setEntries([]);
  };

  return (
    <div className="widget" style={{ height: "100%" }}>
      {!hideHeader && (
        <div className="widget-header">
          <span className="widget-header-label">Logs</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
              {entries.length} entries
            </span>
            <button className="widget-toolbar-btn" data-tip="Clear" onClick={handleClear}>
              <Trash2 size={12} strokeWidth={1.5} />
            </button>
            <button className="widget-toolbar-btn" data-tip="Refresh" onClick={() => setEntries([...getLog()])}>
              <RefreshCw size={12} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}

      <div className="widget-body" style={{ padding: 0 }}>
        {entries.length === 0 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", padding: 20,
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
              No actions logged yet
            </span>
          </div>
        )}

        {entries.map((entry, i) => {
          const charNameKey = entry.character
            ? entry.character.charAt(0).toUpperCase() + entry.character.slice(1).toLowerCase()
            : null;
          const CIcon = charNameKey ? (charIcon[charNameKey] || BookOpen) : null;
          const color = entry.character
            ? charColor[entry.character.toLowerCase()] || "var(--text-3)"
            : "var(--text-3)";
          const aColor = actionColor[entry.action] || "var(--text-3)";
          const isClickable = entry.widget === "scheduler" && !!entry.jobId && !!onShowResult;

          return (
            <div
              key={i}
              onClick={() => handleEntryClick(entry)}
              style={{
                padding: "6px 14px",
                borderBottom: i < entries.length - 1 ? "1px solid var(--border)" : "none",
                display: "flex", alignItems: "flex-start", gap: 8,
                cursor: isClickable ? "pointer" : "default",
              }}
            >
              {/* Timestamp */}
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                color: "var(--text-3)", flexShrink: 0, marginTop: 1,
                minWidth: 52,
              }}>
                {formatTime(entry.timestamp)}
              </span>

              {/* Character icon */}
              {CIcon && (
                <div style={{
                  width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                  background: color + "16",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginTop: 1,
                }}>
                  <CIcon size={8} strokeWidth={1.5} style={{ color }} />
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Action + widget */}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
                    color: aColor, textTransform: "uppercase",
                  }}>
                    {entry.action}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 8,
                    color: "var(--text-3)",
                  }}>
                    {entry.widget}
                  </span>
                  {entry.detail && (
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 8,
                      color: "var(--text-3)",
                    }}>
                      {entry.detail}
                    </span>
                  )}
                </div>

                {/* Target */}
                <div style={{
                  fontFamily: "var(--font-body)", fontSize: 10,
                  color: "var(--text-2)", marginTop: 1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {entry.target}
                </div>
              </div>

              {/* Clickable indicator for scheduler entries */}
              {isClickable && (
                <ExternalLink size={10} strokeWidth={1.5} style={{
                  color: "var(--text-3)", flexShrink: 0, marginTop: 3,
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
