"use client";
import { useState, useRef, useEffect } from "react";
import { Play, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { logAction } from "@/lib/action-log";

// Tracks to skip in automated cycle (set via skipTrackPattern in config)
let SKIP_TRACKS: RegExp | null = null;
// Meta characters that don't do regular task work
const META_TIERS = new Set(["meta"]);

type TanaTask = {
  id: string;
  name: string;
  status: string;
  assigned: string | null;
  track: string;
};

export default function CycleToolbar() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [phase, setPhase] = useState("");
  const [summary, setSummary] = useState("");
  const [lastRun, setLastRun] = useState<string | null>(null);
  const runningRef = useRef(false);
  const [taskCharacters, setTaskCharacters] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/characters").then(r => r.json())
      .then((d: { characters: { id: string; tier: string }[] }) => {
        setTaskCharacters(new Set((d.characters || []).filter(c => !META_TIERS.has(c.tier)).map(c => c.id)));
      })
      .catch(() => {});
  }, []);

  const runJob = async (params: Record<string, string>) => {
    const res = await fetch("/api/schedule/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  };

  const handleRunCycle = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setStatus("running");
    setSummary("");
    let errors = 0;

    // ── Phase 1: Postman full scan ──
    setPhase("postman scan...");
    let postmanOk = false;
    try {
      const data = await runJob({ jobId: "postman-morning" });
      if (data.ok) {
        postmanOk = true;
        logAction({
          widget: "scheduler",
          action: "cycle",
          target: "Postman full scan",
          character: "Postman",
          detail: data.result ? `${Math.round(data.result.durationMs / 1000)}s` : undefined,
          jobId: "postman-morning",
        });
      } else {
        errors++;
      }
    } catch {
      errors++;
    }

    // ── Phase 2: Check who has pending tasks ──
    setPhase("checking tasks...");
    let charTasks: Record<string, TanaTask[]> = {};
    try {
      const res = await fetch("/api/tana-tasks");
      const data = await res.json();
      const allTasks: TanaTask[] = Object.values(data.tasks as Record<string, TanaTask[]>).flat();
      const pending = allTasks.filter(t => t.status !== "done" && (!SKIP_TRACKS || !SKIP_TRACKS.test(t.track)));

      for (const task of pending) {
        const char = (task.assigned || "").toLowerCase();
        if (taskCharacters.has(char)) {
          (charTasks[char] ||= []).push(task);
        }
      }
    } catch {
      errors++;
    }

    // ── Phase 3: Spawn characters sequentially ──
    const chars = Object.entries(charTasks);
    let charsCompleted = 0;

    for (let i = 0; i < chars.length; i++) {
      const [charName, tasks] = chars[i];
      const displayName = charName.charAt(0).toUpperCase() + charName.slice(1);
      const taskNames = tasks.map(t => t.name).slice(0, 3).join(", ");
      const taskList = tasks.map(t => `- [${t.id}] ${t.name} (${t.status}, ${t.track})`).join("\n");
      setPhase(`${displayName} (${i + 1}/${chars.length}) ${taskNames}...`);

      try {
        const data = await runJob({
          charName,
          seedPrompt: [
            `You have ${tasks.length} pending task(s) assigned to you.`,
            ``,
            `For EACH task below:`,
            `1. Use read_node with the node ID in brackets to read the full task content`,
            `2. Understand what needs to be done`,
            `3. Do the work (create drafts, update Tana, research, etc.)`,
            `4. When finished, set the task status to done using set_field_option`,
            `5. If you cannot complete a task, leave it as-is and note why in your report`,
            ``,
            `Tasks:`,
            taskList,
          ].join("\n"),
          label: `${displayName} tasks`,
        });
        if (data.ok) {
          charsCompleted++;
          logAction({
            widget: "scheduler",
            action: "cycle",
            target: `${displayName} (${tasks.length} tasks)`,
            character: displayName,
            detail: data.result ? `${Math.round(data.result.durationMs / 1000)}s` : undefined,
            jobId: data.result?.jobId,
          });
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }

    // ── Done — log cycle summary ──
    const parts: string[] = [];
    if (postmanOk) parts.push("scan");
    if (charsCompleted > 0) parts.push(`${charsCompleted} char${charsCompleted > 1 ? "s" : ""}`);
    if (errors > 0) parts.push(`${errors} err`);
    const summaryText = parts.length > 0 ? parts.join(", ") : "no work";

    logAction({
      widget: "scheduler",
      action: "cycle",
      target: "Full cycle complete",
      character: "System",
      detail: summaryText,
    });

    setSummary(summaryText);
    setStatus(errors > 0 && charsCompleted === 0 && !postmanOk ? "error" : "done");
    setPhase("");
    const now = new Date();
    setLastRun(now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    setTimeout(() => { setStatus("idle"); setSummary(""); }, 4000);
    runningRef.current = false;
  };

  return (
    <div className="widget" style={{
      flexDirection: "row", alignItems: "center",
      padding: "0 16px", gap: 0, height: "100%",
    }}>
      {lastRun && (
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: "var(--text-3)", letterSpacing: "0.02em",
        }}>
          last cycle {lastRun}
        </span>
      )}

      <div style={{ flex: 1 }} />

      <button
        onClick={handleRunCycle}
        disabled={status === "running"}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: status === "done" ? "var(--green)" : status === "error" ? "var(--red, #ef4444)" : "var(--text-2)",
          background: "transparent", border: "1px solid var(--border)",
          borderRadius: 3, padding: "3px 10px",
          cursor: status === "running" ? "default" : "pointer",
          opacity: status === "running" ? 0.6 : 1,
        }}
      >
        {status === "running" && <Loader2 size={8} strokeWidth={2} className="spin" />}
        {status === "done" && <CheckCircle size={8} strokeWidth={2} />}
        {status === "error" && <AlertCircle size={8} strokeWidth={2} />}
        {status === "idle" && <Play size={8} strokeWidth={2} />}
        {status === "running"
          ? phase
          : status === "done" || status === "error"
            ? summary || "done"
            : "run full cycle"}
      </button>
    </div>
  );
}
