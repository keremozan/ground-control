"use client";
import { useState, useEffect, useCallback } from "react";
import { charIcon, charColor } from "@/lib/char-icons";
import { Loader2, Square, Bot } from "lucide-react";

type ProcessInfo = {
  id: string;
  pid: number;
  charName: string;
  label: string;
  jobId?: string;
  startedAt: string;
};

function ProcessElapsed({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const update = () => {
      const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      if (seconds < 60) setElapsed(`${seconds}s`);
      else if (seconds < 3600) setElapsed(`${Math.floor(seconds / 60)}m ${seconds % 60}s`);
      else setElapsed(`${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return <span>{elapsed}</span>;
}

export default function ProcessesTab({
  processes,
  onStopProcess,
}: {
  processes: ProcessInfo[];
  onStopProcess: (id: string) => void;
}) {
  const [stoppingProcess, setStoppingProcess] = useState<string | null>(null);

  const handleStop = useCallback((id: string) => {
    setStoppingProcess(id);
    onStopProcess(id);
    setTimeout(() => setStoppingProcess(null), 1000);
  }, [onStopProcess]);

  if (processes.length === 0) return null;

  return (
    <div style={{ padding: "6px 10px 8px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {processes.map((proc, i) => {
          const color = charColor[proc.charName] || "var(--accent-muted)";
          const Icon = charIcon[proc.charName.charAt(0).toUpperCase() + proc.charName.slice(1)] || Bot;
          const isStopping = stoppingProcess === proc.id;
          return (
            <div key={proc.id} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 4px", borderRadius: 5,
              background: i % 2 === 0 ? "transparent" : "var(--surface-2)",
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                background: color + "16", border: `1px solid ${color}28`,
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
                  {proc.label}
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 9,
                  color: "var(--text-3)", marginTop: 1,
                  display: "flex", gap: 5,
                }}>
                  <span>{proc.charName}</span>
                  <span>PID {proc.pid}</span>
                  <ProcessElapsed startedAt={proc.startedAt} />
                </div>
              </div>
              <button
                onClick={() => handleStop(proc.id)}
                disabled={isStopping}
                data-tip="Stop process"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 20, height: 20, flexShrink: 0,
                  background: "transparent",
                  border: `1px solid ${isStopping ? "var(--border)" : "var(--red)"}40`,
                  borderRadius: 4,
                  cursor: isStopping ? "default" : "pointer",
                  color: isStopping ? "var(--text-3)" : "var(--red)",
                  transition: "all 0.15s ease",
                }}
              >
                {isStopping
                  ? <Loader2 size={9} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                  : <Square size={8} strokeWidth={2.5} fill="currentColor" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
