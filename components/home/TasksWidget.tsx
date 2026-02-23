"use client";
import { useState, useEffect } from "react";
import { Play, X, RefreshCw } from "lucide-react";

type TaskDef = {
  id: string;
  label: string;
  description: string;
  category: string;
  character: string;
  model: string;
};

const categoryColor: Record<string, string> = {
  email:    "var(--c-postman)",
  tana:     "var(--c-architect)",
  calendar: "var(--c-scholar)",
  research: "var(--c-oracle)",
  admin:    "var(--c-clerk)",
};

export default function TasksWidget() {
  const [tasks, setTasks] = useState<TaskDef[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [output, setOutput] = useState<string>("");

  useEffect(() => {
    fetch("/api/tasks")
      .then(r => r.json())
      .then(d => setTasks(d.tasks))
      .catch(() => {});
  }, []);

  const runTask = async (taskId: string) => {
    setRunningId(taskId);
    setOutput("");

    try {
      const res = await fetch(`/api/task/${taskId}`, { method: "POST" });
      if (!res.body) throw new Error("no body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)/m);
          const dataMatch = part.match(/^data: (.+)/m);
          if (!eventMatch || !dataMatch) continue;
          try {
            const parsed = JSON.parse(dataMatch[1]);
            if (eventMatch[1] === "text") {
              setOutput(prev => prev + parsed.text);
            } else if (eventMatch[1] === "tool_call") {
              setOutput(prev => prev + `\n[${parsed.tool}]\n`);
            } else if (eventMatch[1] === "done") {
              setRunningId(null);
            }
          } catch {}
        }
      }
    } catch {
      setRunningId(null);
    }
  };

  // Group by category
  const grouped = tasks.reduce<Record<string, TaskDef[]>>((acc, t) => {
    (acc[t.category] ||= []).push(t);
    return acc;
  }, {});

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-header-label">Tasks</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
            {tasks.length}
          </span>
          <button className="widget-toolbar-btn" title="Refresh"><RefreshCw size={12} strokeWidth={1.5} /></button>
        </div>
      </div>

      <div className="widget-body" style={{ padding: "8px 0" }}>
        {Object.entries(grouped).map(([category, catTasks], i) => {
          const color = categoryColor[category] || "var(--text-3)";
          return (
            <div key={category} style={{
              display: "flex", gap: 10,
              marginBottom: i < Object.keys(grouped).length - 1 ? 10 : 0,
              paddingLeft: 16, paddingRight: 0,
            }}>
              <div style={{ width: 2, background: color, borderRadius: 1, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
                  color, textTransform: "uppercase", letterSpacing: "0.06em",
                  marginBottom: 4, opacity: 0.8,
                }}>
                  {category}
                </div>
                {catTasks.map((task, j) => (
                  <div
                    className="item-row"
                    key={task.id}
                    style={{ borderTop: j === 0 ? "none" : "1px solid var(--border)" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", padding: "4px 16px 4px 0", gap: 8 }}>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text)",
                        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {task.label}
                      </span>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 500,
                        color: "var(--text-3)", textTransform: "uppercase", flexShrink: 0,
                      }}>
                        {task.character}
                      </span>
                      <button
                        className="item-action-btn item-action-btn-blue"
                        title={task.description}
                        onClick={() => runTask(task.id)}
                        disabled={runningId !== null}
                        style={{ opacity: runningId !== null ? 0.4 : 1 }}
                      >
                        <Play size={11} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Output overlay */}
      {(runningId || output) && (
        <div style={{
          borderTop: "1px solid var(--border)",
          background: "var(--cmd-bg)", color: "var(--cmd-text)",
          fontFamily: "var(--font-mono)", fontSize: 10,
          padding: "8px 12px", maxHeight: 160, overflowY: "auto",
          whiteSpace: "pre-wrap", lineHeight: 1.5,
          position: "relative",
        }}>
          {!runningId && (
            <button
              onClick={() => setOutput("")}
              style={{
                position: "absolute", top: 4, right: 4,
                background: "transparent", border: "none", color: "#666",
                cursor: "pointer", padding: 2,
              }}
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          )}
          {runningId && <span className="led led-on led-pulse" style={{ marginRight: 6 }} />}
          {output || "Starting..."}
        </div>
      )}
    </div>
  );
}
