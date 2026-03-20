"use client";
import { useState, useEffect, useRef } from "react";
import { Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import type { Project, ProjectPhase } from "@/types";

interface Props {
  projects: Project[];
  trackColor: (text: string) => string | null;
  onProjectClick: (id: string) => void;
}

const LEFT_COL = 160;
const ROW_H = 24;
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function ProjectsTimeline({ projects, trackColor, onProjectClick }: Props) {
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const timelineRef = useRef<HTMLDivElement>(null);
  const [, setTimelineWidth] = useState(0);

  useEffect(() => {
    if (projects.length > 0 || !loading) {
      setLoading(false);
    }
  }, [projects, loading]);

  useEffect(() => {
    if (!timelineRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setTimelineWidth(e.contentRect.width);
    });
    obs.observe(timelineRef.current);
    return () => obs.disconnect();
  }, [loading]);

  if (loading && projects.length === 0) {
    return (
      <div className="loading-row">
        <Loader2 size={14} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
        <span className="mono-xs">Loading projects...</span>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="empty-state">
        <span className="mono-xs">No active projects</span>
      </div>
    );
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const tc = (name: string) => trackColor(name) ?? "var(--text-3)";

  // Sort by deadline soonest first
  const sorted = [...projects].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.localeCompare(b.deadline);
  });

  // 6-month window
  const now = new Date();
  const winStart = new Date(now.getFullYear(), now.getMonth() + monthOffset - 1, 1);
  const winEnd = new Date(now.getFullYear(), now.getMonth() + monthOffset + 5, 0, 23, 59, 59);
  const winStartMs = winStart.getTime();
  const winEndMs = winEnd.getTime();

  // Build month columns
  const months: { label: string; startPct: number; widthPct: number }[] = [];
  const totalMs = winEndMs - winStartMs;
  const cur = new Date(winStart);
  while (cur.getTime() < winEndMs) {
    const mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59);
    const startPct = ((cur.getTime() - winStartMs) / totalMs) * 100;
    const endPct = ((Math.min(mEnd.getTime(), winEndMs) - winStartMs) / totalMs) * 100;
    months.push({ label: MONTH_NAMES[cur.getMonth()], startPct, widthPct: endPct - startPct });
    cur.setMonth(cur.getMonth() + 1);
  }

  const todayPct = ((now.getTime() - winStartMs) / totalMs) * 100;
  const todayVisible = todayPct >= 0 && todayPct <= 100;

  const barPct = (startMs: number, endMs: number): { left: string; width: string } | null => {
    const s = Math.max(startMs, winStartMs);
    const e = Math.min(endMs, winEndMs);
    if (s >= e) return null;
    const l = ((s - winStartMs) / totalMs) * 100;
    const w = ((e - s) / totalMs) * 100;
    return { left: `${l}%`, width: `${w}%` };
  };

  type Row =
    | { type: "project"; project: Project; color: string }
    | { type: "phase"; project: Project; phase: ProjectPhase; isLast: boolean; startMs: number | null; endMs: number | null; color: string };

  const rows: Row[] = [];
  for (const p of sorted) {
    const color = tc(p.name);
    rows.push({ type: "project", project: p, color });
    if (expanded.has(p.id) && p.phases.length > 0) {
      p.phases.forEach((phase, idx) => {
        const phStartMs = phase.startDate ? new Date(phase.startDate).getTime() : null;
        const phEndMs = phase.endDate ? new Date(phase.endDate).getTime() : null;
        rows.push({
          type: "phase", project: p, phase, color,
          isLast: idx === p.phases.length - 1,
          startMs: phStartMs, endMs: phEndMs,
        });
      });
    }
  }

  const navLabel = `${MONTH_NAMES[winStart.getMonth()]} ${winStart.getFullYear()} \u2013 ${MONTH_NAMES[winEnd.getMonth()]} ${winEnd.getFullYear()}`;

  return (
    <div className="widget-body" style={{ padding: 0 }}>
      {/* Navigation */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "4px 8px", borderBottom: "1px solid var(--border)",
      }}>
        <button onClick={() => setMonthOffset(o => o - 3)} style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 20, height: 20, borderRadius: 3,
          border: "1px solid var(--border)", background: "var(--surface)",
          cursor: "pointer", color: "var(--text-2)",
        }}>
          <ChevronLeft size={11} strokeWidth={2} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: "var(--text-2)" }}>
            {navLabel}
          </span>
          {monthOffset !== 0 && (
            <button onClick={() => setMonthOffset(0)} style={{
              fontFamily: "var(--font-mono)", fontSize: 8, padding: "1px 5px", borderRadius: 3,
              border: "1px solid var(--border)", background: "var(--surface)",
              cursor: "pointer", color: "var(--blue)",
            }}>
              Today
            </button>
          )}
        </div>
        <button onClick={() => setMonthOffset(o => o + 3)} style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 20, height: 20, borderRadius: 3,
          border: "1px solid var(--border)", background: "var(--surface)",
          cursor: "pointer", color: "var(--text-2)",
        }}>
          <ChevronRight size={11} strokeWidth={2} />
        </button>
      </div>

      <div style={{ display: "flex", minHeight: 0 }}>
        {/* Left labels */}
        <div style={{ width: LEFT_COL, minWidth: LEFT_COL, flexShrink: 0, borderRight: "1px solid var(--border)" }}>
          <div style={{ height: ROW_H, borderBottom: "1px solid var(--border)" }} />
          {rows.map((row) => {
            if (row.type === "project") {
              const p = row.project;
              const totalTasks = p.phases.reduce((s, ph) => s + ph.taskCount, 0);
              const doneTasks = p.phases.reduce((s, ph) => s + ph.doneCount, 0);
              const isExpanded = expanded.has(p.id);
              const hasPhases = p.phases.length > 0;
              return (
                <div
                  key={`lh-${p.id}`}
                  style={{
                    height: ROW_H,
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "0 6px",
                    borderBottom: "1px solid var(--border)",
                    background: "var(--surface)",
                    cursor: "pointer",
                    borderLeft: `3px solid ${row.color}`,
                  }}
                  onClick={(e) => { e.stopPropagation(); if (hasPhases) toggleExpand(p.id); else onProjectClick(p.id); }}
                >
                  {hasPhases && (
                    <ChevronRight size={10} strokeWidth={2} style={{
                      color: "var(--text-3)", flexShrink: 0,
                      transform: isExpanded ? "rotate(90deg)" : "none",
                      transition: "transform 0.15s",
                    }} />
                  )}
                  <span style={{
                    fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
                    color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    flex: 1, minWidth: 0,
                  }}>
                    {p.name}
                  </span>
                  {totalTasks > 0 && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-3)", flexShrink: 0 }}>
                      {doneTasks}/{totalTasks}
                    </span>
                  )}
                </div>
              );
            }
            const { phase, isLast, project } = row;
            return (
              <div
                key={`lp-${project.id}-${phase.id}`}
                style={{
                  height: ROW_H,
                  display: "flex", alignItems: "center",
                  padding: "0 6px 0 22px",
                  borderBottom: isLast ? "1px solid var(--border)" : "none",
                  borderLeft: `3px solid transparent`,
                }}
              >
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 9,
                  color: phase.status === "active" ? "var(--text)" : "var(--text-3)",
                  fontWeight: phase.status === "active" ? 600 : 400,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {phase.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Timeline area */}
        <div ref={timelineRef} style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden" }}>
          {/* Month headers */}
          <div style={{ height: ROW_H, borderBottom: "1px solid var(--border)", position: "relative" }}>
            {months.map((m, i) => (
              <div key={i} style={{
                position: "absolute", left: `${m.startPct}%`, width: `${m.widthPct}%`,
                height: ROW_H, display: "flex", alignItems: "center", justifyContent: "center",
                borderRight: "1px solid var(--border)",
                boxSizing: "border-box",
              }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                  color: "var(--text-3)", letterSpacing: "0.03em",
                }}>
                  {m.label}
                </span>
              </div>
            ))}
          </div>

          {/* Rows */}
          {rows.map((row) => {
            if (row.type === "project") {
              const p = row.project;
              const isExpanded = expanded.has(p.id);
              const projBar = (p.startDate && p.deadline)
                ? barPct(new Date(p.startDate).getTime(), new Date(p.deadline).getTime())
                : null;
              return (
                <div key={`tr-${p.id}`} style={{
                  height: ROW_H, position: "relative",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface)",
                }}>
                  {months.map((m, i) => (
                    <div key={i} style={{
                      position: "absolute", left: `${m.startPct}%`, top: 0, bottom: 0,
                      width: 1, background: "var(--border)", opacity: 0.4,
                    }} />
                  ))}
                  {!isExpanded && projBar && (
                    <div style={{
                      position: "absolute", ...projBar, top: 5, height: ROW_H - 10,
                      borderRadius: 3, background: row.color, opacity: 0.7,
                    }} />
                  )}
                </div>
              );
            }

            const { project, phase, isLast, startMs, endMs, color } = row;
            const phaseBar = (startMs != null && endMs != null) ? barPct(startMs, endMs) : null;
            const opacity = phase.status === "completed" ? 0.9
              : phase.status === "active" ? 1
              : 0.3;

            return (
              <div
                key={`tr-${project.id}-${phase.id}`}
                style={{
                  height: ROW_H, position: "relative",
                  borderBottom: isLast ? "1px solid var(--border)" : "none",
                }}
              >
                {months.map((m, i) => (
                  <div key={i} style={{
                    position: "absolute", left: `${m.startPct}%`, top: 0, bottom: 0,
                    width: 1, background: "var(--border)", opacity: 0.2,
                  }} />
                ))}
                {phaseBar && (
                  <div style={{
                    position: "absolute", ...phaseBar, top: 4, height: ROW_H - 8,
                    borderRadius: 3, background: color, opacity,
                  }} />
                )}
              </div>
            );
          })}

          {/* Today line */}
          {todayVisible && (
            <div style={{
              position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0,
              width: 2, background: "var(--blue)",
              pointerEvents: "none", zIndex: 2, opacity: 0.7,
            }} />
          )}
        </div>
      </div>
    </div>
  );
}
