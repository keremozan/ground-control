"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { resolveIcon } from "@/lib/icon-map";
import { useChatTrigger } from "@/lib/chat-store";
import { logAction, clearLog } from "@/lib/action-log";
import { SCHEDULE_JOBS, type JobResult } from "@/lib/scheduler";
import { charIcon, charColor } from "@/lib/char-icons";
import { Loader2, Play, X, CalendarDays, BookOpen, SlidersHorizontal, CheckCircle, AlertCircle, Activity, Wrench, Bot, Trash2, Clock } from "lucide-react";
import CharDetailDrawer from "@/components/home/CharDetailDrawer";
import LogsWidget from "@/components/pipeline/LogsWidget";
import ProposalsWidget from "@/components/pipeline/ProposalsWidget";
import JobResultModal from "@/components/pipeline/JobResultModal";

type ActionInfo = {
  label: string;
  icon: string;
  description: string;
  autonomous?: boolean;
  autonomousInput?: boolean;
  inputPlaceholder?: string;
  endpoint?: string;
};

type CharacterInfo = {
  id: string;
  name: string;
  tier: string;
  icon: string;
  color: string;
  domain?: string;
  actions?: ActionInfo[];
  seeds?: Record<string, string>;
  skills?: string[];
  routingKeywords?: string[];
  sharedKnowledge?: string[];
};

export default function CrewWidget() {
  const { setTrigger } = useChatTrigger();
  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [runningActions, setRunningActions] = useState<Set<string>>(new Set());
  const runningRef = useRef(new Set<string>());
  const [promptAction, setPromptAction] = useState<{ charName: string; label: string; seed: string; type: "chat" | "autonomous"; placeholder?: string } | null>(null);
  const [promptInput, setPromptInput] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [contextOn, setContextOn] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("crew-context-on");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [lastRuns, setLastRuns] = useState<Record<string, JobResult>>({});
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const runningJobsRef = useRef(new Set<string>());
  const [drawerChar, setDrawerChar] = useState<CharacterInfo | null>(null);
  const [cycleStatus, setCycleStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [cyclePhase, setCyclePhase] = useState("");
  const [cycleSummary, setCycleSummary] = useState("");
  const cycleRef = useRef(false);
  const [activeTab, setActiveTab] = useState<"crew" | "schedules" | "logs" | "proposals">("crew");
  const [selectedResult, setSelectedResult] = useState<JobResult | null>(null);
  const [proposalCount, setProposalCount] = useState(0);
  const [scheduledTasks, setScheduledTasks] = useState<Array<{ id: string; charName: string; seedPrompt: string; label: string; scheduledAt: string }>>([]);
  const [deletingTask, setDeletingTask] = useState<string | null>(null);
  const [runningTask, setRunningTask] = useState<string | null>(null);

  const CREW_ORDER = ["postman", "clerk", "scholar", "curator", "proctor", "architect", "coach", "doctor", "oracle"];

  useEffect(() => {
    fetch("/api/characters")
      .then(r => r.json())
      .then(d => {
        const filtered = (d.characters || []).filter((c: CharacterInfo) => c.tier === "core" || c.tier === "meta");
        filtered.sort((a: CharacterInfo, b: CharacterInfo) => {
          const ai = CREW_ORDER.indexOf(a.id);
          const bi = CREW_ORDER.indexOf(b.id);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
        setCharacters(filtered);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/schedule/results")
      .then(r => r.json())
      .then(data => {
        const map: Record<string, JobResult> = {};
        for (const r of (data.results || []) as JobResult[]) {
          if (!map[r.jobId]) map[r.jobId] = r;
        }
        setLastRuns(map);
      })
      .catch(() => {});
  }, []);

  const fetchProposalCount = useCallback(() => {
    fetch("/api/system/proposals")
      .then(r => r.json())
      .then(d => setProposalCount((d.proposals || []).length))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchProposalCount(); }, [fetchProposalCount]);

  const fetchScheduledTasks = useCallback(() => {
    fetch("/api/schedule/tasks")
      .then(r => r.json())
      .then(d => setScheduledTasks(d.tasks || []))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchScheduledTasks(); }, [fetchScheduledTasks]);

  const handleDeleteTask = async (id: string) => {
    setDeletingTask(id);
    try {
      await fetch(`/api/schedule/tasks?id=${id}`, { method: "DELETE" });
      setScheduledTasks(prev => prev.filter(t => t.id !== id));
    } catch { /* silent */ } finally {
      setDeletingTask(null);
    }
  };

  const handleRunTaskNow = async (task: { id: string; charName: string; seedPrompt: string; label: string }) => {
    setRunningTask(task.id);
    try {
      await fetch("/api/schedule/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charName: task.charName, seedPrompt: task.seedPrompt, label: task.label }),
      });
      await fetch(`/api/schedule/tasks?id=${task.id}`, { method: "DELETE" });
      setScheduledTasks(prev => prev.filter(t => t.id !== task.id));
      logAction({ widget: "scheduler", action: "run", target: task.label, character: task.charName });
    } catch { /* silent */ } finally {
      setRunningTask(null);
    }
  };

  // Check and run overdue scheduled tasks on mount + every 15 min
  useEffect(() => {
    fetch("/api/schedule/tasks/check", { method: "POST" })
      .then(() => fetchScheduledTasks())
      .catch(() => {});
    const interval = setInterval(() => {
      fetch("/api/schedule/tasks/check", { method: "POST" })
        .then(() => fetchScheduledTasks())
        .catch(() => {});
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchScheduledTasks]);

  const handleDoNow = async (jobId: string) => {
    if (runningJobsRef.current.has(jobId)) return;
    runningJobsRef.current.add(jobId);
    setRunningJobs(prev => new Set(prev).add(jobId));
    const job = SCHEDULE_JOBS.find(j => j.id === jobId);
    try {
      const res = await fetch("/api/schedule/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (data.ok && data.result) {
        setLastRuns(prev => ({ ...prev, [jobId]: data.result }));
        logAction({ widget: "scheduler", action: "run", target: job?.label || jobId, character: job?.displayName, detail: `${Math.round(data.result.durationMs / 1000)}s`, jobId });
      }
    } catch { /* silent */ } finally {
      runningJobsRef.current.delete(jobId);
      setRunningJobs(prev => { const n = new Set(prev); n.delete(jobId); return n; });
    }
  };

  const formatLastRun = (result: JobResult) => {
    const d = new Date(result.timestamp);
    const now = new Date();
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return time;
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${time}`;
  };

  const enabledJobs = SCHEDULE_JOBS.filter(j => j.enabled);

  const runEndpoint = async (charName: string, action: string, endpoint: string) => {
    const key = `${charName}:${action}`;
    if (runningRef.current.has(key)) return;
    runningRef.current.add(key);
    setRunningActions(prev => new Set(prev).add(key));

    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      logAction({
        widget: "crew",
        action: "endpoint",
        target: `${charName} ${action}`,
        character: charName,
        detail: JSON.stringify(data.report || data),
      });
    } catch {
      // silent
    } finally {
      runningRef.current.delete(key);
      setRunningActions(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const runAutonomous = async (charName: string, action: string, seedPrompt: string) => {
    const key = `${charName}:${action}`;
    if (runningRef.current.has(key)) return;
    runningRef.current.add(key);
    setRunningActions(prev => new Set(prev).add(key));

    try {
      const res = await fetch("/api/schedule/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charName: charName.toLowerCase(), seedPrompt, label: `${charName} ${action}` }),
      });
      const data = await res.json();
      if (data.ok && data.result) {
        logAction({
          widget: "scheduler",
          action: "run",
          target: `${charName} ${action}`,
          character: charName,
          detail: `${Math.round(data.result.durationMs / 1000)}s`,
          jobId: data.result.jobId,
        });
      }
    } catch {
      // silent
    } finally {
      runningRef.current.delete(key);
      setRunningActions(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const handleRunCycle = async () => {
    if (cycleRef.current) return;
    cycleRef.current = true;
    setCycleStatus("running");
    setCycleSummary("");
    let errors = 0;

    setCyclePhase("postman scan...");
    let postmanOk = false;
    try {
      const res = await fetch("/api/schedule/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: "postman-morning" }),
      });
      const data = await res.json();
      if (data.ok) {
        postmanOk = true;
        logAction({ widget: "scheduler", action: "cycle", target: "Postman full scan", character: "Postman", detail: data.result ? `${Math.round(data.result.durationMs / 1000)}s` : undefined, jobId: "postman-morning" });
      } else errors++;
    } catch { errors++; }

    setCyclePhase("checking tasks...");
    const taskChars = new Set(characters.filter(c => c.tier !== "meta").map(c => c.id));
    type TanaTask = { id: string; name: string; status: string; assigned: string | null; track: string };
    let charTasks: Record<string, TanaTask[]> = {};
    try {
      const res = await fetch("/api/tana-tasks");
      const data = await res.json();
      const allTasks: TanaTask[] = Object.values(data.tasks as Record<string, TanaTask[]>).flat();
      for (const task of allTasks.filter(t => t.status !== "done")) {
        const char = (task.assigned || "").toLowerCase();
        if (taskChars.has(char)) (charTasks[char] ||= []).push(task);
      }
    } catch { errors++; }

    const chars = Object.entries(charTasks);
    let charsCompleted = 0;
    for (let i = 0; i < chars.length; i++) {
      const [charName, tasks] = chars[i];
      const displayName = charName.charAt(0).toUpperCase() + charName.slice(1);
      setCyclePhase(`${displayName} (${i + 1}/${chars.length})...`);
      try {
        const taskList = tasks.map(t => `- [${t.id}] ${t.name} (${t.status}, ${t.track})`).join("\n");
        const data = await (await fetch("/api/schedule/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            charName,
            seedPrompt: `You have ${tasks.length} pending task(s).\n\nFor EACH task:\n1. read_node with the node ID\n2. Do the work\n3. Set status to done when finished\n\nTasks:\n${taskList}`,
            label: `${displayName} tasks`,
          }),
        })).json();
        if (data.ok) {
          charsCompleted++;
          logAction({ widget: "scheduler", action: "cycle", target: `${displayName} (${tasks.length} tasks)`, character: displayName, detail: data.result ? `${Math.round(data.result.durationMs / 1000)}s` : undefined, jobId: data.result?.jobId });
        } else errors++;
      } catch { errors++; }
    }

    const parts: string[] = [];
    if (postmanOk) parts.push("scan");
    if (charsCompleted > 0) parts.push(`${charsCompleted} char${charsCompleted > 1 ? "s" : ""}`);
    if (errors > 0) parts.push(`${errors} err`);
    const summaryText = parts.length > 0 ? parts.join(", ") : "no work";
    logAction({ widget: "scheduler", action: "cycle", target: "Full cycle complete", character: "System", detail: summaryText });

    setCycleSummary(summaryText);
    setCycleStatus(errors > 0 && charsCompleted === 0 && !postmanOk ? "error" : "done");
    setCyclePhase("");
    setTimeout(() => { setCycleStatus("idle"); setCycleSummary(""); }, 4000);
    cycleRef.current = false;
  };

  const toggleContext = (charName: string, label: string) => {
    const key = `${charName}:${label}`;
    setContextOn(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem("crew-context-on", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const fireAction = (charName: string, action: ActionInfo, seedPrompt: string) => {
    const key = `${charName}:${action.label}`;
    if (action.autonomousInput || contextOn.has(key)) {
      setPromptAction({
        charName, label: action.label, seed: seedPrompt,
        type: action.autonomousInput ? "autonomous" : "chat",
        placeholder: action.inputPlaceholder,
      });
      setPromptInput("");
      setTimeout(() => promptRef.current?.focus(), 50);
    } else {
      setTrigger({ charName, seedPrompt, action: action.label });
    }
  };

  const submitPrompt = () => {
    if (!promptAction) return;
    const ctx = promptInput.trim();
    const seed = ctx
      ? `${promptAction.seed}\n\nContext: ${ctx}`
      : promptAction.seed;
    setPromptAction(null);
    setPromptInput("");
    if (promptAction.type === "autonomous") {
      runAutonomous(promptAction.charName, promptAction.label, seed);
    } else {
      setTrigger({ charName: promptAction.charName, seedPrompt: seed, action: promptAction.label });
    }
  };

  return (
    <div className="widget" style={{ position: "relative" }}>
      <div className="widget-header">
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <CrewTabBtn label="Crew" icon={<Bot size={13} strokeWidth={1.5} />} active={activeTab === "crew"} onClick={() => setActiveTab("crew")} />
          <CrewTabBtn label="Schedules" icon={<CalendarDays size={13} strokeWidth={1.5} />} active={activeTab === "schedules"} badge={scheduledTasks.length > 0 ? scheduledTasks.length : undefined} onClick={() => setActiveTab("schedules")} />
          <CrewTabBtn label="Logs" icon={<Activity size={13} strokeWidth={1.5} />} active={activeTab === "logs"} onClick={() => setActiveTab("logs")} />
          <CrewTabBtn label="Proposals" icon={<Wrench size={13} strokeWidth={1.5} />} active={activeTab === "proposals"} badge={proposalCount > 0 ? proposalCount : undefined} onClick={() => setActiveTab("proposals")} />
        </div>
        {activeTab === "logs" && (
          <button className="widget-toolbar-btn" data-tip="Clear logs" onClick={() => clearLog()}>
            <Trash2 size={12} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <div className="widget-body" style={{ padding: activeTab === "crew" ? "4px 10px 6px" : 0 }}>
        {activeTab === "crew" && <>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "6px",
        }}>
          {characters.map((char) => {
            const Icon = resolveIcon(char.icon);
            const seeds = char.seeds || {};
            const actions = char.actions || [];
            const charBusy = [...runningActions].some(k => k.startsWith(`${char.name}:`));

            return (
              <div
                key={char.id}
                className="crew-card"
                style={{
                  padding: "6px 6px 5px",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                  onClick={() => setTrigger({ charName: char.name, seedPrompt: '', action: 'chat', openOnly: true })}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                    background: char.color + "16",
                    border: `1px solid ${char.color}28`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    animation: charBusy ? "pulse-crew 1.5s ease-in-out infinite" : undefined,
                  }}>
                    <Icon size={12} strokeWidth={1.5} style={{ color: char.color }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
                      color: "var(--text)", lineHeight: 1.3,
                    }}>
                      {char.name}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-body)", fontSize: 9,
                      color: "var(--text-3)", textTransform: "capitalize",
                    }}>
                      {char.domain || char.tier}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setDrawerChar(char); }}
                    data-tip="Details"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                      background: "transparent", border: "none",
                      cursor: "pointer", color: "var(--text-3)",
                      opacity: 0.4, transition: "opacity 0.12s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "0.4")}
                  >
                    <SlidersHorizontal size={11} strokeWidth={1.5} />
                  </button>
                </div>

                {actions.length > 0 && (
                  <div className="crew-card-actions" style={{ flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                    {actions.map((action) => {
                      const seedPrompt = seeds[action.label];
                      const AIcon = resolveIcon(action.icon);
                      const isAuto = action.autonomous === true;
                      const isAutoInput = action.autonomousInput === true;
                      const isDirect = !!action.endpoint;
                      const isRunning = runningActions.has(`${char.name}:${action.label}`);
                      const ctxKey = `${char.name}:${action.label}`;
                      const isCtxOn = !isAuto && !isDirect && !isAutoInput && contextOn.has(ctxKey);
                      return (
                        <span key={action.label} style={{ display: "inline-flex", alignItems: "center", gap: 0 }}>
                          <button
                            className="item-action-btn"
                            data-tip={action.description || action.label}
                            disabled={isRunning}
                            onClick={isDirect
                              ? () => runEndpoint(char.name, action.label, action.endpoint!)
                              : seedPrompt
                                ? isAuto
                                  ? () => runAutonomous(char.name, action.label, seedPrompt)
                                  : () => fireAction(char.name, action, seedPrompt)
                                : undefined
                            }
                            style={{
                              width: "auto", height: 18, gap: 3, padding: "0 5px 0 4px",
                              opacity: isRunning ? 0.5 : 1,
                              color: char.color,
                              borderRadius: 3, fontSize: 9,
                            }}
                          >
                            {isRunning
                              ? <Loader2 size={9} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
                              : <AIcon size={9} strokeWidth={1.5} />
                            }
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>{action.label}</span>
                          </button>
                          {!isAuto && !isDirect && !isAutoInput && (
                            <span
                              data-tip={isCtxOn ? "Context on" : "Context off"}
                              onClick={() => toggleContext(char.name, action.label)}
                              style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                width: 14, height: 14, cursor: "pointer", flexShrink: 0,
                              }}
                            >
                              <span style={{
                                width: 5, height: 5, borderRadius: "50%",
                                background: isCtxOn ? char.color : "var(--text-3)",
                                opacity: isCtxOn ? 1 : 0.25,
                                transition: "all 0.15s",
                              }} />
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Inline context prompt */}
                {promptAction?.charName === char.name && (
                  <div style={{
                    borderTop: "1px solid var(--border)", background: "var(--surface-2)",
                    borderRadius: "0 0 6px 6px", padding: "6px 6px",
                    marginTop: 4, marginLeft: -6, marginRight: -6, marginBottom: -5,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <textarea
                        ref={promptRef}
                        value={promptInput}
                        onChange={e => setPromptInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitPrompt(); }
                          if (e.key === "Escape") { setPromptAction(null); setPromptInput(""); }
                        }}
                        placeholder={promptAction?.placeholder || "context"}
                        rows={1}
                        style={{
                          flex: 1, fontFamily: "var(--font-mono)", fontSize: 10,
                          background: "var(--surface)", border: "1px solid var(--border)",
                          borderRadius: 4, padding: "4px 8px", color: "var(--text)",
                          outline: "none", resize: "vertical", minHeight: 24, maxHeight: 120,
                          lineHeight: 1.5,
                        }}
                      />
                      <button
                        className="item-action-btn item-action-btn-blue"
                        onClick={submitPrompt}
                        style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 2, width: "auto", padding: "0 5px", fontFamily: "var(--font-mono)", fontSize: 9, height: 18 }}
                      >
                        <Play size={9} strokeWidth={1.5} />
                        Go
                      </button>
                      <button
                        className="item-action-btn"
                        onClick={() => { setPromptAction(null); setPromptInput(""); }}
                        style={{ cursor: "pointer", height: 18 }}
                      >
                        <X size={10} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        </>}

        {activeTab === "schedules" && (
          <div style={{ padding: "4px 10px 6px" }}>
            {enabledJobs.length > 0 && (
              <>
                <div style={{
                  display: "flex", alignItems: "center", gap: 4, marginBottom: 4,
                }}>
                  <CalendarDays size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Recurring
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {enabledJobs.map((job, i) => {
                    const Icon = charIcon[job.displayName] || BookOpen;
                    const color = charColor[job.charName] || "#94a3b8";
                    const isRunning = runningJobs.has(job.id);
                    const lastResult = lastRuns[job.id];
                    return (
                      <div key={job.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "4px 4px",
                        borderRadius: 5,
                        background: i % 2 === 0 ? "transparent" : "var(--surface-2)",
                        opacity: isRunning ? 0.6 : 1,
                      }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                          background: color + "16", border: `1px solid ${color}28`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <Icon size={10} strokeWidth={1.5} style={{ color }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {job.label}
                          </div>
                          <div style={{ display: "flex", gap: 5, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", marginTop: 1 }}>
                            <span>{job.cron}</span>
                            {lastResult && <span>last: {formatLastRun(lastResult)}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDoNow(job.id)}
                          disabled={isRunning}
                          data-tip="Do Now"
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 20, height: 20, flexShrink: 0,
                            background: "transparent",
                            border: `1px solid ${isRunning ? "var(--border)" : color + "40"}`,
                            borderRadius: 4, cursor: isRunning ? "default" : "pointer",
                            color: isRunning ? "var(--text-3)" : color, transition: "all 0.15s ease",
                          }}
                        >
                          {isRunning
                            ? <Loader2 size={10} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                            : <Play size={9} strokeWidth={2} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {scheduledTasks.length > 0 && (
              <>
                <div style={{
                  borderTop: enabledJobs.length > 0 ? "1px solid var(--border)" : "none",
                  margin: enabledJobs.length > 0 ? "8px 0 4px" : "0 0 4px",
                  display: "flex", alignItems: "center", gap: 4,
                  paddingTop: enabledJobs.length > 0 ? 6 : 0,
                }}>
                  <Clock size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Pending
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {scheduledTasks.map((task, i) => {
                    const Icon = charIcon[task.charName] || Bot;
                    const color = charColor[task.charName] || "#94a3b8";
                    const isDeleting = deletingTask === task.id;
                    const isRunning = runningTask === task.id;
                    const scheduledDate = new Date(task.scheduledAt);
                    const now = new Date();
                    const isOverdue = scheduledDate < now;
                    const timeStr = scheduledDate.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={task.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "4px 4px",
                        borderRadius: 5,
                        background: i % 2 === 0 ? "transparent" : "var(--surface-2)",
                        opacity: isDeleting || isRunning ? 0.5 : 1,
                      }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                          background: color + "16", border: `1px solid ${color}28`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <Icon size={10} strokeWidth={1.5} style={{ color }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {task.label}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isOverdue ? "var(--amber, #f59e0b)" : "var(--text-3)", marginTop: 1 }}>
                            {timeStr}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRunTaskNow(task)}
                          disabled={isRunning || isDeleting}
                          data-tip="Run now"
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 20, height: 20, flexShrink: 0,
                            background: "transparent",
                            border: `1px solid ${color}40`,
                            borderRadius: 4, cursor: isRunning ? "default" : "pointer",
                            color, transition: "all 0.15s ease",
                          }}
                        >
                          {isRunning
                            ? <Loader2 size={10} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                            : <Play size={9} strokeWidth={2} />}
                        </button>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          disabled={isDeleting || isRunning}
                          data-tip="Delete"
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 20, height: 20, flexShrink: 0,
                            background: "transparent",
                            border: "1px solid var(--border)",
                            borderRadius: 4, cursor: isDeleting ? "default" : "pointer",
                            color: "var(--text-3)", transition: "all 0.15s ease",
                          }}
                        >
                          {isDeleting
                            ? <Loader2 size={10} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                            : <Trash2 size={9} strokeWidth={2} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {enabledJobs.length === 0 && scheduledTasks.length === 0 && (
              <div style={{ padding: "16px 0", textAlign: "center" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
                  No schedules
                </span>
              </div>
            )}

            {/* Run Full Cycle */}
            <div style={{
              borderTop: "1px solid var(--border)", margin: "8px 0 0",
              paddingTop: 6, display: "flex", alignItems: "center", justifyContent: "flex-end",
            }}>
              <button
                onClick={handleRunCycle}
                disabled={cycleStatus === "running"}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: cycleStatus === "done" ? "var(--green)" : cycleStatus === "error" ? "var(--red, #ef4444)" : "var(--text-2)",
                  background: "transparent", border: "1px solid var(--border)",
                  borderRadius: 3, padding: "3px 10px",
                  cursor: cycleStatus === "running" ? "default" : "pointer",
                  opacity: cycleStatus === "running" ? 0.6 : 1,
                }}
              >
                {cycleStatus === "running" && <Loader2 size={8} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />}
                {cycleStatus === "done" && <CheckCircle size={8} strokeWidth={2} />}
                {cycleStatus === "error" && <AlertCircle size={8} strokeWidth={2} />}
                {cycleStatus === "idle" && <Play size={8} strokeWidth={2} />}
                {cycleStatus === "running"
                  ? cyclePhase
                  : cycleStatus === "done" || cycleStatus === "error"
                    ? cycleSummary || "done"
                    : "run full cycle"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "logs" && (
          <div style={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
            <LogsWidget onShowResult={setSelectedResult} hideHeader />
          </div>
        )}

        {activeTab === "proposals" && (
          <div style={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
            <ProposalsWidget hideHeader />
          </div>
        )}
      </div>

      <CharDetailDrawer
        character={drawerChar || { id: "", name: "", color: "#000" }}
        open={!!drawerChar}
        onClose={() => setDrawerChar(null)}
        contained
      />

      {selectedResult && (
        <JobResultModal result={selectedResult} onClose={() => setSelectedResult(null)} />
      )}
    </div>
  );
}

function CrewTabBtn({
  label, icon, active, badge, onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "3px 8px", borderRadius: 3,
        fontFamily: "var(--font-display)", fontSize: 13, fontWeight: active ? 600 : 400,
        color: active ? "var(--text)" : "var(--text-3)",
        background: "transparent",
        border: "none", cursor: "pointer",
        transition: "all 0.12s",
      }}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
          color: "#d97706", background: "#d9770618",
          padding: "0 4px", borderRadius: 6, marginLeft: 2,
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}
