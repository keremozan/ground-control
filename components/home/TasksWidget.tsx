"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Play, CheckCircle, Archive, Trash2, RefreshCw, Loader2, ChevronRight, ChevronLeft, X, Send, SkipForward, ExternalLink, ChevronDown, CalendarClock, Plus, ListChecks, BookOpen, FolderKanban } from "lucide-react";
import { ClassesTabContent } from "./ClassesWidget";
import { charIcon, charColor } from "@/lib/char-icons";
import { useChatTrigger } from "@/lib/chat-store";
import { logAction } from "@/lib/action-log";
import { formatWhen, getDateUrgency } from "@/lib/date-format";

type CharInfo = { id: string; name: string; model: string; tier: string };
const MODELS = ["haiku", "sonnet", "opus"];

type Task = {
  id: string;
  name: string;
  status: string;
  priority: string;
  track: string;
  trackId: string | null;
  assigned: string | null;
  dueDate: string | null;
  phaseId?: string;
  phaseName?: string;
};

function dueBadge(dueDate: string | null): { color: string; dot: boolean } | null {
  if (!dueDate) return null;
  return getDateUrgency(dueDate, "future", 7);
}

type PriorityFilter = "today" | "week" | "high" | "medium" | "low";

function buildTrackColor(patterns: Record<string, string>): (track: string) => string {
  const compiled = Object.entries(patterns).map(([color, pattern]) => ({
    regex: new RegExp(pattern, 'i'),
    color,
  }));
  return (track: string) => {
    for (const { regex, color } of compiled) {
      if (regex.test(track)) return color;
    }
    return "#9c9b95";
  };
}

const itemActions = [
  { icon: ExternalLink, label: "Open",    colorClass: "item-action-btn-blue"  },
  { icon: Play,         label: "Start",   colorClass: "item-action-btn-blue"  },
  { icon: CheckCircle,  label: "Done",    colorClass: "item-action-btn-green" },
  { icon: Archive,      label: "Archive", colorClass: "item-action-btn-amber" },
  { icon: Trash2,       label: "Delete",  colorClass: "item-action-btn-red"   },
];

function TabBtn({ label, icon, active, onClick }: { label: string; icon?: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "3px 8px", borderRadius: 3,
        fontFamily: "var(--font-display)", fontSize: 13, fontWeight: active ? 600 : 400,
        color: active ? "var(--text)" : "var(--text-3)",
        background: "transparent", border: "none", cursor: "pointer",
        transition: "all 0.12s",
      }}
    >
      {icon}{label}
    </button>
  );
}

// --- Projects tab ---

interface ProjectPhase {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'completed';
  taskCount: number;
  doneCount: number;
}

interface Project {
  id: string;
  name: string;
  trackId: string;
  startDate: string | null;
  deadline: string | null;
  phases: ProjectPhase[];
  lastActivity: { date: string; summary: string } | null;
}

function getHealthColor(project: Project): string {
  const now = new Date();
  const dayMs = 86400000;

  // Check deadline
  let deadlinePassed = false;
  let deadlineWithin14 = false;
  if (project.deadline) {
    const dl = new Date(project.deadline);
    if (dl < now) deadlinePassed = true;
    else if (dl.getTime() - now.getTime() < 14 * dayMs) deadlineWithin14 = true;
  }

  // Check activity staleness
  let daysSinceActivity: number | null = null;
  if (project.lastActivity?.date) {
    const parsed = new Date(project.lastActivity.date + " " + now.getFullYear());
    // If parsed date is in the future by more than 30 days, it's probably last year
    if (parsed.getTime() - now.getTime() > 30 * dayMs) {
      parsed.setFullYear(now.getFullYear() - 1);
    }
    daysSinceActivity = Math.floor((now.getTime() - parsed.getTime()) / dayMs);
  }

  // Red: deadline passed OR no activity in 14+ days
  if (deadlinePassed) return "#ef4444";
  if (daysSinceActivity !== null && daysSinceActivity >= 14) return "#ef4444";

  // Amber: deadline within 14 days OR no activity 7-14 days
  if (deadlineWithin14) return "#f59e0b";
  if (daysSinceActivity !== null && daysSinceActivity >= 7) return "#f59e0b";

  // Green: recent activity (within 7 days)
  if (daysSinceActivity !== null && daysSinceActivity < 7) return "#22c55e";

  // Gray: no activity data and no deadline pressure
  return "#9c9b95";
}

// Removed: groupByMonth, PhasePipelineBar, PhaseLabels (replaced by Gantt view)

const ROW_HEIGHT = 56;
const LEFT_COL = 180;
const MONTH_NAMES = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const DAY_MARKERS = [1, 8, 15, 22];

function ProjectsTabContent() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [getTrackColor, setGetTrackColor] = useState<(t: string) => string>(() => () => "#9c9b95");
  const [monthOffset, setMonthOffset] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [timelineWidth, setTimelineWidth] = useState(0);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/tana-projects").then(r => r.json()),
      fetch("/api/system/config").then(r => r.json()),
    ]).then(([projData, configData]) => {
      const projs: Project[] = projData.projects || [];
      setProjects(projs);
      if (configData.trackColorPatterns) {
        setGetTrackColor(() => buildTrackColor(configData.trackColorPatterns));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Measure timeline width
  useEffect(() => {
    if (!timelineRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setTimelineWidth(entry.contentRect.width);
      }
    });
    observer.observe(timelineRef.current);
    return () => observer.disconnect();
  }, [loading]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 20, gap: 8 }}>
        <Loader2 size={14} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>Loading projects...</span>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>No active projects</span>
      </div>
    );
  }

  const handleProjectClick = (projectId: string) => {
    fetch("/api/tana-tasks/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: projectId, action: "open" }),
    }).catch(() => {});
  };

  // Sort projects by startDate (earliest first), no-date projects at end
  const sorted = [...projects].sort((a, b) => {
    if (!a.startDate && !b.startDate) return 0;
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return a.startDate.localeCompare(b.startDate);
  });

  // 3-month window centered on current month + offset
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() + monthOffset - 1, 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + monthOffset + 2, 0, 23, 59, 59);
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();
  const windowDays = (windowEndMs - windowStartMs) / 86400000;

  // Build month columns
  const months: { year: number; month: number; label: string; startMs: number; endMs: number }[] = [];
  for (let i = -1; i <= 1; i++) {
    const m = new Date(now.getFullYear(), now.getMonth() + monthOffset + i, 1);
    const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59);
    months.push({
      year: m.getFullYear(),
      month: m.getMonth(),
      label: MONTH_NAMES[m.getMonth()],
      startMs: m.getTime(),
      endMs: mEnd.getTime(),
    });
  }

  // Convert date ms to pixel X within timeline
  const dateToPx = (ms: number): number => {
    if (timelineWidth <= 0) return 0;
    return ((ms - windowStartMs) / (windowEndMs - windowStartMs)) * timelineWidth;
  };

  // Today position
  const todayMs = now.getTime();
  const todayPx = dateToPx(todayMs);
  const todayVisible = todayMs >= windowStartMs && todayMs <= windowEndMs;

  return (
    <div className="widget-body" style={{ padding: 0 }}>
      {/* Navigation bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 12px", borderBottom: "1px solid var(--border)",
      }}>
        <button
          onClick={() => setMonthOffset(o => o - 1)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22, borderRadius: 4,
            border: "1px solid var(--border)", background: "var(--surface)",
            cursor: "pointer", color: "var(--text-2)",
          }}
        >
          <ChevronLeft size={12} strokeWidth={2} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
            color: "var(--text-2)", letterSpacing: "0.04em",
          }}>
            {months.map(m => m.label).join(" / ")}
          </span>
          {monthOffset !== 0 && (
            <button
              onClick={() => setMonthOffset(0)}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
                padding: "2px 6px", borderRadius: 3,
                border: "1px solid var(--border)", background: "var(--surface)",
                cursor: "pointer", color: "var(--blue)",
              }}
            >
              Today
            </button>
          )}
        </div>
        <button
          onClick={() => setMonthOffset(o => o + 1)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22, borderRadius: 4,
            border: "1px solid var(--border)", background: "var(--surface)",
            cursor: "pointer", color: "var(--text-2)",
          }}
        >
          <ChevronRight size={12} strokeWidth={2} />
        </button>
      </div>

      {/* Timeline content */}
      <div style={{ display: "flex", minHeight: 0 }}>
        {/* Left column: project names */}
        <div style={{
          width: LEFT_COL, minWidth: LEFT_COL, flexShrink: 0,
          borderRight: "1px solid var(--border)",
        }}>
          {/* Header spacer */}
          <div style={{ height: 28, borderBottom: "1px solid var(--border)" }} />
          {/* Project rows */}
          {sorted.map(project => {
            const tc = getTrackColor(project.name);
            const healthColor = getHealthColor(project);
            const activePhase = project.phases.find(p => p.status === "active");
            const totalTasks = project.phases.reduce((s, p) => s + p.taskCount, 0);
            const doneTasks = project.phases.reduce((s, p) => s + p.doneCount, 0);
            const completedPhases = project.phases.filter(p => p.status === "completed").length;
            return (
              <div
                key={project.id}
                onClick={() => handleProjectClick(project.id)}
                style={{
                  height: ROW_HEIGHT,
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "0 8px 0 0",
                  borderLeft: `3px solid ${tc}`,
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  overflow: "hidden",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--surface-hover, #f8f8f6)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: healthColor, flexShrink: 0, marginLeft: 8,
                }} />
                <div style={{ overflow: "hidden", minWidth: 0 }}>
                  <div style={{
                    fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
                    color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    lineHeight: "1.3",
                  }}>
                    {project.name}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    color: "var(--text-3)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    lineHeight: "1.3", marginTop: 1,
                  }}>
                    {activePhase ? activePhase.name : (completedPhases === project.phases.length && project.phases.length > 0 ? "All phases done" : "")}
                    {totalTasks > 0 && <span style={{ marginLeft: activePhase ? 4 : 0, opacity: 0.7 }}>{doneTasks}/{totalTasks}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right area: timeline grid */}
        <div ref={timelineRef} style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden" }}>
          {/* Month headers */}
          <div style={{
            display: "flex", height: 28,
            borderBottom: "1px solid var(--border)",
          }}>
            {months.map((m, i) => {
              const left = dateToPx(m.startMs);
              const right = dateToPx(Math.min(m.endMs, windowEndMs));
              const width = right - left;
              return (
                <div key={`${m.year}-${m.month}`} style={{
                  position: "absolute", left, width: Math.max(width, 0),
                  height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                  borderRight: i < months.length - 1 ? "1px solid var(--border)" : "none",
                }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                    color: "var(--text-3)", letterSpacing: "0.06em",
                  }}>
                    {m.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Rows with bars */}
          {sorted.map(project => {
            const tc = getTrackColor(project.name);
            const hasBar = project.startDate && project.deadline;

            let barLeft = 0;
            let barWidth = 0;
            let barVisible = false;

            if (hasBar) {
              const sMs = new Date(project.startDate!).getTime();
              const eMs = new Date(project.deadline!).getTime();
              // Clip to window
              const clampedStart = Math.max(sMs, windowStartMs);
              const clampedEnd = Math.min(eMs, windowEndMs);
              if (clampedStart < clampedEnd) {
                barLeft = dateToPx(clampedStart);
                barWidth = dateToPx(clampedEnd) - barLeft;
                barVisible = true;
              }
            }

            // Phase segments within bar
            let phaseSegments: { left: number; width: number; color: string; name: string; isActive: boolean }[] = [];
            if (barVisible && hasBar && project.phases.length > 0) {
              const sMs = new Date(project.startDate!).getTime();
              const eMs = new Date(project.deadline!).getTime();
              const totalDuration = eMs - sMs;
              const phaseCount = project.phases.length;
              const phaseDuration = totalDuration / phaseCount;

              phaseSegments = project.phases.map((phase, idx) => {
                const phaseStart = sMs + idx * phaseDuration;
                const phaseEnd = sMs + (idx + 1) * phaseDuration;
                const clampedStart = Math.max(phaseStart, windowStartMs);
                const clampedEnd = Math.min(phaseEnd, windowEndMs);

                if (clampedStart >= clampedEnd) return null;

                const segLeft = dateToPx(clampedStart);
                const segWidth = dateToPx(clampedEnd) - segLeft;
                const bg = phase.status === "completed" ? tc
                  : phase.status === "active" ? tc + "80"
                  : "#e5e5e0";

                return { left: segLeft, width: segWidth, color: bg, name: phase.name, isActive: phase.status === "active" };
              }).filter(Boolean) as { left: number; width: number; color: string; name: string; isActive: boolean }[];
            }

            // Deadline marker position
            let deadlinePx = 0;
            let deadlineVisible = false;
            if (hasBar) {
              const eMs = new Date(project.deadline!).getTime();
              if (eMs >= windowStartMs && eMs <= windowEndMs) {
                deadlinePx = dateToPx(eMs);
                deadlineVisible = true;
              }
            }

            const BAR_H = 24;

            return (
              <div
                key={project.id}
                onClick={() => handleProjectClick(project.id)}
                style={{
                  height: ROW_HEIGHT,
                  position: "relative",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--surface-hover, #f8f8f6)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                {/* Day marker lines */}
                {timelineWidth > 0 && months.map(m => (
                  DAY_MARKERS.map(d => {
                    const dayDate = new Date(m.year, m.month, d);
                    const dayMs = dayDate.getTime();
                    if (dayMs < windowStartMs || dayMs > windowEndMs) return null;
                    const x = dateToPx(dayMs);
                    return (
                      <div key={`${m.year}-${m.month}-${d}`} style={{
                        position: "absolute", left: x, top: 0, bottom: 0,
                        width: 1, background: "var(--border)", opacity: 0.4,
                        pointerEvents: "none",
                      }} />
                    );
                  })
                ))}

                {/* Bar */}
                {barVisible && (
                  phaseSegments.length > 0 ? (
                    // Render phase segments
                    <div style={{
                      position: "absolute",
                      left: barLeft, top: (ROW_HEIGHT - BAR_H) / 2,
                      width: barWidth, height: BAR_H,
                      borderRadius: 4, overflow: "hidden",
                    }}>
                      {phaseSegments.map((seg, i) => (
                        <div
                          key={i}
                          title={seg.name}
                          style={{
                            position: "absolute",
                            left: seg.left - barLeft,
                            width: seg.width,
                            height: BAR_H,
                            background: seg.color,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            overflow: "hidden",
                            borderRight: i < phaseSegments.length - 1 ? "1px solid rgba(255,255,255,0.3)" : "none",
                          }}
                        >
                          {seg.width > 50 && (
                            <span style={{
                              fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
                              color: seg.isActive ? "#fff" : (seg.color === "#e5e5e0" ? "var(--text-3)" : "#fff"),
                              textShadow: seg.color !== "#e5e5e0" ? "0 1px 2px rgba(0,0,0,0.25)" : "none",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              padding: "0 4px", letterSpacing: "0.02em",
                            }}>
                              {seg.name}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    // Single solid bar (no phases)
                    <div style={{
                      position: "absolute",
                      left: barLeft, top: (ROW_HEIGHT - BAR_H) / 2,
                      width: barWidth, height: BAR_H,
                      borderRadius: 4, background: tc + "60",
                      display: "flex", alignItems: "center",
                      overflow: "hidden",
                    }} />
                  )
                )}

                {/* Deadline diamond marker */}
                {deadlineVisible && (
                  <div style={{
                    position: "absolute",
                    left: deadlinePx - 5, top: (ROW_HEIGHT - 10) / 2,
                    width: 10, height: 10,
                    background: tc,
                    transform: "rotate(45deg)",
                    borderRadius: 1,
                    zIndex: 1,
                    pointerEvents: "none",
                  }} />
                )}
              </div>
            );
          })}

          {/* Today line (rendered on top of everything) */}
          {todayVisible && timelineWidth > 0 && (
            <div style={{
              position: "absolute", left: todayPx, top: 0, bottom: 0,
              width: 1, background: "var(--blue)",
              pointerEvents: "none", zIndex: 2,
            }} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function TasksWidget() {
  const [activeTab, setActiveTab] = useState<"projects" | "tasks" | "classes">("tasks");
  const [grouped, setGrouped] = useState<Record<string, Task[]>>({});
  const [loading, setLoading] = useState(true);
  const [priority, setPriority] = useState<PriorityFilter>("today");
  const [taskPriorities, setTaskPriorities] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskTrack, setNewTaskTrack] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"high" | "medium" | "low">("medium");
  const [creatingTask, setCreatingTask] = useState(false);
  const newTaskRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [promptTask, setPromptTask] = useState<string | null>(null);
  const [promptInput, setPromptInput] = useState("");
  const [promptChar, setPromptChar] = useState("");
  const [promptModel, setPromptModel] = useState("");
  const [characters, setCharacters] = useState<CharInfo[]>([]);
  const [trackColor, setTrackColor] = useState<(t: string) => string>(() => () => "#9c9b95");
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openDropdown) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openDropdown]);
  const { setTrigger } = useChatTrigger();

  // Track recently removed task IDs so they stay hidden even if Tana search index still returns them
  // Persisted to sessionStorage so they survive page refresh
  const removedIdsRef = useRef<Map<string, number>>(new Map());
  const removedInited = useRef(false);
  if (!removedInited.current) {
    removedInited.current = true;
    try {
      const saved = sessionStorage.getItem("tasks-removed-ids");
      if (saved) removedIdsRef.current = new Map(JSON.parse(saved));
    } catch {}
  }

  const fetchTasks = useCallback(() => {
    setLoading(true);
    // Expire removed IDs older than 5 minutes (Tana search index can lag)
    const now = Date.now();
    for (const [id, ts] of removedIdsRef.current) {
      if (now - ts > 300_000) removedIdsRef.current.delete(id);
    }
    fetch("/api/tana-tasks")
      .then(r => r.json())
      .then(d => {
        const raw = (d.tasks || {}) as Record<string, Task[]>;
        // Filter out recently removed tasks + tasks with dueDate > 30 days from now
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + 30);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const result: Record<string, Task[]> = {};
        for (const [track, tasks] of Object.entries(raw)) {
          const kept = tasks.filter(t => {
            if (removedIdsRef.current.has(t.id)) return false;
            // Exclude tasks with due date beyond 30 days (keep no-date and overdue)
            if (t.dueDate && t.dueDate > cutoffStr) return false;
            return true;
          });
          if (kept.length > 0) result[track] = kept;
        }
        setGrouped(result);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    fetch("/api/characters").then(r => r.json())
      .then((d: { characters: CharInfo[] }) => {
        setCharacters(d.characters || []);
      })
      .catch(() => {});
    fetch("/api/system/config").then(r => r.json())
      .then(d => {
        if (d.trackColorPatterns) setTrackColor(() => buildTrackColor(d.trackColorPatterns));
      })
      .catch(() => {});
  }, []);

  // --- Action handlers ---

  const busyRef = useRef(new Set<string>());

  // Optimistically remove a task from UI state (Tana search index lags behind trash)
  function removeTaskFromState(taskId: string) {
    removedIdsRef.current.set(taskId, Date.now());
    try { sessionStorage.setItem("tasks-removed-ids", JSON.stringify([...removedIdsRef.current])); } catch {}
    setGrouped(prev => {
      const next: Record<string, Task[]> = {};
      for (const [track, tasks] of Object.entries(prev)) {
        const filtered = tasks.filter(t => t.id !== taskId);
        if (filtered.length > 0) next[track] = filtered;
      }
      return next;
    });
  }

  async function doSimpleAction(task: Task, action: string) {
    if (busyRef.current.has(task.id)) return;
    busyRef.current.add(task.id);
    setBusy(prev => new Set(prev).add(task.id));
    try {
      const res = await fetch("/api/tana-tasks/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: task.id, action,
          taskName: task.name, track: task.track,
          trackId: task.trackId, assigned: task.assigned,
        }),
      });
      if (res.ok) {
        logAction({
          widget: "tasks",
          action,
          target: task.name.slice(0, 80),
          character: task.assigned || undefined,
        });
        // Remove immediately for delete/archive/done, then refetch after delay
        if (action === "delete" || action === "archive" || action === "done") {
          removeTaskFromState(task.id);
          setTimeout(fetchTasks, 3000);
        } else {
          fetchTasks();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        console.error(`Task ${action} failed:`, data.error || res.statusText);
        logAction({
          widget: "tasks",
          action: `${action}-failed`,
          target: `${task.name.slice(0, 60)}: ${data.error || res.statusText}`,
        });
      }
    } catch (err) {
      console.error(`Task ${action} error:`, err);
    } finally {
      busyRef.current.delete(task.id);
      setBusy(prev => { const n = new Set(prev); n.delete(task.id); return n; });
    }
  }

  async function doReschedule(task: Task) {
    if (busyRef.current.has(task.id)) return;
    busyRef.current.add(task.id);
    setBusy(prev => new Set(prev).add(task.id));
    try {
      const res = await fetch("/api/tana-tasks/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: task.id, action: "reschedule",
          taskName: task.name, track: task.track,
          trackId: task.trackId, assigned: task.assigned,
        }),
      });
      if (res.body) {
        const reader = res.body.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
      logAction({
        widget: "tasks",
        action: "reschedule",
        target: task.name.slice(0, 80),
        character: "clerk",
      });
      setTimeout(fetchTasks, 3000);
    } catch (err) {
      console.error("Reschedule error:", err);
    } finally {
      busyRef.current.delete(task.id);
      setBusy(prev => { const n = new Set(prev); n.delete(task.id); return n; });
    }
  }

  // Start task: prepare (read + set in-progress) then trigger Chat
  async function doStartAction(task: Task, userPrompt?: string, charOverride?: string, modelOverride?: string) {
    setBusy(prev => new Set(prev).add(task.id));
    setPromptTask(null);
    setPromptInput("");

    try {
      const res = await fetch("/api/tana-tasks/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: task.id, action: "prepare",
          taskName: task.name, track: task.track,
          trackId: task.trackId, assigned: task.assigned,
        }),
      });
      const data = await res.json();
      if (!data.ok) return;

      const displayName = charOverride || ((data.character || "postman").charAt(0).toUpperCase() + (data.character || "postman").slice(1));
      const seed = userPrompt
        ? `Work on this task: [${task.name}](tana:${task.id})\n\nUser context: ${userPrompt}`
        : `Work on this task: [${task.name}](tana:${task.id})`;

      // Only pass model if it differs from character default
      const charInfo = characters.find(c => c.name === displayName);
      const effectiveModel = (modelOverride && modelOverride !== charInfo?.model) ? modelOverride : undefined;

      setTrigger({
        charName: displayName,
        seedPrompt: seed,
        action: "start",
        context: `Tana node ID: ${task.id} — use read_node to see full context, children, and linked nodes.\n\n${data.context}`,
        model: effectiveModel,
      });

      logAction({
        widget: "tasks",
        action: "start",
        target: task.name.slice(0, 80),
        character: displayName,
        detail: effectiveModel ? `model: ${effectiveModel}` : undefined,
      });

      fetchTasks();
    } finally {
      setBusy(prev => { const n = new Set(prev); n.delete(task.id); return n; });
    }
  }

  async function openInTana(task: Task) {
    try {
      await fetch("/api/tana-tasks/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: task.id, action: "open" }),
      });
    } catch {}
  }

  async function setPriorityDirect(task: Task, next: string) {
    const current = taskPriorities[task.id] ?? task.priority;
    if (current === next) return;
    setTaskPriorities(prev => ({ ...prev, [task.id]: next }));
    try {
      await fetch("/api/tana-tasks/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: task.id, action: "set-priority", priority: next }),
      });
    } catch {
      setTaskPriorities(prev => ({ ...prev, [task.id]: current }));
    }
  }

  function handleAction(task: Task, action: string) {
    if (busy.has(task.id)) return;
    switch (action) {
      case "Open":    openInTana(task); break;
      case "Start": {
        const assignedChar = characters.find(c => c.name.toLowerCase() === (task.assigned || "").toLowerCase());
        const defaultChar = assignedChar || characters.find(c => c.name.toLowerCase() === "postman") || characters[0];
        setPromptTask(task.id);
        setPromptInput("");
        setPromptChar(defaultChar?.name || "Postman");
        setPromptModel(defaultChar?.model || "sonnet");
        setTimeout(() => promptRef.current?.focus(), 50);
        break;
      }
      case "Done":    doSimpleAction(task, "done"); break;
      case "Archive": doSimpleAction(task, "archive"); break;
      case "Delete":  doSimpleAction(task, "delete"); break;
    }
  }

  // Apply filter
  const filtered: Record<string, Task[]> = {};
  if (priority === "today") {
    for (const [track, tasks] of Object.entries(grouped)) {
      const match = tasks.filter(t => {
        if (!t.dueDate) return false;
        const u = dueBadge(t.dueDate);
        return u?.dot === true && (u.color === "#d97706" || u.color === "#dc2626");
      });
      if (match.length > 0) filtered[track] = match;
    }
  } else if (priority === "week") {
    for (const [track, tasks] of Object.entries(grouped)) {
      const match = tasks.filter(t => {
        if (!t.dueDate) return false;
        const badge = dueBadge(t.dueDate);
        return badge !== null; // dueBadge returns non-null for overdue, today, and within 7 days
      });
      if (match.length > 0) filtered[track] = match;
    }
  } else {
    for (const [track, tasks] of Object.entries(grouped)) {
      const match = tasks.filter(t => (taskPriorities[t.id] ?? t.priority) === priority);
      if (match.length > 0) filtered[track] = match;
    }
  }

  const tracks = Object.keys(filtered);
  const allFiltered = Object.values(filtered).flat();
  const activeTasks = allFiltered.filter(t => t.status === "in-progress").length;
  const totalFiltered = allFiltered.length;

  // Count per priority for filter chips
  const allTasks = Object.values(grouped).flat();
  const priorityCounts: Record<string, number> = { high: 0, medium: 0, low: 0 };
  let todayCount = 0;
  let weekCount = 0;
  for (const t of allTasks) {
    const p = taskPriorities[t.id] ?? t.priority;
    if (p in priorityCounts) priorityCounts[p]++;
    if (t.dueDate) {
      const u = dueBadge(t.dueDate);
      if (u?.dot && (u.color === "#d97706" || u.color === "#dc2626")) todayCount++;
      if (u?.dot) weekCount++;
    }
  }

  const toggleTrack = (track: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(track)) next.delete(track);
      else next.add(track);
      return next;
    });
  };

  useEffect(() => {
    setExpanded(new Set(Object.keys(filtered)));
  }, [grouped, priority]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="widget">
      <div className="widget-header">
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <TabBtn label="Projects" icon={<FolderKanban size={13} strokeWidth={1.5} />} active={activeTab === "projects"} onClick={() => setActiveTab("projects")} />
          <TabBtn label="Tasks" icon={<ListChecks size={13} strokeWidth={1.5} />} active={activeTab === "tasks"} onClick={() => setActiveTab("tasks")} />
          <TabBtn label="Classes" icon={<BookOpen size={13} strokeWidth={1.5} />} active={activeTab === "classes"} onClick={() => setActiveTab("classes")} />
        </div>
        {activeTab === "tasks" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
              {loading ? "..." : <><span style={{ color: "var(--blue)", fontWeight: 600 }}>{activeTasks}</span>/{totalFiltered}</>}
            </span>
            <button className="widget-toolbar-btn" data-tip="Add task" onClick={() => { setShowNewTask(true); setTimeout(() => newTaskRef.current?.focus(), 50); }}>
              <Plus size={12} strokeWidth={1.5} />
            </button>
            <button className="widget-toolbar-btn" data-tip="Refresh" onClick={fetchTasks}>
              <RefreshCw size={12} strokeWidth={1.5} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
            </button>
          </div>
        )}
      </div>

      {activeTab === "tasks" && <>
      {/* Inline new task form */}
      {showNewTask && (() => {
        const tracks = Object.entries(grouped).map(([name, tasks]) => ({
          name,
          id: tasks[0]?.trackId || null,
        })).filter(t => t.id);

        const submitNewTask = async () => {
          if (!newTaskTitle.trim() || creatingTask) return;
          setCreatingTask(true);
          try {
            await fetch("/api/tana-tasks/action", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "create",
                title: newTaskTitle.trim(),
                priority: newTaskPriority,
                trackId: newTaskTrack || undefined,
              }),
            });
            setNewTaskTitle("");
            setNewTaskTrack("");
            setShowNewTask(false);
            fetchTasks();
          } finally { setCreatingTask(false); }
        };

        const selectStyle: React.CSSProperties = {
          fontFamily: "var(--font-mono)", fontSize: 10,
          padding: "3px 6px", borderRadius: 4,
          background: "var(--surface)", border: "1px solid var(--border)",
          color: "var(--text)", outline: "none",
        };

        return (
          <div style={{ padding: "6px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                ref={newTaskRef}
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") submitNewTask();
                  if (e.key === "Escape") { setShowNewTask(false); setNewTaskTitle(""); }
                }}
                placeholder="Task title..."
                disabled={creatingTask}
                style={{
                  flex: 1, fontFamily: "var(--font-body)", fontSize: 11,
                  padding: "4px 8px", borderRadius: 4,
                  background: "var(--surface)", border: "1px solid var(--border)",
                  color: "var(--text)", outline: "none",
                }}
              />
              {creatingTask && <Loader2 size={12} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <select value={newTaskTrack} onChange={e => setNewTaskTrack(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                <option value="">No track (inbox)</option>
                {tracks.map(t => <option key={t.id} value={t.id!}>{t.name}</option>)}
              </select>
              <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value as "high" | "medium" | "low")} style={selectStyle}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <button onClick={submitNewTask} disabled={creatingTask || !newTaskTitle.trim()}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
                  padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)",
                  background: newTaskTitle.trim() ? "var(--blue)" : "var(--surface)",
                  color: newTaskTitle.trim() ? "#fff" : "var(--text-3)",
                  cursor: newTaskTitle.trim() ? "pointer" : "default", flexShrink: 0,
                }}>
                Add
              </button>
              <button onClick={() => { setShowNewTask(false); setNewTaskTitle(""); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 20, height: 20, borderRadius: 4, border: "1px solid var(--border)",
                  background: "var(--surface)", cursor: "pointer", color: "var(--text-3)", flexShrink: 0,
                }}>
                <X size={10} strokeWidth={2} />
              </button>
            </div>
          </div>
        );
      })()}

      {/* Filter chips */}
      <div style={{
        display: "flex", gap: 4, padding: "6px 16px 2px",
        borderBottom: "1px solid var(--border)",
      }}>
        {/* Today chip */}
        {(() => {
          const active = priority === "today";
          const dotColor = "#d97706";
          return (
            <button
              onClick={() => setPriority("today")}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
                letterSpacing: "0.04em", textTransform: "uppercase",
                padding: "3px 8px", borderRadius: 3,
                border: "1px solid",
                borderColor: active ? "var(--border)" : "transparent",
                background: active ? "var(--surface-2)" : "transparent",
                color: active ? "var(--text)" : "var(--text-3)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
              {`Today (${todayCount})`}
            </button>
          );
        })()}
        {(() => {
          const active = priority === "week";
          const dotColor = "#0d9488";
          return (
            <button
              onClick={() => setPriority("week")}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
                letterSpacing: "0.04em", textTransform: "uppercase",
                padding: "3px 8px", borderRadius: 3,
                border: "1px solid",
                borderColor: active ? "var(--border)" : "transparent",
                background: active ? "var(--surface-2)" : "transparent",
                color: active ? "var(--text)" : "var(--text-3)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
              {`Week (${weekCount})`}
            </button>
          );
        })()}
        {(["high", "medium", "low"] as const).map(p => {
          const active = priority === p;
          const dotColor = p === "high" ? "#ef4444" : p === "medium" ? "#f59e0b" : "#9ca3af";
          const label = p === "high" ? `High (${priorityCounts.high})` : p === "medium" ? `Med (${priorityCounts.medium})` : `Low (${priorityCounts.low})`;
          return (
            <button
              key={p}
              onClick={() => setPriority(p)}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
                letterSpacing: "0.04em", textTransform: "uppercase",
                padding: "3px 8px", borderRadius: 3,
                border: "1px solid",
                borderColor: active ? "var(--border)" : "transparent",
                background: active ? "var(--surface-2)" : "transparent",
                color: active ? "var(--text)" : "var(--text-3)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
              {label}
            </button>
          );
        })}
      </div>

      <div className="widget-body" style={{ padding: "8px 0" }}>
        {loading && allTasks.length === 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 20, gap: 8 }}>
            <Loader2 size={14} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>Loading from Tana...</span>
          </div>
        )}

        {!loading && tracks.length === 0 && (
          <div style={{ padding: "16px", textAlign: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
              {priority === "today" ? "Nothing due today" : priority === "week" ? "Nothing due this week" : `No ${priority}-priority tasks`}
            </span>
          </div>
        )}

        {tracks.map((track, i) => {
          const tasks = filtered[track];
          const color = trackColor(track);
          const isExpanded = expanded.has(track);

          return (
            <div key={track} style={{
              paddingLeft: 16, paddingRight: 0,
              paddingTop: i > 0 ? 10 : 0,
              paddingBottom: i < tracks.length - 1 ? 10 : 0,
              borderBottom: i < tracks.length - 1 ? "1px solid var(--border)" : "none",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  onClick={() => toggleTrack(track)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 16px 5px 0", cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <ChevronRight
                    size={10} strokeWidth={2}
                    style={{
                      color, flexShrink: 0, opacity: 0.6,
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.15s ease",
                    }}
                  />
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
                    color, textTransform: "uppercase", letterSpacing: "0.06em",
                    opacity: 0.8, flex: 1,
                  }}>
                    {track}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    color: "var(--text-3)", opacity: 0.6,
                  }}>
                    {tasks.length}
                  </span>
                </div>

                {isExpanded && (() => {
                  // Group tasks by phase within track
                  const phaseGroups: { name: string | null; tasks: Task[] }[] = [];
                  const byPhase = new Map<string, Task[]>();
                  const standalone: Task[] = [];
                  for (const t of tasks) {
                    if (t.phaseName) {
                      (byPhase.get(t.phaseName) || (() => { const a: Task[] = []; byPhase.set(t.phaseName!, a); return a; })()).push(t);
                    } else {
                      standalone.push(t);
                    }
                  }
                  if (standalone.length > 0) phaseGroups.push({ name: null, tasks: standalone });
                  for (const [name, pts] of byPhase) phaseGroups.push({ name, tasks: pts });

                  return phaseGroups.map((group) => (
                    <div key={group.name || '__standalone'}>
                      {group.name && (
                        <div style={{
                          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
                          color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em",
                          padding: "6px 16px 2px 16px", opacity: 0.7,
                        }}>
                          {group.name}
                        </div>
                      )}
                      {group.tasks.map(task => {
                  const isBusy = busy.has(task.id);

                  const taskPriority = taskPriorities[task.id] ?? task.priority;
                  const priorityDot = taskPriority === "high" ? "#ef4444" : taskPriority === "medium" ? "#f59e0b" : "#9ca3af";

                  return (
                    <div key={task.id}>
                      <div
                        className="item-row"
                        style={{
                          opacity: isBusy ? 0.6 : 1,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", padding: "4px 16px 4px 16px", gap: 0, cursor: "pointer" }}>
                          {/* When column */}
                          <span style={{ width: 72, flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
                            {task.dueDate ? (() => {
                              const urgency = dueBadge(task.dueDate);
                              return (
                                <>
                                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: urgency?.dot ? urgency.color : "transparent", flexShrink: 0 }} />
                                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: urgency?.color || "var(--text-3)", whiteSpace: "nowrap" }}>
                                    {formatWhen(task.dueDate, false)}
                                  </span>
                                </>
                              );
                            })() : null}
                          </span>
                          {/* Character icon */}
                          {(() => {
                            const key = task.assigned ? task.assigned.charAt(0).toUpperCase() + task.assigned.slice(1) : "";
                            const Icon = key ? charIcon[key] : null;
                            const color = task.assigned ? charColor[task.assigned] || "var(--text-3)" : "var(--text-3)";
                            return Icon ? (
                              <span data-tip={key} style={{ display: "flex", flexShrink: 0, marginRight: 6 }}>
                                <Icon size={12} strokeWidth={1.5} style={{ color }} />
                              </span>
                            ) : null;
                          })()}
                          <span style={{
                            fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: "var(--text)",
                            flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {task.name}
                          </span>
                          {isBusy && (
                            <Loader2 size={10} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite", flexShrink: 0 }} />
                          )}
                        </div>

                        <div className="item-actions" style={{ padding: "0 16px 4px 34px" }}>
                          {itemActions.flatMap(({ icon: ActionIcon, label, colorClass }) => {
                            const btn = (
                              <button
                                key={label}
                                className={`item-action-btn ${colorClass}`}
                                data-tip={label}
                                disabled={isBusy}
                                onClick={() => handleAction(task, label)}
                                style={{ cursor: isBusy ? "not-allowed" : "pointer" }}
                              >
                                <ActionIcon size={12} strokeWidth={1.5} />
                              </button>
                            );
                            if (label === "Archive" && task.dueDate && dueBadge(task.dueDate)?.color === '#dc2626') {
                              return [btn, (
                                <button
                                  key="Reschedule"
                                  className="item-action-btn item-action-btn-amber"
                                  data-tip="Reschedule"
                                  disabled={isBusy}
                                  onClick={e => { e.stopPropagation(); doReschedule(task); }}
                                  style={{ cursor: isBusy ? "not-allowed" : "pointer" }}
                                >
                                  <CalendarClock size={12} strokeWidth={1.5} />
                                </button>
                              )];
                            }
                            return [btn];
                          })}
                          {/* Priority dropdown in action bar */}
                          <div ref={openDropdown === task.id ? dropdownRef : undefined} style={{ position: "relative", display: "inline-flex" }}>
                            <button
                              className="item-action-btn task-priority-btn"
                              data-tip="Priority"
                              disabled={isBusy}
                              onClick={e => { e.stopPropagation(); setOpenDropdown(openDropdown === task.id ? null : task.id); }}
                              style={{ cursor: isBusy ? "not-allowed" : "pointer" }}
                            >
                              <span style={{ width: 7, height: 7, borderRadius: "50%", background: priorityDot, flexShrink: 0 }} />
                            </button>
                            {openDropdown === task.id && (
                              <div style={{
                                position: "absolute", left: 0, top: "calc(100% + 2px)", zIndex: 50,
                                background: "var(--surface)", border: "1px solid var(--border)",
                                borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                padding: "3px 0", minWidth: 110,
                              }}>
                                {([
                                  { p: "high",   color: "#ef4444", label: "High"   },
                                  { p: "medium", color: "#f59e0b", label: "Medium" },
                                  { p: "low",    color: "#9ca3af", label: "Low"    },
                                ] as const).map(({ p, color, label }) => (
                                  <button
                                    key={p}
                                    onClick={e => { e.stopPropagation(); setPriorityDirect(task, p); setOpenDropdown(null); }}
                                    style={{
                                      display: "flex", alignItems: "center", gap: 7,
                                      width: "100%", padding: "5px 10px",
                                      border: "none", background: taskPriority === p ? "var(--surface-2)" : "transparent",
                                      cursor: "pointer", textAlign: "left",
                                      color: taskPriority === p ? "var(--text)" : "var(--text-2)",
                                    }}
                                  >
                                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{label}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Prompt input with character + model selectors */}
                      {promptTask === task.id && !isBusy && (
                        <div style={{
                          borderTop: "1px solid var(--border)", background: "var(--surface-2)",
                          padding: "8px 10px", display: "flex", flexDirection: "column" as const, gap: 6,
                        }}>
                          <textarea
                            ref={promptRef}
                            value={promptInput}
                            onChange={e => setPromptInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doStartAction(task, promptInput.trim() || undefined, promptChar, promptModel); }
                              if (e.key === "Escape") { setPromptTask(null); setPromptInput(""); }
                            }}
                            placeholder="Add context... (or skip)"
                            rows={1}
                            style={{
                              fontFamily: "var(--font-mono)", fontSize: 10,
                              background: "var(--surface)", border: "1px solid var(--border)",
                              borderRadius: 4, padding: "4px 8px", color: "var(--text)",
                              outline: "none", width: "100%", resize: "vertical",
                              minHeight: 24, maxHeight: 120, lineHeight: 1.5,
                              boxSizing: "border-box",
                            }}
                          />
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <select
                              value={promptChar}
                              onChange={e => {
                                const name = e.target.value;
                                setPromptChar(name);
                                const c = characters.find(ch => ch.name === name);
                                if (c) setPromptModel(c.model);
                              }}
                              style={{
                                fontFamily: "var(--font-mono)", fontSize: 10,
                                background: "var(--surface)", border: "1px solid var(--border)",
                                borderRadius: 4, padding: "3px 6px", color: "var(--text)",
                                outline: "none",
                                borderLeft: `3px solid ${charColor[promptChar.toLowerCase()] || "var(--text-3)"}`,
                              }}
                            >
                              {characters.map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                            <select
                              value={promptModel}
                              onChange={e => setPromptModel(e.target.value)}
                              style={{
                                fontFamily: "var(--font-mono)", fontSize: 10,
                                background: "var(--surface)", border: "1px solid var(--border)",
                                borderRadius: 4, padding: "3px 6px", color: "var(--text)",
                                outline: "none", minWidth: 60,
                              }}
                            >
                              {MODELS.map(m => (
                                <option key={m} value={m}>{m}{m === characters.find(c => c.name === promptChar)?.model ? " *" : ""}</option>
                              ))}
                            </select>
                            <div style={{ flex: 1 }} />
                            <button
                              className="item-action-btn item-action-btn-blue"
                              data-tip="Start task"
                              onClick={() => doStartAction(task, promptInput.trim() || undefined, promptChar, promptModel)}
                              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 3, width: "auto", padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 9 }}
                            >
                              <Play size={10} strokeWidth={1.5} />
                              Go
                            </button>
                            <button
                              className="item-action-btn"
                              data-tip="Cancel"
                              onClick={() => { setPromptTask(null); setPromptInput(""); }}
                              style={{ cursor: "pointer" }}
                            >
                              <X size={11} strokeWidth={1.5} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                    </div>
                  ));
                })()}
              </div>
            </div>
          );
        })}
      </div>
      </>}
      {activeTab === "projects" && <ProjectsTabContent />}
      {activeTab === "classes" && <ClassesTabContent />}
    </div>
  );
}
