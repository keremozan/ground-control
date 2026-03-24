"use client";
import { useState, useRef, useEffect } from "react";
import { Play, CheckCircle, Archive, Trash2, Loader2, ChevronRight, X, ExternalLink, CalendarClock } from "lucide-react";
import { charIcon, charColor } from "@/lib/char-icons";
import { formatWhen, getDateUrgency, type DateUrgency } from "@/lib/date-format";
import type { Task } from "@/types";

export type PriorityFilter = "today" | "week" | "high" | "medium" | "low";

type CharInfo = { id: string; name: string; model?: string; tier: string };

const MODELS = ["haiku", "sonnet", "opus"];

const itemActions = [
  { icon: ExternalLink, label: "Open",    colorClass: "item-action-btn-blue"  },
  { icon: Play,         label: "Start",   colorClass: "item-action-btn-blue"  },
  { icon: CheckCircle,  label: "Done",    colorClass: "item-action-btn-green" },
  { icon: Archive,      label: "Archive", colorClass: "item-action-btn-amber" },
  { icon: Trash2,       label: "Delete",  colorClass: "item-action-btn-red"   },
];

function dueBadge(dueDate: string | null): DateUrgency | null {
  if (!dueDate) return null;
  return getDateUrgency(dueDate, "future", 7);
}

// Pure filter helper exported for parent re-use
export function buildFiltered(
  grouped: Record<string, Task[]>,
  filter: PriorityFilter,
  taskPriorities: Record<string, string>,
): Record<string, Task[]> {
  const out: Record<string, Task[]> = {};
  for (const [track, tasks] of Object.entries(grouped)) {
    let match: Task[];
    if (filter === "today") {
      match = tasks.filter(t => {
        if (!t.dueDate) return false;
        const u = getDateUrgency(t.dueDate, "future", 7);
        return u?.dot === true && (u.level === "today" || u.level === "overdue");
      });
    } else if (filter === "week") {
      match = tasks.filter(t => {
        if (!t.dueDate) return false;
        const u = getDateUrgency(t.dueDate, "future", 7);
        return u !== null && u.dot === true;
      });
    } else {
      match = tasks.filter(t => (taskPriorities[t.id] ?? t.priority) === filter);
    }
    if (match.length > 0) out[track] = match;
  }
  return out;
}

interface TaskRowProps {
  task: Task;
  isBusy: boolean;
  taskPriority: string;
  characters: CharInfo[];
  openDropdown: string | null;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  promptTask: string | null;
  promptInput: string;
  promptRef: React.RefObject<HTMLTextAreaElement | null>;
  promptChar: string;
  promptModel: string;
  onAction: (task: Task, label: string) => void;
  onReschedule: (task: Task) => void;
  onSetPriority: (task: Task, p: string) => void;
  onStartWithPrompt: (task: Task, prompt?: string, char?: string, model?: string) => void;
  onPromptTaskChange: (id: string | null) => void;
  setPromptInput: (v: string) => void;
  setPromptChar: (v: string) => void;
  setPromptModel: (v: string) => void;
  setOpenDropdown: (v: string | null) => void;
}

function TaskRow({
  task, isBusy, taskPriority, characters,
  openDropdown, dropdownRef, promptTask, promptInput, promptRef, promptChar, promptModel,
  onAction, onReschedule, onSetPriority, onStartWithPrompt, onPromptTaskChange,
  setPromptInput, setPromptChar, setPromptModel, setOpenDropdown,
}: TaskRowProps) {
  const priorityDot = taskPriority === "high" ? "var(--red)" : taskPriority === "medium" ? "var(--amber)" : "var(--accent-muted)";
  const charKey = task.assigned ? task.assigned.charAt(0).toUpperCase() + task.assigned.slice(1) : "";
  const CharIcon = charKey ? charIcon[charKey] : null;
  const charCol = task.assigned ? charColor[task.assigned] || "var(--text-3)" : "var(--text-3)";

  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <div className="item-row" style={{ opacity: isBusy ? 0.6 : 1 }}>
        <div style={{ display: "flex", alignItems: "center", padding: "8px 14px", gap: 8, cursor: "pointer" }}>
          <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
            {task.dueDate && (() => {
              const urgency = dueBadge(task.dueDate);
              return (<>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: urgency?.dot ? urgency.color : "transparent", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: urgency?.color || "var(--text-3)", whiteSpace: "nowrap" }}>
                  {urgency?.level === "overdue" ? `overdue · ${formatWhen(task.dueDate, false)}` : formatWhen(task.dueDate, false)}
                </span>
              </>);
            })()}
          </span>
          {CharIcon && (
            <span data-tip={charKey} style={{ display: "flex", flexShrink: 0 }}>
              <CharIcon size={12} strokeWidth={1.5} style={{ color: charCol }} />
            </span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {task.name}
              </span>
              {isBusy && <Loader2 size={10} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite", flexShrink: 0 }} />}
            </div>
            <div className="item-actions" style={{ padding: "4px 0 0 0" }}>
              {itemActions.flatMap(({ icon: ActionIcon, label, colorClass }) => {
                const btn = (
                  <button key={label} className={`item-action-btn ${colorClass}`} data-tip={label}
                    disabled={isBusy} onClick={() => onAction(task, label)} style={{ cursor: isBusy ? "not-allowed" : "pointer" }}>
                    <ActionIcon size={12} strokeWidth={1.5} />
                  </button>
                );
                if (label === "Archive" && task.dueDate && dueBadge(task.dueDate)?.level === 'overdue') {
                  return [btn, (
                    <button key="Reschedule" className="item-action-btn item-action-btn-amber" data-tip="Reschedule"
                      disabled={isBusy} onClick={e => { e.stopPropagation(); onReschedule(task); }} style={{ cursor: isBusy ? "not-allowed" : "pointer" }}>
                      <CalendarClock size={12} strokeWidth={1.5} />
                    </button>
                  )];
                }
                return [btn];
              })}
              <div ref={openDropdown === task.id ? dropdownRef : undefined} style={{ position: "relative", display: "inline-flex" }}>
                <button className="item-action-btn task-priority-btn" data-tip="Priority" disabled={isBusy}
                  onClick={e => { e.stopPropagation(); setOpenDropdown(openDropdown === task.id ? null : task.id); }}
                  style={{ cursor: isBusy ? "not-allowed" : "pointer" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: priorityDot, flexShrink: 0 }} />
                </button>
                {openDropdown === task.id && (
                  <div style={{ position: "absolute", left: 0, top: "calc(100% + 2px)", zIndex: 50, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "3px 0", minWidth: 110 }}>
                    {([
                      { p: "high", color: "var(--red)", label: "High" },
                      { p: "medium", color: "var(--amber)", label: "Medium" },
                      { p: "low", color: "var(--accent-muted)", label: "Low" },
                    ] as const).map(({ p, color, label }) => (
                      <button key={p} onClick={e => { e.stopPropagation(); onSetPriority(task, p); setOpenDropdown(null); }}
                        style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "5px 10px", border: "none", background: taskPriority === p ? "var(--surface-2)" : "transparent", cursor: "pointer", textAlign: "left", color: taskPriority === p ? "var(--text)" : "var(--text-2)" }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {promptTask === task.id && !isBusy && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)", padding: "8px 10px", display: "flex", flexDirection: "column" as const, gap: 6 }}>
          <textarea ref={promptRef} value={promptInput} onChange={e => setPromptInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onStartWithPrompt(task, promptInput.trim() || undefined, promptChar, promptModel); }
              if (e.key === "Escape") { onPromptTaskChange(null); setPromptInput(""); }
            }}
            placeholder="Add context... (or skip)" rows={1}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 8px", color: "var(--text)", outline: "none", width: "100%", resize: "vertical", minHeight: 24, maxHeight: 120, lineHeight: 1.5, boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <select value={promptChar} onChange={e => { const n = e.target.value; setPromptChar(n); const c = characters.find(ch => ch.name === n); if (c) setPromptModel(c.model || 'sonnet'); }}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 6px", color: "var(--text)", outline: "none", borderLeft: `3px solid ${charColor[promptChar.toLowerCase()] || "var(--text-3)"}` }}>
              {characters.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <select value={promptModel} onChange={e => setPromptModel(e.target.value)}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 6px", color: "var(--text)", outline: "none", minWidth: 60 }}>
              {MODELS.map(m => <option key={m} value={m}>{m}{m === characters.find(c => c.name === promptChar)?.model ? " *" : ""}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            <button className="item-action-btn item-action-btn-blue" data-tip="Start task"
              onClick={() => onStartWithPrompt(task, promptInput.trim() || undefined, promptChar, promptModel)}
              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 3, width: "auto", padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 9 }}>
              <Play size={10} strokeWidth={1.5} /> Go
            </button>
            <button className="item-action-btn" data-tip="Cancel" onClick={() => { onPromptTaskChange(null); setPromptInput(""); }} style={{ cursor: "pointer" }}>
              <X size={11} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  tasks: Task[];
  trackColor: (text: string) => string | null;
  busy: Set<string>;
  characters: CharInfo[];
  filterKey: PriorityFilter;
  onFilterChange: (f: PriorityFilter) => void;
  taskPriorities: Record<string, string>;
  grouped: Record<string, Task[]>;
  loading: boolean;
  onAction: (task: Task, action: string) => void;
  onReschedule: (task: Task) => void;
  onSetPriority: (task: Task, priority: string) => void;
  onStartWithPrompt: (task: Task, prompt?: string, char?: string, model?: string) => void;
  promptTask: string | null;
  onPromptTaskChange: (id: string | null) => void;
}

export default function TaskList({
  trackColor, busy, characters, filterKey, onFilterChange,
  taskPriorities, grouped, loading,
  onAction, onReschedule, onSetPriority, onStartWithPrompt,
  promptTask, onPromptTaskChange,
}: Props) {
  const [promptInput, setPromptInput] = useState("");
  const [promptChar, setPromptChar] = useState("");
  const [promptModel, setPromptModel] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const filtered = buildFiltered(grouped, filterKey, taskPriorities);
    setExpanded(new Set(Object.keys(filtered)));
  }, [grouped, filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openDropdown) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpenDropdown(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openDropdown]);

  const allTasks = Object.values(grouped).flat();
  const filtered = buildFiltered(grouped, filterKey, taskPriorities);
  const trackKeys = Object.keys(filtered);
  const allFiltered = Object.values(filtered).flat();
  const activeTasks = allFiltered.filter(t => t.status === "in-progress").length;
  const totalFiltered = allFiltered.length;

  const priorityCounts: Record<string, number> = { high: 0, medium: 0, low: 0 };
  let todayCount = 0, weekCount = 0;
  for (const t of allTasks) {
    const p = taskPriorities[t.id] ?? t.priority;
    if (p in priorityCounts) priorityCounts[p]++;
    if (t.dueDate) {
      const u = dueBadge(t.dueDate);
      if (u?.dot && (u.level === "today" || u.level === "overdue")) todayCount++;
      if (u?.dot) weekCount++;
    }
  }

  const toggleTrack = (track: string) => {
    setExpanded(prev => { const next = new Set(prev); next.has(track) ? next.delete(track) : next.add(track); return next; });
  };

  function handleAction(task: Task, action: string) {
    if (busy.has(task.id)) return;
    if (action === "Start") {
      const assignedChar = characters.find(c => c.name.toLowerCase() === (task.assigned || "").toLowerCase());
      const defaultChar = assignedChar || characters.find(c => c.name.toLowerCase() === "postman") || characters[0];
      setPromptChar(defaultChar?.name || "Postman");
      setPromptModel(defaultChar?.model || "sonnet");
      setPromptInput("");
      onPromptTaskChange(task.id);
      setTimeout(() => promptRef.current?.focus(), 50);
      return;
    }
    onAction(task, action);
  }

  const rowProps = { busy, taskPriorities, characters, openDropdown, dropdownRef, promptTask, promptInput, promptRef, promptChar, promptModel, onAction: handleAction, onReschedule, onSetPriority, onStartWithPrompt, onPromptTaskChange, setPromptInput, setPromptChar, setPromptModel, setOpenDropdown };

  const filterChips = [
    { key: "today" as const, label: `Today (${todayCount})`, dot: "var(--amber)" },
    { key: "week" as const,  label: `Week (${weekCount})`,   dot: "var(--teal)" },
    { key: "high" as const,  label: `High (${priorityCounts.high})`,   dot: "var(--red)" },
    { key: "medium" as const, label: `Med (${priorityCounts.medium})`, dot: "var(--amber)" },
    { key: "low" as const,   label: `Low (${priorityCounts.low})`,     dot: "var(--accent-muted)" },
  ];

  return (
    <div className="col-full">
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 16px 2px", borderBottom: "1px solid var(--border)" }}>
        {filterChips.map(({ key, label, dot }) => {
          const active = filterKey === key;
          return (
            <button key={key} onClick={() => onFilterChange(key)} style={{
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
              letterSpacing: "0.04em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 3,
              border: "1px solid", borderColor: active ? "var(--border)" : "transparent",
              background: active ? "var(--surface-2)" : "transparent",
              color: active ? "var(--text)" : "var(--text-3)", cursor: "pointer",
              transition: "all 0.15s ease", display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: dot, flexShrink: 0 }} />
              {label}
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        <span className="mono-xs">
          {loading ? "..." : <><span style={{ color: "var(--blue)", fontWeight: 600 }}>{activeTasks}</span>/{totalFiltered}</>}
        </span>
      </div>

      <div className="widget-body" style={{ padding: 0 }}>
        {loading && allTasks.length === 0 && (
          <div className="loading-row">
            <Loader2 size={14} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
            <span className="mono-xs">Loading from Tana...</span>
          </div>
        )}
        {!loading && trackKeys.length === 0 && (
          <div className="empty-state">
            <span className="mono-xs">
              {filterKey === "today" ? "Nothing due today" : filterKey === "week" ? "Nothing due this week" : `No ${filterKey}-priority tasks`}
            </span>
          </div>
        )}
        {trackKeys.map((track, i) => {
          const trackTasks = filtered[track];
          const color = trackColor(track) ?? "var(--text-3)";
          const isExpanded = expanded.has(track);
          const byPhase = new Map<string, Task[]>();
          const standalone: Task[] = [];
          for (const t of trackTasks) {
            if (t.phaseName) { if (!byPhase.has(t.phaseName)) byPhase.set(t.phaseName, []); byPhase.get(t.phaseName)!.push(t); }
            else standalone.push(t);
          }
          const groups: { name: string | null; tasks: Task[] }[] = [];
          if (standalone.length > 0) groups.push({ name: null, tasks: standalone });
          for (const [name, pts] of byPhase) groups.push({ name, tasks: pts });

          return (
            <div key={track} style={{ paddingTop: i > 0 ? 10 : 0, paddingBottom: i < trackKeys.length - 1 ? 10 : 0, borderBottom: i < trackKeys.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div onClick={() => toggleTrack(track)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 14px", cursor: "pointer", userSelect: "none" }}>
                  <ChevronRight size={10} strokeWidth={2} style={{ color, flexShrink: 0, opacity: 0.6, transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500, color, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.8, flex: 1 }}>{track}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", opacity: 0.6 }}>{trackTasks.length}</span>
                </div>
                {isExpanded && groups.map(group => (
                  <div key={group.name || '__standalone'}>
                    {group.name && (
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 14px 2px 28px", opacity: 0.7 }}>
                        {group.name}
                      </div>
                    )}
                    {group.tasks.map(task => (
                      <TaskRow key={task.id} task={task} isBusy={busy.has(task.id)} taskPriority={taskPriorities[task.id] ?? task.priority} {...rowProps} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
