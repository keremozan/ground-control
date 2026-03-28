"use client";
import { useState } from "react";
import { Mail, CalendarDays, ListChecks, FolderKanban, Activity } from "lucide-react";
import { WidgetErrorBoundary } from "@/components/ui/WidgetErrorBoundary";
import InboxPanel from "@/components/home/inbox";
import CalendarPanel from "@/components/home/calendar";
import TasksPanel from "@/components/home/tasks";
import ProjectsPanel from "@/components/home/tasks/ProjectsPanel";
import PulsePanel from "@/components/home/pulse";

type Tab = "mail" | "calendar" | "tasks" | "projects" | "pulse";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "mail", label: "Inbox", icon: Mail },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "pulse", label: "Pulse", icon: Activity },
];

export default function InfoPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("tasks");

  return (
    <div className="widget">
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
        <div style={{ display: activeTab === "projects" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <WidgetErrorBoundary name="Projects">
            <ProjectsPanel />
          </WidgetErrorBoundary>
        </div>
        <div style={{ display: activeTab === "pulse" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <WidgetErrorBoundary name="Pulse">
            <PulsePanel />
          </WidgetErrorBoundary>
        </div>
      </div>
    </div>
  );
}
