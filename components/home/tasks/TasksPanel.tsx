"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Loader2, Plus, X, ListChecks } from "lucide-react";
import { useSharedData } from "@/lib/shared-data";
import { useChatTrigger } from "@/lib/chat-store";
import { logAction } from "@/lib/action-log";
import { buildColorMatcher } from "@/lib/colors";
import type { Task } from "@/types";
import TaskList, { type PriorityFilter } from "./TaskList";

type CharInfo = { id: string; name: string; model?: string; tier: string };

export default function TasksPanel() {
  const { characters: sharedCharacters, config: sharedConfig } = useSharedData();
  const [grouped, setGrouped] = useState<Record<string, Task[]>>({});
  const [loading, setLoading] = useState(true);
  const [priority, setPriority] = useState<PriorityFilter>("today");
  const [taskPriorities, setTaskPriorities] = useState<Record<string, string>>({});
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskTrack, setNewTaskTrack] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"high" | "medium" | "low">("medium");
  const [creatingTask, setCreatingTask] = useState(false);
  const newTaskRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [characters, setCharacters] = useState<CharInfo[]>([]);
  const [trackColor, setTrackColor] = useState<(t: string) => string | null>(() => () => null);
  const [promptTask, setPromptTask] = useState<string | null>(null);
  const { setTrigger } = useChatTrigger();
  const busyRef = useRef(new Set<string>());
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
    const now = Date.now();
    for (const [id, ts] of removedIdsRef.current) {
      if (now - ts > 300_000) removedIdsRef.current.delete(id);
    }
    fetch("/api/tana-tasks")
      .then(r => r.json())
      .then(raw => { const d = raw?.data ?? raw;
        const rawTasks = (d.tasks || {}) as Record<string, Task[]>;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + 30);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const result: Record<string, Task[]> = {};
        for (const [track, tasks] of Object.entries(rawTasks)) {
          const kept = tasks.filter(t => {
            if (removedIdsRef.current.has(t.id)) return false;
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

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  useEffect(() => {
    setCharacters(sharedCharacters as CharInfo[]);
    if (sharedConfig.trackColorPatterns) {
      setTrackColor(() => buildColorMatcher(sharedConfig.trackColorPatterns!));
    }
  }, [sharedCharacters, sharedConfig]);

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
        if (action === "delete" || action === "archive" || action === "done") {
          removeTaskFromState(task.id);
          setTimeout(fetchTasks, 3000);
        } else {
          fetchTasks();
        }
      } else {
        const rawErr = await res.json().catch(() => ({}));
        const data = rawErr?.data ?? rawErr;
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
      logAction({ widget: "tasks", action: "reschedule", target: task.name.slice(0, 80), character: "steward" });
      setTimeout(fetchTasks, 3000);
    } catch (err) {
      console.error("Reschedule error:", err);
    } finally {
      busyRef.current.delete(task.id);
      setBusy(prev => { const n = new Set(prev); n.delete(task.id); return n; });
    }
  }

  async function doStartAction(task: Task, userPrompt?: string, charOverride?: string, modelOverride?: string) {
    setBusy(prev => new Set(prev).add(task.id));
    setPromptTask(null);
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
      const rawPrepare = await res.json();
      if (!rawPrepare.ok) return;
      const data = rawPrepare?.data ?? rawPrepare;

      const displayName = charOverride || ((data.character || "postman").charAt(0).toUpperCase() + (data.character || "postman").slice(1));
      const seed = userPrompt
        ? `Work on this task: [${task.name}](tana:${task.id})\n\nUser context: ${userPrompt}`
        : `Work on this task: [${task.name}](tana:${task.id})`;

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
      case "Done":    doSimpleAction(task, "done"); break;
      case "Archive": doSimpleAction(task, "archive"); break;
      case "Delete":  doSimpleAction(task, "delete"); break;
    }
  }

  const allTasks = Object.values(grouped).flat();

  const selectStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: 10,
    padding: "3px 6px", borderRadius: 4,
    background: "var(--surface)", border: "1px solid var(--border)",
    color: "var(--text)", outline: "none",
  };

  const submitNewTask = async () => {
    if (!newTaskTitle.trim() || creatingTask) return;
    setCreatingTask(true);
    const tracks = Object.entries(grouped).map(([name, tasks]) => ({
      name, id: tasks[0]?.trackId || null,
    })).filter(t => t.id);
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

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-header-label"><ListChecks size={13} strokeWidth={1.5} /> Tasks</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="widget-toolbar-btn" data-tip="Add task" onClick={() => { setShowNewTask(true); setTimeout(() => newTaskRef.current?.focus(), 50); }}>
            <Plus size={12} strokeWidth={1.5} />
          </button>
          <button className="widget-toolbar-btn" data-tip="Refresh" onClick={fetchTasks}>
            <RefreshCw size={12} strokeWidth={1.5} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          </button>
        </div>
      </div>

      {(
        <>
          {showNewTask && (() => {
            const tracks = Object.entries(grouped).map(([name, tasks]) => ({
              name, id: tasks[0]?.trackId || null,
            })).filter(t => t.id);

            return (
              <div className="form-section">
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

          <TaskList
            tasks={allTasks}
            trackColor={trackColor}
            busy={busy}
            characters={characters}
            filterKey={priority}
            onFilterChange={setPriority}
            taskPriorities={taskPriorities}
            grouped={grouped}
            loading={loading}
            onAction={handleAction}
            onReschedule={doReschedule}
            onSetPriority={setPriorityDirect}
            onStartWithPrompt={doStartAction}
            promptTask={promptTask}
            onPromptTaskChange={setPromptTask}
          />
        </>
      )}
    </div>
  );
}
