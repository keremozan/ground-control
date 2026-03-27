"use client";
import { useState, useEffect, useCallback } from "react";
import { Mail, CalendarDays, ListChecks } from "lucide-react";
import { useFetchAPI } from "@/hooks";
import { WidgetErrorBoundary } from "@/components/ui/WidgetErrorBoundary";
import InboxPanel from "@/components/home/inbox";
import CalendarPanel from "@/components/home/calendar";
import TasksPanel from "@/components/home/tasks";
import type { CalEvent, Task } from "@/types";

type PanelId = "inbox" | "calendar" | "tasks";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function countTodayTasks(grouped: Record<string, Task[]>): number {
  const today = new Date().toISOString().slice(0, 10);
  let count = 0;
  for (const tasks of Object.values(grouped)) {
    for (const t of tasks) {
      if (t.dueDate && t.dueDate.slice(0, 10) <= today) count++;
    }
  }
  return count;
}

export default function ContextStrip() {
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);

  // Fetch summary data (useFetchAPI auto-unwraps { ok, data } envelope)
  const { data: inboxData } = useFetchAPI<{ unread: { personal: number; school: number } }>("/api/inbox", {
    transform: (raw: any) => ({ unread: raw.unread || { personal: 0, school: 0 } }),
    pollInterval: 10 * 60 * 1000,
  });

  const { data: calData } = useFetchAPI<{ events: CalEvent[] }>("/api/calendar", {
    transform: (raw: any) => ({ events: raw.events || [] }),
    pollInterval: 10 * 60 * 1000,
  });

  const { data: taskData } = useFetchAPI<{ tasks: Record<string, Task[]> }>("/api/tana-tasks", {
    transform: (raw: any) => ({ tasks: raw.tasks || {} }),
    pollInterval: 10 * 60 * 1000,
  });

  // Derive summary text
  const totalUnread = (inboxData?.unread.personal ?? 0) + (inboxData?.unread.school ?? 0);
  const inboxLabel = `${totalUnread} unread`;

  const nextEvent = calData?.events
    ?.filter((e) => !e.allDay && new Date(e.start) > new Date())
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0];
  const calLabel = nextEvent
    ? `${nextEvent.summary.slice(0, 28)} ${formatTime(nextEvent.start)}`
    : `${calData?.events?.length ?? 0} today`;

  const todayCount = taskData ? countTodayTasks(taskData.tasks) : 0;
  const taskLabel = `${todayCount} today`;

  // Toggle panel
  const toggle = useCallback((panel: PanelId) => {
    setOpenPanel((prev) => prev === panel ? null : panel);
  }, []);

  // Escape key closes dropdown
  useEffect(() => {
    if (!openPanel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPanel(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [openPanel]);

  const segments: { id: PanelId; icon: React.ElementType; label: string }[] = [
    { id: "inbox", icon: Mail, label: inboxLabel },
    { id: "calendar", icon: CalendarDays, label: calLabel },
    { id: "tasks", icon: ListChecks, label: taskLabel },
  ];

  return (
    <div className="context-strip" style={{ gridColumn: "span 2" }}>
      {segments.map(({ id, icon: Icon, label }) => (
        <div
          key={id}
          className={`context-strip-segment${openPanel === id ? " active" : ""}`}
          onClick={() => toggle(id)}
        >
          <Icon size={14} />
          <span>{label}</span>
        </div>
      ))}

      {/* Backdrop for click-outside */}
      {openPanel && (
        <div className="context-strip-backdrop" onClick={() => setOpenPanel(null)} />
      )}

      {/* Dropdown overlay -- always mounted so widgets keep their fetch state */}
      <div
        className="context-strip-dropdown"
        style={openPanel ? undefined : { visibility: "hidden", pointerEvents: "none", maxHeight: 0, overflow: "hidden" }}
      >
        <div style={{ display: openPanel === "inbox" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <WidgetErrorBoundary name="Inbox">
            <InboxPanel />
          </WidgetErrorBoundary>
        </div>
        <div style={{ display: openPanel === "calendar" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <WidgetErrorBoundary name="Calendar">
            <CalendarPanel />
          </WidgetErrorBoundary>
        </div>
        <div style={{ display: openPanel === "tasks" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <WidgetErrorBoundary name="Tasks">
            <TasksPanel />
          </WidgetErrorBoundary>
        </div>
      </div>
    </div>
  );
}
