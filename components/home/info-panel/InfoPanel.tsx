"use client";
import { useState } from "react";
import { Mail, CalendarDays, ListChecks } from "lucide-react";
import { WidgetErrorBoundary } from "@/components/ui/WidgetErrorBoundary";
import InboxPanel from "@/components/home/inbox";
import CalendarPanel from "@/components/home/calendar";
import TasksPanel from "@/components/home/tasks";

type Tab = "mail" | "calendar" | "tasks";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "mail", label: "Inbox", icon: Mail },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "tasks", label: "Tasks", icon: ListChecks },
];

export default function InfoPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("tasks");

  return (
    <div className="widget" style={{ flex: 1, minHeight: 0 }}>
      <div className="info-panel-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`info-panel-tab${activeTab === id ? " active" : ""}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={13} strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: activeTab === "mail" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <WidgetErrorBoundary name="Inbox">
            <InboxPanel />
          </WidgetErrorBoundary>
        </div>
        <div style={{ display: activeTab === "calendar" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <WidgetErrorBoundary name="Calendar">
            <CalendarPanel />
          </WidgetErrorBoundary>
        </div>
        <div style={{ display: activeTab === "tasks" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <WidgetErrorBoundary name="Tasks">
            <TasksPanel />
          </WidgetErrorBoundary>
        </div>
      </div>
    </div>
  );
}
