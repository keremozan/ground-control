"use client";
import { ChatProvider } from "@/lib/chat-store";
import { SharedDataProvider } from "@/lib/shared-data";
import { WidgetErrorBoundary } from "@/components/ui/WidgetErrorBoundary";
import InboxWidget from "@/components/home/InboxWidget";
import CalendarWidget from "@/components/home/CalendarWidget";
import TasksWidget from "@/components/home/TasksWidget";
import CrewWidget from "@/components/home/CrewWidget";
import ChatWidget from "@/components/home/ChatWidget";
import StatusBar from "@/components/home/status";

export default function Home() {
  return (
    <SharedDataProvider>
    <ChatProvider>
      <div className="dashboard-grid">
        <div style={{ gridColumn: "span 3", height: "100%" }}>
          <WidgetErrorBoundary name="Status Bar">
            <StatusBar />
          </WidgetErrorBoundary>
        </div>
        <WidgetErrorBoundary name="Inbox">
          <InboxWidget />
        </WidgetErrorBoundary>
        <WidgetErrorBoundary name="Calendar">
          <CalendarWidget />
        </WidgetErrorBoundary>
        <WidgetErrorBoundary name="Tasks">
          <TasksWidget />
        </WidgetErrorBoundary>
        <div style={{ gridColumn: "span 2", height: "100%", minHeight: 0, overflow: "hidden" }}>
          <WidgetErrorBoundary name="Chat">
            <ChatWidget />
          </WidgetErrorBoundary>
        </div>
        <WidgetErrorBoundary name="Crew">
          <CrewWidget />
        </WidgetErrorBoundary>
      </div>
    </ChatProvider>
    </SharedDataProvider>
  );
}
