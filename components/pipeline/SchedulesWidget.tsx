"use client";
import { useState, useEffect, useRef } from "react";
import { SCHEDULE_JOBS, type JobResult } from "@/lib/scheduler";
import { charIcon, charColor } from "@/lib/char-icons";
import { logAction } from "@/lib/action-log";
import { CalendarDays, Play, Loader2, CheckCircle, BookOpen } from "lucide-react";

export default function SchedulesWidget() {
  const [lastRuns, setLastRuns] = useState<Record<string, JobResult>>({});
  const [running, setRunning] = useState<Set<string>>(new Set());
  const runningRef = useRef(new Set<string>());

  // Fetch last run times on mount
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

  const handleDoNow = async (jobId: string) => {
    if (runningRef.current.has(jobId)) return;
    runningRef.current.add(jobId);
    setRunning(prev => new Set(prev).add(jobId));

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
        logAction({
          widget: "scheduler",
          action: "run",
          target: job?.label || jobId,
          character: job?.displayName,
          detail: `${Math.round(data.result.durationMs / 1000)}s`,
          jobId,
        });
      }
    } catch {
      // silent
    } finally {
      runningRef.current.delete(jobId);
      setRunning(prev => { const n = new Set(prev); n.delete(jobId); return n; });
    }
  };

  const formatLastRun = (result: JobResult) => {
    const d = new Date(result.timestamp);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  const enabledJobs = SCHEDULE_JOBS.filter(j => j.enabled);

  return (
    <div className="widget" style={{ height: "100%" }}>
      <div className="widget-header">
        <span className="widget-header-label">Schedules</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <CalendarDays size={11} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
            {enabledJobs.length} jobs
          </span>
        </div>
      </div>

      <div className="widget-body" style={{ padding: "6px 0" }}>
        {enabledJobs.map((job, i) => {
          const Icon = charIcon[job.displayName] || BookOpen;
          const color = charColor[job.charName] || "#94a3b8";
          const isRunning = running.has(job.id);
          const lastResult = lastRuns[job.id];

          return (
            <div
              key={job.id}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "5px 14px",
                borderBottom: i < enabledJobs.length - 1 ? "1px solid var(--border)" : "none",
                opacity: isRunning ? 0.6 : 1,
              }}
            >
              {/* Character icon */}
              <div style={{
                width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                background: color + "16",
                border: `1px solid ${color}28`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={10} strokeWidth={1.5} style={{ color }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: "var(--text)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {job.label}
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontFamily: "var(--font-mono)", fontSize: 9,
                  color: "var(--text-3)", marginTop: 1,
                }}>
                  <span>{job.cron}</span>
                  {lastResult && (
                    <span style={{ color: "var(--text-3)" }}>
                      last: {formatLastRun(lastResult)}
                    </span>
                  )}
                </div>
              </div>

              {/* Do Now button */}
              <button
                onClick={() => handleDoNow(job.id)}
                disabled={isRunning}
                data-tip="Do Now"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 20, height: 20, flexShrink: 0,
                  background: "transparent",
                  border: `1px solid ${isRunning ? "var(--border)" : color + "40"}`,
                  borderRadius: 4,
                  cursor: isRunning ? "default" : "pointer",
                  color: isRunning ? "var(--text-3)" : color,
                  transition: "all 0.15s ease",
                }}
              >
                {isRunning ? (
                  <Loader2 size={10} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Play size={9} strokeWidth={2} />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
