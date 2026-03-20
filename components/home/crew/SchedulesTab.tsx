"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { SCHEDULE_JOBS, type JobResult } from "@/lib/scheduler";
import { logAction } from "@/lib/action-log";
import { charIcon, charColor } from "@/lib/char-icons";
import { Loader2, Play, BookOpen, Clock, Pencil, Trash2, CheckCircle, AlertCircle, Bot } from "lucide-react";
import FileEditorModal from "./FileEditorModal";

type CharacterInfo = { id: string; name: string; tier: string };

export default function SchedulesTab({
  characters, lastRuns, setLastRuns, runningJobs, handleDoNow,
}: {
  characters: CharacterInfo[];
  lastRuns: Record<string, JobResult>;
  setLastRuns: React.Dispatch<React.SetStateAction<Record<string, JobResult>>>;
  runningJobs: Set<string>;
  handleDoNow: (jobId: string) => void;
}) {
  const [scheduledTasks, setScheduledTasks] = useState<Array<{
    id: string; charName: string; seedPrompt: string; label: string; scheduledAt: string;
  }>>([]);
  const [deletingTask, setDeletingTask] = useState<string | null>(null);
  const [runningTask, setRunningTask] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<{ id: string; label: string; seedPrompt: string } | null>(null);
  const [jobOverrides, setJobOverrides] = useState<Record<string, string>>({});

  // Cycle/dispatch state
  const [cycleStatus, setCycleStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [cyclePhase, setCyclePhase] = useState("");
  const [cycleSummary, setCycleSummary] = useState("");
  const cycleRef = useRef(false);
  const [dispatchStatus, setDispatchStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [dispatchPhase, setDispatchPhase] = useState("");
  const [dispatchSummary, setDispatchSummary] = useState("");
  const dispatchRef = useRef(false);

  const enabledJobs = SCHEDULE_JOBS.filter(j => j.enabled);

  const fetchScheduledTasks = useCallback(() => {
    fetch("/api/schedule/tasks").then(r => r.json()).then(d => setScheduledTasks(d.tasks || [])).catch(() => {});
  }, []);
  useEffect(() => { fetchScheduledTasks(); }, [fetchScheduledTasks]);

  const fetchJobOverrides = useCallback(() => {
    fetch("/api/schedule/jobs").then(r => r.json()).then(d => {
      const map: Record<string, string> = {};
      for (const j of (d.jobs || [])) { if (j.hasOverride) map[j.id] = j.seedPrompt; }
      setJobOverrides(map);
    }).catch(() => {});
  }, []);
  useEffect(() => { fetchJobOverrides(); }, [fetchJobOverrides]);

  useEffect(() => {
    fetch("/api/schedule/tasks/check", { method: "POST" }).then(() => fetchScheduledTasks()).catch(() => {});
    const interval = setInterval(() => {
      fetch("/api/schedule/tasks/check", { method: "POST" }).then(() => fetchScheduledTasks()).catch(() => {});
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchScheduledTasks]);

  useEffect(() => {
    fetch('/api/schedule/catch-up', { method: 'POST' }).then(r => r.json())
      .then(async (data: { missed: { jobId: string; label: string }[] }) => {
        for (const job of data.missed) {
          try { await fetch('/api/schedule/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: job.jobId }) }); } catch {}
        }
      }).catch(() => {});
  }, []);

  const handleDeleteTask = async (id: string) => {
    setDeletingTask(id);
    try { await fetch(`/api/schedule/tasks?id=${id}`, { method: "DELETE" }); setScheduledTasks(prev => prev.filter(t => t.id !== id)); } catch {} finally { setDeletingTask(null); }
  };

  const handleRunTaskNow = async (task: { id: string; charName: string; seedPrompt: string; label: string }) => {
    setRunningTask(task.id);
    try {
      await fetch("/api/schedule/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ charName: task.charName, seedPrompt: task.seedPrompt, label: task.label }) });
      await fetch(`/api/schedule/tasks?id=${task.id}`, { method: "DELETE" });
      setScheduledTasks(prev => prev.filter(t => t.id !== task.id));
      logAction({ widget: "scheduler", action: "run", target: task.label, character: task.charName });
    } catch {} finally { setRunningTask(null); }
  };

  const runTaskDispatch = async (chars: CharacterInfo[], setPhase: (s: string) => void, actionName: string) => {
    const taskChars = new Set(chars.filter(c => c.tier !== "meta").map(c => c.id));
    type TanaTask = { id: string; name: string; status: string; assigned: string | null; track: string };
    const charTasks: Record<string, TanaTask[]> = {};
    let errors = 0;
    setPhase("checking tasks...");
    try {
      const res = await fetch("/api/tana-tasks");
      const data = await res.json();
      const allTasks: TanaTask[] = Object.values(data.tasks as Record<string, TanaTask[]>).flat();
      for (const task of allTasks.filter(t => t.status !== "done")) {
        const char = (task.assigned || "").toLowerCase();
        if (taskChars.has(char)) (charTasks[char] ||= []).push(task);
      }
    } catch { errors++; }
    const entries = Object.entries(charTasks);
    let completed = 0;
    for (let i = 0; i < entries.length; i++) {
      const [charName, tasks] = entries[i];
      const displayName = charName.charAt(0).toUpperCase() + charName.slice(1);
      setPhase(`${displayName} (${i + 1}/${entries.length})...`);
      try {
        const taskList = tasks.map(t => `- [${t.id}] ${t.name} (${t.status}, ${t.track})`).join("\n");
        const data = await (await fetch("/api/schedule/run", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ charName, seedPrompt: `You have ${tasks.length} pending task(s).\n\nFor EACH task:\n1. read_node with the node ID\n2. Do the work\n3. Use check_node to mark it done (checkbox drives status)\n\nTasks:\n${taskList}`, label: `${displayName} tasks` }),
        })).json();
        if (data.ok) { completed++; logAction({ widget: "scheduler", action: actionName, target: `${displayName} (${tasks.length} tasks)`, character: displayName, detail: data.result ? `${Math.round(data.result.durationMs / 1000)}s` : undefined, jobId: data.result?.jobId }); }
        else errors++;
      } catch { errors++; }
    }
    return { completed, errors };
  };

  const handleRunCycle = async () => {
    if (cycleRef.current) return;
    cycleRef.current = true;
    setCycleStatus("running"); setCycleSummary("");
    let errors = 0;
    setCyclePhase("postman scan...");
    let postmanOk = false;
    try {
      const res = await fetch("/api/schedule/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: "postman-morning" }) });
      const data = await res.json();
      if (data.ok) { postmanOk = true; logAction({ widget: "scheduler", action: "cycle", target: "Postman full scan", character: "Postman", detail: data.result ? `${Math.round(data.result.durationMs / 1000)}s` : undefined, jobId: "postman-morning" }); }
      else errors++;
    } catch { errors++; }
    const r = await runTaskDispatch(characters, setCyclePhase, "cycle");
    errors += r.errors;
    const parts: string[] = [];
    if (postmanOk) parts.push("scan");
    if (r.completed > 0) parts.push(`${r.completed} char${r.completed > 1 ? "s" : ""}`);
    if (errors > 0) parts.push(`${errors} err`);
    const text = parts.length > 0 ? parts.join(", ") : "no work";
    logAction({ widget: "scheduler", action: "cycle", target: "Full cycle complete", character: "System", detail: text });
    setCycleSummary(text); setCycleStatus(errors > 0 && r.completed === 0 && !postmanOk ? "error" : "done"); setCyclePhase("");
    setTimeout(() => { setCycleStatus("idle"); setCycleSummary(""); }, 4000);
    cycleRef.current = false;
  };

  const handleRunDispatch = async () => {
    if (dispatchRef.current) return;
    dispatchRef.current = true;
    setDispatchStatus("running"); setDispatchSummary("");
    const r = await runTaskDispatch(characters, setDispatchPhase, "dispatch");
    const parts: string[] = [];
    if (r.completed > 0) parts.push(`${r.completed} char${r.completed > 1 ? "s" : ""}`);
    if (r.errors > 0) parts.push(`${r.errors} err`);
    const text = parts.length > 0 ? parts.join(", ") : "no work";
    logAction({ widget: "scheduler", action: "dispatch", target: "Task dispatch complete", character: "System", detail: text });
    setDispatchSummary(text); setDispatchStatus(r.errors > 0 && r.completed === 0 ? "error" : "done"); setDispatchPhase("");
    setTimeout(() => { setDispatchStatus("idle"); setDispatchSummary(""); }, 4000);
    dispatchRef.current = false;
  };

  const formatLastRun = (result: JobResult) => {
    const d = new Date(result.timestamp);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${days[d.getDay()]} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  };

  const GROUP_ORDER = ["scanning", "context", "delivery", "research", "tasks", "reviews", "personal", "system"];
  const GROUP_LABELS: Record<string, string> = { scanning: "Scanning", context: "Context", delivery: "Delivery", research: "Research", tasks: "Tasks", reviews: "Reviews", personal: "Personal", system: "System" };

  return (
    <div style={{ padding: "4px 10px 6px" }}>
      {enabledJobs.length > 0 && (() => {
        const groups = new Map<string, typeof enabledJobs>();
        for (const job of enabledJobs) { const g = (job as any).group || "system"; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(job); }
        const sorted = [...groups.entries()].sort(([a], [b]) => (GROUP_ORDER.indexOf(a) === -1 ? 99 : GROUP_ORDER.indexOf(a)) - (GROUP_ORDER.indexOf(b) === -1 ? 99 : GROUP_ORDER.indexOf(b)));
        let idx = 0;
        return sorted.map(([group, jobs]) => (
          <div key={group} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3, marginTop: 2 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 500, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{GROUP_LABELS[group] || group}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {jobs.map((job) => {
                const i = idx++;
                const Icon = charIcon[job.displayName] || BookOpen;
                const color = charColor[job.charName] || "var(--accent-muted)";
                const isRunning = runningJobs.has(job.id);
                const lastResult = lastRuns[job.id];
                return (
                  <div key={job.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 4px", borderRadius: 5, background: i % 2 === 0 ? "transparent" : "var(--surface-2)", opacity: isRunning ? 0.6 : 1 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, background: color + "16", border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={10} strokeWidth={1.5} style={{ color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.label}</div>
                      <div style={{ display: "flex", gap: 5, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", marginTop: 1 }}>
                        <span>{job.cron}</span>
                        {lastResult && <span>last: {formatLastRun(lastResult)}</span>}
                      </div>
                    </div>
                    {job.type !== 'process-tasks' && (
                      <button onClick={() => setEditingJob({ id: job.id, label: job.label, seedPrompt: jobOverrides[job.id] ?? job.seedPrompt })} data-tip="Edit command" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, flexShrink: 0, background: jobOverrides[job.id] ? color + "16" : "transparent", border: `1px solid ${jobOverrides[job.id] ? color + "40" : "var(--border)"}`, borderRadius: 4, cursor: "pointer", color: jobOverrides[job.id] ? color : "var(--text-3)", transition: "all 0.15s ease" }}>
                        <Pencil size={9} strokeWidth={2} />
                      </button>
                    )}
                    <button onClick={() => handleDoNow(job.id)} disabled={isRunning} data-tip="Do Now" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, flexShrink: 0, background: "transparent", border: `1px solid ${isRunning ? "var(--border)" : color + "40"}`, borderRadius: 4, cursor: isRunning ? "default" : "pointer", color: isRunning ? "var(--text-3)" : color, transition: "all 0.15s ease" }}>
                      {isRunning ? <Loader2 size={10} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={9} strokeWidth={2} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ));
      })()}

      {scheduledTasks.length > 0 && (
        <>
          <div style={{ borderTop: enabledJobs.length > 0 ? "1px solid var(--border)" : "none", margin: enabledJobs.length > 0 ? "8px 0 4px" : "0 0 4px", display: "flex", alignItems: "center", gap: 4, paddingTop: enabledJobs.length > 0 ? 6 : 0 }}>
            <Clock size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Pending</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {scheduledTasks.map((task, i) => {
              const Icon = charIcon[task.charName] || Bot;
              const color = charColor[task.charName] || "var(--accent-muted)";
              const isDeleting = deletingTask === task.id;
              const isRunning = runningTask === task.id;
              const scheduledDate = new Date(task.scheduledAt);
              const isOverdue = scheduledDate < new Date();
              const timeStr = scheduledDate.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
              return (
                <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 4px", borderRadius: 5, background: i % 2 === 0 ? "transparent" : "var(--surface-2)", opacity: isDeleting || isRunning ? 0.5 : 1 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, background: color + "16", border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={10} strokeWidth={1.5} style={{ color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isOverdue ? "var(--amber, #f59e0b)" : "var(--text-3)", marginTop: 1 }}>{timeStr}</div>
                  </div>
                  <button onClick={() => handleRunTaskNow(task)} disabled={isRunning || isDeleting} data-tip="Run now" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, flexShrink: 0, background: "transparent", border: `1px solid ${color}40`, borderRadius: 4, cursor: isRunning ? "default" : "pointer", color, transition: "all 0.15s ease" }}>
                    {isRunning ? <Loader2 size={10} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={9} strokeWidth={2} />}
                  </button>
                  <button onClick={() => handleDeleteTask(task.id)} disabled={isDeleting || isRunning} data-tip="Delete" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, flexShrink: 0, background: "transparent", border: "1px solid var(--border)", borderRadius: 4, cursor: isDeleting ? "default" : "pointer", color: "var(--text-3)", transition: "all 0.15s ease" }}>
                    {isDeleting ? <Loader2 size={10} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={9} strokeWidth={2} />}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {enabledJobs.length === 0 && scheduledTasks.length === 0 && (
        <div style={{ padding: "16px 0", textAlign: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>No schedules</span>
        </div>
      )}

      {/* Cycle / Dispatch controls */}
      <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0 0", paddingTop: 6, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
        <StatusBtn status={dispatchStatus} phase={dispatchPhase} summary={dispatchSummary} label="task dispatch" onClick={handleRunDispatch} disabled={dispatchStatus === "running" || cycleStatus === "running"} />
        <StatusBtn status={cycleStatus} phase={cyclePhase} summary={cycleSummary} label="run full cycle" onClick={handleRunCycle} disabled={cycleStatus === "running" || dispatchStatus === "running"} />
      </div>

      {editingJob && (
        <FileEditorModal
          title={`Command -- ${editingJob.label}`}
          content={editingJob.seedPrompt}
          onSave={async (text) => {
            await fetch("/api/schedule/jobs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: editingJob.id, seedPrompt: text }) });
            setJobOverrides(prev => ({ ...prev, [editingJob.id]: text }));
            setEditingJob(null);
          }}
          onClose={() => setEditingJob(null)}
        />
      )}
    </div>
  );
}

function StatusBtn({ status, phase, summary, label, onClick, disabled }: {
  status: "idle" | "running" | "done" | "error"; phase: string; summary: string; label: string; onClick: () => void; disabled: boolean;
}) {
  const color = status === "done" ? "var(--green)" : status === "error" ? "var(--red, #ef4444)" : "var(--text-2)";
  const StatusIcon = status === "running" ? Loader2 : status === "done" ? CheckCircle : status === "error" ? AlertCircle : Play;
  const text = status === "running" ? phase : (status === "done" || status === "error") ? (summary || "done") : label;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "flex", alignItems: "center", gap: 5,
      fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.04em", textTransform: "uppercase",
      color, background: "transparent", border: "1px solid var(--border)",
      borderRadius: 3, padding: "3px 10px",
      cursor: status === "running" ? "default" : "pointer", opacity: status === "running" ? 0.6 : 1,
    }}>
      <StatusIcon size={8} strokeWidth={2} style={status === "running" ? { animation: "spin 1s linear infinite" } : undefined} />
      {text}
    </button>
  );
}
