"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Play, CheckCircle, Archive, Trash2, RefreshCw, Loader2, ChevronRight, X, Send, SkipForward, ExternalLink, ChevronDown, CalendarClock, Plus } from "lucide-react";
import { charIcon, charColor } from "@/lib/char-icons";
import { useChatTrigger } from "@/lib/chat-store";
import { logAction } from "@/lib/action-log";

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

function dueBadge(dueDate: string | null): { label: string; color: string; bg: string } | null {
  if (!dueDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diff = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: 'OVERDUE', color: '#dc2626', bg: '#dc262618' };
  if (diff === 0) return { label: 'TODAY', color: '#d97706', bg: '#d9770618' };
  if (diff <= 7) return { label: `${diff}d`, color: '#2563eb', bg: '#2563eb12' };
  return null;
}

function formatDueDate(dueDate: string): string {
  const d = new Date(dueDate + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type PriorityFilter = "high" | "medium" | "low";

const statusStyle: Record<string, { color: string; bg: string; label: string }> = {
  "in-progress": { color: "#2563eb", bg: "#dbeafe", label: "ACTIVE"  },
  backlog:       { color: "#9ca3af", bg: "#f3f4f6", label: "BACKLOG" },
};

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

export default function TasksWidget() {
  const [grouped, setGrouped] = useState<Record<string, Task[]>>({});
  const [loading, setLoading] = useState(true);
  const [priority, setPriority] = useState<PriorityFilter>("high");
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
  const promptRef = useRef<HTMLInputElement>(null);
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
  const removedIdsRef = useRef<Map<string, number>>(new Map());

  const fetchTasks = useCallback(() => {
    setLoading(true);
    // Expire removed IDs older than 30 seconds
    const now = Date.now();
    for (const [id, ts] of removedIdsRef.current) {
      if (now - ts > 30_000) removedIdsRef.current.delete(id);
    }
    fetch("/api/tana-tasks")
      .then(r => r.json())
      .then(d => {
        const raw = (d.tasks || {}) as Record<string, Task[]>;
        // Filter out recently removed tasks
        if (removedIdsRef.current.size > 0) {
          const filtered: Record<string, Task[]> = {};
          for (const [track, tasks] of Object.entries(raw)) {
            const kept = tasks.filter(t => !removedIdsRef.current.has(t.id));
            if (kept.length > 0) filtered[track] = kept;
          }
          setGrouped(filtered);
        } else {
          setGrouped(raw);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    fetch("/api/characters").then(r => r.json())
      .then((d: { characters: CharInfo[] }) => {
        setCharacters((d.characters || []).filter(c => c.tier !== "meta"));
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

  // Apply priority filter
  const filtered: Record<string, Task[]> = {};
  for (const [track, tasks] of Object.entries(grouped)) {
    const match = tasks.filter(t => (taskPriorities[t.id] ?? t.priority) === priority || t.status === "in-progress");
    if (match.length > 0) filtered[track] = match;
  }

  const tracks = Object.keys(filtered);
  const allFiltered = Object.values(filtered).flat();
  const activeTasks = allFiltered.filter(t => t.status === "in-progress").length;
  const totalFiltered = allFiltered.length;

  // Count per priority for filter chips
  const allTasks = Object.values(grouped).flat();
  const priorityCounts: Record<string, number> = { high: 0, medium: 0, low: 0 };
  for (const t of allTasks) {
    const p = taskPriorities[t.id] ?? t.priority;
    if (p in priorityCounts) priorityCounts[p]++;
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
        <span className="widget-header-label">Tasks</span>
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
      </div>

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

      {/* Priority filter chips */}
      <div style={{
        display: "flex", gap: 4, padding: "6px 16px 2px",
        borderBottom: "1px solid var(--border)",
      }}>
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
                borderColor: active ? dotColor : "transparent",
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
              No {priority}-priority tasks
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
                  const st = statusStyle[task.status] || statusStyle.backlog;
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
                        <div style={{ display: "flex", alignItems: "center", padding: "4px 16px 4px 0", gap: 8, cursor: "pointer" }}>
                          {(() => {
                            const key = task.assigned ? task.assigned.charAt(0).toUpperCase() + task.assigned.slice(1) : "";
                            const Icon = key ? charIcon[key] : null;
                            const color = task.assigned ? charColor[task.assigned] || "var(--text-3)" : "var(--text-3)";
                            return Icon ? (
                              <span data-tip={key} style={{ display: "flex", flexShrink: 0 }}>
                                <Icon size={10} strokeWidth={1.5} style={{ color }} />
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
                          {/* Due date */}
                          {task.dueDate && (() => {
                            const badge = dueBadge(task.dueDate);
                            return (
                              <span style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                                {badge && (
                                  <span style={{
                                    fontFamily: "var(--font-mono)", fontSize: 7.5, fontWeight: 700,
                                    color: badge.color, background: badge.bg,
                                    padding: "1px 4px", borderRadius: 3, letterSpacing: "0.03em",
                                  }}>
                                    {badge.label}
                                  </span>
                                )}
                                <span style={{
                                  fontFamily: "var(--font-mono)", fontSize: 9,
                                  color: badge?.label === 'OVERDUE' ? '#dc2626' : "var(--text-3)",
                                  fontWeight: badge?.label === 'OVERDUE' ? 600 : 400,
                                }}>
                                  {formatDueDate(task.dueDate)}
                                </span>
                              </span>
                            );
                          })()}
                          {/* Reschedule button — overdue only */}
                          {task.dueDate && dueBadge(task.dueDate)?.label === 'OVERDUE' && (
                            <button
                              className="item-action-btn item-action-btn-amber"
                              data-tip="Reschedule"
                              disabled={isBusy}
                              onClick={e => { e.stopPropagation(); doReschedule(task); }}
                              style={{ cursor: isBusy ? "not-allowed" : "pointer", flexShrink: 0 }}
                            >
                              <CalendarClock size={10} strokeWidth={1.5} />
                            </button>
                          )}
                          {/* Priority dropdown */}
                          <div ref={openDropdown === task.id ? dropdownRef : undefined} style={{ position: "relative", flexShrink: 0 }}>
                            <button
                              data-tip="Change priority"
                              disabled={isBusy}
                              onClick={e => { e.stopPropagation(); setOpenDropdown(openDropdown === task.id ? null : task.id); }}
                              style={{
                                display: "flex", alignItems: "center", gap: 3,
                                height: 18, padding: "0 4px", borderRadius: 3,
                                border: "1px solid var(--border)",
                                background: "transparent",
                                cursor: isBusy ? "not-allowed" : "pointer",
                                color: "var(--text-3)",
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: priorityDot, flexShrink: 0 }} />
                              <ChevronDown size={8} strokeWidth={2} />
                            </button>
                            {openDropdown === task.id && (
                              <div style={{
                                position: "absolute", right: 0, top: "calc(100% + 2px)", zIndex: 50,
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
                          <span style={{
                            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
                            color: st.color, background: st.bg,
                            padding: "1px 5px", borderRadius: 3, flexShrink: 0,
                            letterSpacing: "0.03em",
                          }}>
                            {st.label}
                          </span>
                        </div>

                        <div className="item-actions" style={{ padding: "0 16px 4px 0" }}>
                          {itemActions.map(({ icon: ActionIcon, label, colorClass }) => (
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
                          ))}
                        </div>
                      </div>

                      {/* Prompt input with character + model selectors */}
                      {promptTask === task.id && !isBusy && (
                        <div style={{
                          borderTop: "1px solid var(--border)", background: "var(--surface-2)",
                          padding: "8px 10px", display: "flex", flexDirection: "column" as const, gap: 6,
                        }}>
                          <input
                            ref={promptRef}
                            type="text"
                            value={promptInput}
                            onChange={e => setPromptInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") doStartAction(task, promptInput.trim() || undefined, promptChar, promptModel);
                              if (e.key === "Escape") { setPromptTask(null); setPromptInput(""); }
                            }}
                            placeholder="Add context... (or skip)"
                            style={{
                              fontFamily: "var(--font-mono)", fontSize: 10,
                              background: "var(--surface)", border: "1px solid var(--border)",
                              borderRadius: 4, padding: "4px 8px", color: "var(--text)",
                              outline: "none", width: "100%",
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
    </div>
  );
}
