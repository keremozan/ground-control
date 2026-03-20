"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useCharacters as useSharedCharacters } from "@/lib/shared-data";
import { logAction, clearLog, getLog, subscribeLog, type ActionLogEntry } from "@/lib/action-log";
import { SCHEDULE_JOBS, type JobResult } from "@/lib/scheduler";
import { Bot, CalendarDays, Activity, Wrench, Trash2, Zap } from "lucide-react";

import CharacterGrid from "./CharacterGrid";
import SchedulesTab from "./SchedulesTab";
import ProcessesTab from "./ProcessesTab";
import LogsTab from "./LogsTab";
import ProposalsTab from "./ProposalsTab";
import CharDetailDrawer from "./CharDetailDrawer";
import JobResultModal from "./JobResultModal";

type CharacterInfo = {
  id: string; name: string; tier: string; icon: string; color: string;
  domain?: string; groups?: string[];
  actions?: Array<{
    label: string; icon: string; description: string;
    autonomous?: boolean; autonomousInput?: boolean;
    inputPlaceholder?: string; endpoint?: string;
  }>;
  seeds?: Record<string, string>;
  skills?: string[]; routingKeywords?: string[]; sharedKnowledge?: string[];
};

const CREW_ORDER = [
  "scholar", "curator", "proctor", "coach", "tutor", "postman", "clerk",
  "steward", "archivist", "scribe", "doctor", "prober", "auditor",
  "architect", "engineer", "watcher", "kybernetes", "oracle",
];

function CrewTabBtn({ label, icon, active, badge, onClick }: {
  label: string; icon?: React.ReactNode; active: boolean; badge?: number; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 3,
      fontFamily: "var(--font-display)", fontSize: 13, fontWeight: active ? 600 : 400,
      color: active ? "var(--text)" : "var(--text-3)",
      background: "transparent", border: "none", cursor: "pointer", transition: "all 0.12s",
    }}>
      {icon}{label}
      {badge !== undefined && (
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
          color: "var(--amber)", background: "var(--amber-bg)",
          padding: "0 4px", borderRadius: 6, marginLeft: 2,
        }}>{badge}</span>
      )}
    </button>
  );
}

export default function CrewPanel() {
  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [runningActions, setRunningActions] = useState<Set<string>>(new Set());
  const runningRef = useRef(new Set<string>());
  const [lastRuns, setLastRuns] = useState<Record<string, JobResult>>({});
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const runningJobsRef = useRef(new Set<string>());
  const [drawerChar, setDrawerChar] = useState<CharacterInfo | null>(null);
  const [activeTab, setActiveTab] = useState<"crew" | "schedules" | "processes" | "logs" | "proposals">("crew");
  const [selectedResult, setSelectedResult] = useState<JobResult | null>(null);
  const [proposalCount, setProposalCount] = useState(0);
  const [recentLogs, setRecentLogs] = useState<ActionLogEntry[]>(() => getLog());
  const [processes, setProcesses] = useState<Array<{
    id: string; pid: number; charName: string; label: string; jobId?: string; startedAt: string;
  }>>([]);

  useEffect(() => subscribeLog(() => setRecentLogs([...getLog()])), []);

  const fetchProcesses = useCallback(() => {
    fetch("/api/processes").then(r => r.json()).then(raw => { const d = raw?.data ?? raw; setProcesses(d.processes || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, processes.length > 0 ? 3000 : 30000);
    return () => clearInterval(interval);
  }, [fetchProcesses, processes.length > 0]);

  useEffect(() => {
    if (activeTab === "processes" && processes.length === 0) setActiveTab("crew");
  }, [processes.length, activeTab]);

  const handleStopProcess = useCallback(async (id: string) => {
    try { await fetch(`/api/processes/${id}`, { method: "DELETE" }); fetchProcesses(); } catch {}
  }, [fetchProcesses]);

  const sharedChars = useSharedCharacters();
  useEffect(() => {
    if (sharedChars.length > 0) {
      const filtered = sharedChars.filter((c) => c.tier === "core" || c.tier === "meta") as CharacterInfo[];
      filtered.sort((a, b) => {
        const ai = CREW_ORDER.indexOf(a.id);
        const bi = CREW_ORDER.indexOf(b.id);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      setCharacters(filtered);
    }
  }, [sharedChars]);

  useEffect(() => {
    fetch("/api/schedule/results").then(r => r.json()).then(raw => { const data = raw?.data ?? raw;
      const map: Record<string, JobResult> = {};
      for (const r of (data.results || []) as JobResult[]) { if (!map[r.jobId]) map[r.jobId] = r; }
      setLastRuns(map);
    }).catch(() => {});
  }, []);

  const fetchProposalCount = useCallback(() => {
    fetch("/api/system/proposals").then(r => r.json()).then(raw => { const d = raw?.data ?? raw; setProposalCount((d.proposals || []).length); }).catch(() => {});
  }, []);
  useEffect(() => { fetchProposalCount(); }, [fetchProposalCount]);

  const handleDoNow = async (jobId: string) => {
    if (runningJobsRef.current.has(jobId)) return;
    runningJobsRef.current.add(jobId);
    setRunningJobs(prev => new Set(prev).add(jobId));
    const job = SCHEDULE_JOBS.find(j => j.id === jobId);
    try {
      const res = await fetch("/api/schedule/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const raw = await res.json();
      const data = raw?.data ?? raw;
      if (raw.ok && data.result) {
        setLastRuns(prev => ({ ...prev, [jobId]: data.result }));
        logAction({ widget: "scheduler", action: "run", target: job?.label || jobId, character: job?.displayName, detail: `${Math.round(data.result.durationMs / 1000)}s`, jobId });
      }
    } catch {} finally {
      runningJobsRef.current.delete(jobId);
      setRunningJobs(prev => { const n = new Set(prev); n.delete(jobId); return n; });
    }
  };

  const runEndpoint = async (charName: string, action: string, endpoint: string, body?: Record<string, unknown>) => {
    const key = `${charName}:${action}`;
    if (runningRef.current.has(key)) return;
    runningRef.current.add(key);
    setRunningActions(prev => new Set(prev).add(key));
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const raw = await res.json();
      const data = raw?.data ?? raw;
      logAction({ widget: "crew", action: "endpoint", target: `${charName} ${action}`, character: charName, detail: JSON.stringify(data.report || data.task || data) });
    } catch {} finally {
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charName: charName.toLowerCase(), seedPrompt, label: `${charName} ${action}` }),
      });
      const raw = await res.json();
      const data = raw?.data ?? raw;
      if (raw.ok && data.result) {
        logAction({ widget: "scheduler", action: "run", target: `${charName} ${action}`, character: charName, detail: `${Math.round(data.result.durationMs / 1000)}s`, jobId: data.result.jobId });
      }
    } catch {} finally {
      runningRef.current.delete(key);
      setRunningActions(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const handleCharTasks = async (char: CharacterInfo) => {
    const key = `${char.name}:tasks`;
    if (runningRef.current.has(key)) return;
    runningRef.current.add(key);
    setRunningActions(prev => new Set(prev).add(key));
    try {
      const res = await fetch("/api/tana-tasks");
      const rawTasks = await res.json();
      const dataTasks = rawTasks?.data ?? rawTasks;
      type TanaTask = { id: string; name: string; status: string; assigned: string | null; track: string };
      const allTasks: TanaTask[] = Object.values(dataTasks.tasks as Record<string, TanaTask[]>).flat();
      const tasks = allTasks.filter(t => t.status !== "done" && (t.assigned || "").toLowerCase() === char.id);
      if (tasks.length === 0) {
        logAction({ widget: "crew", action: "tasks", target: `${char.name}: no pending tasks`, character: char.name });
        return;
      }
      const taskList = tasks.map(t => `- [${t.id}] ${t.name} (${t.status}, ${t.track})`).join("\n");
      const seedPrompt = [
        `IMPORTANT: This is task processing, NOT a report or review. Do NOT send any email summaries. The REPORT EMAIL RULE does not apply here. Work silently and log results to Tana only.`,
        ``, `You have ${tasks.length} pending task(s) assigned to you.`, ``, `For EACH task below:`,
        `1. Use read_node with the node ID in brackets to read the full task content`,
        `2. Understand what needs to be done`, `3. Do the work (create drafts, update Tana, research, etc.)`,
        `4. When finished, use check_node with the task's node ID to mark it done (checkbox drives status)`,
        `5. If you cannot complete a task, leave it as-is and note why in your report`,
        ``, `Tasks:`, taskList,
      ].join("\n");
      const taskRes = await fetch("/api/schedule/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charName: char.id, seedPrompt, label: `${char.name} tasks`, maxTurns: 100 }),
      });
      const rawResult = await taskRes.json();
      const result = rawResult?.data ?? rawResult;
      if (rawResult.ok) {
        logAction({ widget: "crew", action: "tasks", target: `${char.name} (${tasks.length} tasks)`, character: char.name, detail: result.result ? `${Math.round(result.result.durationMs / 1000)}s` : undefined, jobId: result.result?.jobId });
      }
    } catch {} finally {
      runningRef.current.delete(key);
      setRunningActions(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  return (
    <div className="widget" style={{ position: "relative" }}>
      <div className="widget-header">
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <CrewTabBtn label="Crew" icon={<Bot size={13} strokeWidth={1.5} />} active={activeTab === "crew"} onClick={() => setActiveTab("crew")} />
          <CrewTabBtn label="Schedules" icon={<CalendarDays size={13} strokeWidth={1.5} />} active={activeTab === "schedules"} onClick={() => setActiveTab("schedules")} />
          {processes.length > 0 && (
            <CrewTabBtn label="Processes" icon={<Zap size={13} strokeWidth={1.5} />} active={activeTab === "processes"} badge={processes.length} onClick={() => setActiveTab("processes")} />
          )}
          <CrewTabBtn label="Logs" icon={<Activity size={13} strokeWidth={1.5} />} active={activeTab === "logs"} onClick={() => setActiveTab("logs")} />
          <CrewTabBtn label="Proposals" icon={<Wrench size={13} strokeWidth={1.5} />} active={activeTab === "proposals"} badge={proposalCount > 0 ? proposalCount : undefined} onClick={() => setActiveTab("proposals")} />
        </div>
        {activeTab === "logs" && (
          <button className="widget-toolbar-btn" data-tip="Clear logs" onClick={() => clearLog()}>
            <Trash2 size={12} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <div className="widget-body" style={{ padding: activeTab === "crew" ? "6px 10px 8px" : 0 }}>
        {activeTab === "crew" && (
          <CharacterGrid
            characters={characters}
            runningActions={runningActions}
            recentLogs={recentLogs}
            lastRuns={lastRuns}
            runningJobs={runningJobs}
            onDrawerOpen={(char) => setDrawerChar(char as CharacterInfo)}
            onTabSwitch={(tab) => setActiveTab(tab as any)}
            runEndpoint={runEndpoint}
            runAutonomous={runAutonomous}
            handleCharTasks={handleCharTasks}
            handleDoNow={handleDoNow}
          />
        )}
        {activeTab === "schedules" && (
          <SchedulesTab characters={characters} lastRuns={lastRuns} setLastRuns={setLastRuns} runningJobs={runningJobs} handleDoNow={handleDoNow} />
        )}
        {activeTab === "processes" && processes.length > 0 && (
          <ProcessesTab processes={processes} onStopProcess={handleStopProcess} />
        )}
        {activeTab === "logs" && (
          <div style={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
            <LogsTab onShowResult={setSelectedResult} hideHeader />
          </div>
        )}
        {activeTab === "proposals" && (
          <div style={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
            <ProposalsTab hideHeader />
          </div>
        )}
      </div>

      <CharDetailDrawer
        character={drawerChar || { id: "", name: "", color: "#000" }}
        open={!!drawerChar} onClose={() => setDrawerChar(null)} contained
      />
      {selectedResult && (
        <JobResultModal result={selectedResult} onClose={() => setSelectedResult(null)} />
      )}
    </div>
  );
}
