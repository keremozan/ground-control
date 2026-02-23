"use client";
import { mockTasks } from "@/lib/mock-data";
import { Play, CheckCircle, MessageSquare, Archive, Trash2, RefreshCw } from "lucide-react";

const statusStyle: Record<string, { color: string; label: string }> = {
  "in-progress": { color: "var(--blue)",   label: "ACTIVE"  },
  backlog:       { color: "var(--text-3)", label: "BACKLOG" },
};

function trackColor(track: string): string {
  if (/workshop|cambridge|research|plant/i.test(track)) return "var(--c-scholar)";
  if (/va\s|visual culture|slides|course/i.test(track))  return "var(--c-proctor)";
  if (/bahce|gallery|exhibition|art/i.test(track))        return "var(--c-curator)";
  if (/system|automation|dashboard|code/i.test(track))    return "var(--c-architect)";
  if (/admin|advisory|bagem/i.test(track))                return "var(--c-clerk)";
  return "var(--text-3)";
}

const itemActions = [
  { icon: Play,          label: "Start",   colorClass: "item-action-btn-blue"  },
  { icon: CheckCircle,   label: "Done",    colorClass: "item-action-btn-green" },
  { icon: MessageSquare, label: "Assign",  colorClass: ""                      },
  { icon: Archive,       label: "Archive", colorClass: "item-action-btn-amber" },
  { icon: Trash2,        label: "Delete",  colorClass: "item-action-btn-red"   },
];

export default function TasksWidget() {
  const activeTasks = mockTasks.reduce(
    (acc, t) => acc + t.tasks.filter((task) => task.status === "in-progress").length, 0
  );
  const totalTasks = mockTasks.reduce((acc, t) => acc + t.tasks.length, 0);

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-header-label">Tasks</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
            <span style={{ color: "var(--blue)", fontWeight: 600 }}>{activeTasks}</span>/{totalTasks}
          </span>
          <button className="widget-toolbar-btn" title="Refresh"><RefreshCw size={12} strokeWidth={1.5} /></button>
        </div>
      </div>

      <div className="widget-body" style={{ padding: "8px 0" }}>
        {mockTasks.map((group, i) => {
          const color = trackColor(group.track);
          return (
            <div key={i} style={{
              display: "flex",
              gap: 10,
              marginBottom: i < mockTasks.length - 1 ? 10 : 0,
              paddingLeft: 16,
              paddingRight: 0,
            }}>
              <div style={{ width: 2, background: color, borderRadius: 1, flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
                  color: color, textTransform: "uppercase", letterSpacing: "0.06em",
                  marginBottom: 4, opacity: 0.8,
                }}>
                  {group.track}
                </div>

                {group.tasks.map((task, j) => {
                  const st = statusStyle[task.status] || statusStyle.backlog;
                  return (
                    <div
                      className="item-row"
                      key={j}
                      style={{ borderTop: j === 0 ? "none" : "1px solid var(--border)" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", padding: "4px 16px 4px 0", gap: 8, cursor: "pointer" }}>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text)",
                          flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {task.name}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500, color: st.color, flexShrink: 0 }}>
                          {st.label}
                        </span>
                      </div>
                      <div className="item-actions" style={{ padding: "0 16px 4px 0" }}>
                        {itemActions.map(({ icon: ActionIcon, label, colorClass }) => (
                          <button key={label} className={`item-action-btn ${colorClass}`} title={label}>
                            <ActionIcon size={12} strokeWidth={1.5} />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
