"use client";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Check, X, ChevronDown, ChevronRight, Wrench, FileText, Copy, ClipboardCheck } from "lucide-react";
import { charIcon, charColor } from "@/lib/char-icons";

type ProposalType = "skill-edit" | "schedule" | "rebalance" | "pattern" | "cleanup" | "automation" | "strategic";
type ProposalSource = "watcher" | "kybernetes" | "coach" | "oracle";
type ProposalPriority = "low" | "medium" | "high";
type ProposalAction = { type: string; spec: Record<string, unknown> };
type Proposal = { id: string; type: ProposalType; source: ProposalSource; title: string; detail: string; action: ProposalAction; priority: ProposalPriority; createdAt: string; status: string };
type PlanFile = { name: string; path: string; type: 'plan' | 'spec'; title: string; goal: string; modifiedAt: string };

const TYPE_LABELS: Record<ProposalType, string> = { "skill-edit": "Skill Edits", schedule: "Schedule", rebalance: "Rebalance", pattern: "Patterns", cleanup: "Cleanup", automation: "Automation", strategic: "Strategic" };
const TYPE_ORDER: ProposalType[] = ["strategic", "pattern", "rebalance", "schedule", "skill-edit", "cleanup", "automation"];

function Chevron({ open }: { open: boolean }) {
  const C = open ? ChevronDown : ChevronRight;
  return <C size={12} strokeWidth={1.5} style={{ color: "var(--text-3)", marginTop: 2, flexShrink: 0 }} />;
}

function PriorityDot({ priority }: { priority: ProposalPriority }) {
  if (priority === "low") return null;
  return <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: priority === "high" ? "#ef4444" : "#d97706", flexShrink: 0 }} title={priority} />;
}

function SourceIcon({ source }: { source: ProposalSource }) {
  const key = source.charAt(0).toUpperCase() + source.slice(1);
  const Icon = charIcon[key]; const color = charColor[source] || "var(--text-3)";
  return Icon ? <Icon size={12} strokeWidth={1.5} style={{ color, flexShrink: 0 }} /> : null;
}

function ActionPreview({ action }: { action: ProposalAction }) {
  const { type, spec } = action;
  if (type === "edit-file" && spec.file) {
    return (
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", marginBottom: 6 }}>
        {String(spec.file)}
        {typeof spec.old === 'string' && typeof spec.new === 'string' && (
          <div style={{ borderRadius: 4, overflow: "hidden", marginTop: 4 }}>
            <div style={{ background: "#dc262610", color: "#dc2626", padding: "3px 8px", whiteSpace: "pre-wrap" }}>- {String(spec.old).slice(0, 200)}</div>
            <div style={{ background: "#16a34a10", color: "#16a34a", padding: "3px 8px", whiteSpace: "pre-wrap" }}>+ {String(spec.new).slice(0, 200)}</div>
          </div>
        )}
      </div>
    );
  }
  return <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", marginBottom: 6 }}>{type}: {JSON.stringify(spec).slice(0, 120)}</div>;
}

export default function ProposalsTab({ hideHeader }: { hideHeader?: boolean }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanFile[]>([]);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetch_ = useCallback(() => {
    setLoading(true);
    fetch("/api/system/proposals").then(r => r.json()).then(d => setProposals(d.proposals || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { fetch_(); }, [fetch_]);
  useEffect(() => { fetch("/api/system/plans").then(r => r.json()).then(d => setPlans(d.plans || [])).catch(() => {}); }, []);

  const handleExpandPlan = async (name: string) => {
    if (expandedPlan === name) { setExpandedPlan(null); setPlanContent(null); return; }
    setExpandedPlan(name); setPlanContent(null);
    try { const res = await fetch(`/api/system/plans?content=${encodeURIComponent(name)}`); const data = await res.json(); setPlanContent(data.content || null); } catch {}
  };

  const handleAction = async (id: string, action: "approve" | "dismiss") => {
    setBusy(prev => new Set(prev).add(id));
    try {
      const res = await fetch("/api/system/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id }) });
      const data = await res.json();
      if (action === "approve" && data.approved) { setToast(`Approved: ${data.title}`); setTimeout(() => setToast(null), 3000); }
      else if (action === "approve" && data.error) { setToast(`Failed: ${data.error}`); setTimeout(() => setToast(null), 4000); }
      else if (action === "dismiss") { setToast("Dismissed"); setTimeout(() => setToast(null), 2000); }
      fetch_();
    } catch {}
    setBusy(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const grouped = new Map<ProposalType, Proposal[]>();
  for (const p of proposals) { const list = grouped.get(p.type) || []; list.push(p); grouped.set(p.type, list); }
  const sortedGroups = TYPE_ORDER.filter(t => grouped.has(t)).map(t => ({ type: t, label: TYPE_LABELS[t], items: grouped.get(t)! }));

  return (
    <div className="widget" style={{ height: "100%" }}>
      {!hideHeader && (
        <div className="widget-header">
          <span className="widget-header-label" style={{ display: "flex", alignItems: "center", gap: 6 }}><Wrench size={12} strokeWidth={1.5} /> Proposals</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {proposals.length > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: "#d97706", background: "#d9770618", padding: "1px 6px", borderRadius: 8 }}>{proposals.length}</span>}
            <button className="widget-toolbar-btn" data-tip="Refresh" onClick={fetch_}><RefreshCw size={12} strokeWidth={1.5} className={loading ? "spin" : ""} /></button>
          </div>
        </div>
      )}
      <div className="widget-body" style={{ padding: 0, position: "relative" }}>
        {toast && <div style={{ position: "absolute", top: 6, left: 10, right: 10, zIndex: 10, background: "#16a34a18", border: "1px solid #16a34a30", borderRadius: 4, padding: "4px 10px", fontFamily: "var(--font-mono)", fontSize: 9, color: "#16a34a", textAlign: "center" }}>{toast}</div>}
        {proposals.length === 0 && plans.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 20, gap: 6 }}>
            <Wrench size={16} strokeWidth={1} style={{ color: "var(--text-3)", opacity: 0.4 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>No pending proposals</span>
          </div>
        )}
        {sortedGroups.map(({ type, label, items }) => (
          <div key={type}>
            <div style={{ padding: "6px 14px 4px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", background: "var(--bg-2, transparent)" }}>{label}<span style={{ marginLeft: 6, opacity: 0.5 }}>{items.length}</span></div>
            {items.map(p => {
              const isExp = expanded === p.id; const isBusy = busy.has(p.id);
              return (
                <div key={p.id} style={{ borderBottom: "1px solid var(--border)", opacity: isBusy ? 0.5 : 1 }}>
                  <div onClick={() => setExpanded(isExp ? null : p.id)} style={{ padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <Chevron open={isExp} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <SourceIcon source={p.source} /><PriorityDot priority={p.priority} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-3)", flexShrink: 0 }}>{new Date(p.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  {isExp && (
                    <div style={{ padding: "0 14px 10px 34px" }}>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-2)", marginBottom: 8, lineHeight: 1.5 }}>{p.detail}</div>
                      <ActionPreview action={p.action} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="item-action-btn" onClick={() => handleAction(p.id, "approve")} disabled={isBusy} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 3, color: "#16a34a", padding: "3px 8px", fontSize: 10, fontFamily: "var(--font-mono)", border: "1px solid #16a34a30", borderRadius: 4, background: "#16a34a08" }}><Check size={10} strokeWidth={2} /> Approve</button>
                        <button className="item-action-btn" onClick={() => handleAction(p.id, "dismiss")} disabled={isBusy} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 3, color: "#dc2626", padding: "3px 8px", fontSize: 10, fontFamily: "var(--font-mono)", border: "1px solid #dc262630", borderRadius: 4, background: "#dc262608" }}><X size={10} strokeWidth={2} /> Dismiss</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {plans.length > 0 && (
          <div>
            <div style={{ padding: "6px 14px 4px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", borderTop: "1px solid var(--border)", background: "var(--bg-2, transparent)" }}>Design Plans<span style={{ marginLeft: 6, opacity: 0.5 }}>{plans.length}</span></div>
            {plans.map(plan => {
              const isExp = expandedPlan === plan.name;
              return (
                <div key={plan.name} style={{ borderBottom: "1px solid var(--border)" }}>
                  <div onClick={() => handleExpandPlan(plan.name)} style={{ padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <Chevron open={isExp} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <FileText size={12} strokeWidth={1.5} style={{ color: plan.type === "plan" ? "var(--blue)" : "var(--green)", flexShrink: 0 }} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plan.title}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: plan.type === "plan" ? "var(--blue)" : "var(--green)", background: plan.type === "plan" ? "var(--blue-bg)" : "var(--green-bg)", padding: "0 4px", borderRadius: 3, flexShrink: 0 }}>{plan.type}</span>
                      </div>
                      {plan.goal && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plan.goal}</div>}
                    </div>
                  </div>
                  {isExp && (
                    <div style={{ padding: "0 14px 10px 34px" }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        <button className="item-action-btn" onClick={() => { navigator.clipboard.writeText(plan.path); setCopied(plan.name); setTimeout(() => setCopied(null), 2000); }} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 3, color: "var(--blue)", padding: "3px 8px", fontSize: 10, fontFamily: "var(--font-mono)", border: "1px solid var(--blue)30", borderRadius: 4, background: "var(--blue-bg)" }}>
                          {copied === plan.name ? <><ClipboardCheck size={10} strokeWidth={2} /> Copied</> : <><Copy size={10} strokeWidth={2} /> Copy Path</>}
                        </button>
                      </div>
                      {planContent ? (
                        <pre style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflow: "auto", background: "var(--surface-2)", borderRadius: 4, padding: "8px 10px", border: "1px solid var(--border)" }}>{planContent}</pre>
                      ) : <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)" }}>Loading...</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
