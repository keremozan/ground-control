"use client";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Check, X, ChevronDown, ChevronRight, Wrench } from "lucide-react";

type Proposal = {
  id: string;
  skill: string;
  description: string;
  diff: { old: string; new: string };
  reason: string;
  createdAt: string;
};

export default function ProposalsWidget() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const fetch_ = useCallback(() => {
    setLoading(true);
    fetch("/api/system/proposals")
      .then(r => r.json())
      .then(d => setProposals(d.proposals || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleAction = async (id: string, action: "approve" | "dismiss") => {
    setBusy(prev => new Set(prev).add(id));
    try {
      await fetch("/api/system/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      fetch_();
    } catch {}
    setBusy(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  return (
    <div className="widget" style={{ height: "100%" }}>
      <div className="widget-header">
        <span className="widget-header-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Wrench size={12} strokeWidth={1.5} />
          Proposals
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {proposals.length > 0 && (
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
              color: "#d97706", background: "#d9770618",
              padding: "1px 6px", borderRadius: 8,
            }}>
              {proposals.length}
            </span>
          )}
          <button className="widget-toolbar-btn" data-tip="Refresh" onClick={fetch_}>
            <RefreshCw size={12} strokeWidth={1.5} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      <div className="widget-body" style={{ padding: 0 }}>
        {proposals.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", padding: 20, gap: 6,
          }}>
            <Wrench size={16} strokeWidth={1} style={{ color: "var(--text-3)", opacity: 0.4 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
              No pending proposals
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", opacity: 0.6 }}>
              Watcher generates proposals when patterns repeat 3+ times
            </span>
          </div>
        )}

        {proposals.map((p) => {
          const isExpanded = expanded === p.id;
          const isBusy = busy.has(p.id);

          return (
            <div key={p.id} style={{
              borderBottom: "1px solid var(--border)",
              opacity: isBusy ? 0.5 : 1,
            }}>
              {/* Header row */}
              <div
                onClick={() => setExpanded(isExpanded ? null : p.id)}
                style={{
                  padding: "8px 14px",
                  cursor: "pointer",
                  display: "flex", alignItems: "flex-start", gap: 8,
                }}
              >
                {isExpanded
                  ? <ChevronDown size={12} strokeWidth={1.5} style={{ color: "var(--text-3)", marginTop: 2, flexShrink: 0 }} />
                  : <ChevronRight size={12} strokeWidth={1.5} style={{ color: "var(--text-3)", marginTop: 2, flexShrink: 0 }} />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                      color: "#d97706",
                    }}>
                      {p.skill}
                    </span>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 8,
                      color: "var(--text-3)",
                    }}>
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{
                    fontFamily: "var(--font-body)", fontSize: 11,
                    color: "var(--text-2)", marginTop: 2,
                    overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: isExpanded ? "normal" : "nowrap",
                  }}>
                    {p.description}
                  </div>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ padding: "0 14px 10px 34px" }}>
                  {/* Reason */}
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    color: "var(--text-3)", marginBottom: 8,
                  }}>
                    Reason: {p.reason}
                  </div>

                  {/* Diff */}
                  {p.diff && (
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 9,
                      borderRadius: 4, overflow: "hidden", marginBottom: 8,
                    }}>
                      <div style={{
                        background: "#dc262610", color: "#dc2626",
                        padding: "4px 8px", whiteSpace: "pre-wrap",
                      }}>
                        − {p.diff.old}
                      </div>
                      <div style={{
                        background: "#16a34a10", color: "#16a34a",
                        padding: "4px 8px", whiteSpace: "pre-wrap",
                      }}>
                        + {p.diff.new}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="item-action-btn"
                      onClick={() => handleAction(p.id, "approve")}
                      disabled={isBusy}
                      style={{
                        cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
                        color: "#16a34a", padding: "3px 8px", fontSize: 10,
                        fontFamily: "var(--font-mono)", border: "1px solid #16a34a30",
                        borderRadius: 4, background: "#16a34a08",
                      }}
                    >
                      <Check size={10} strokeWidth={2} /> Approve
                    </button>
                    <button
                      className="item-action-btn"
                      onClick={() => handleAction(p.id, "dismiss")}
                      disabled={isBusy}
                      style={{
                        cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
                        color: "#dc2626", padding: "3px 8px", fontSize: 10,
                        fontFamily: "var(--font-mono)", border: "1px solid #dc262630",
                        borderRadius: 4, background: "#dc262608",
                      }}
                    >
                      <X size={10} strokeWidth={2} /> Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
