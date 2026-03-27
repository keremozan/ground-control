"use client";
import { ChatProvider } from "@/lib/chat-store";
import { SharedDataProvider } from "@/lib/shared-data";
import { WidgetErrorBoundary } from "@/components/ui/WidgetErrorBoundary";
import ContextStrip from "@/components/home/context-strip";
import CrewWidget from "@/components/home/crew";
import ChatWidget from "@/components/home/chat";
import StatusBar from "@/components/home/status";

export default function Home() {
  return (
    <SharedDataProvider>
    <ChatProvider>
      <div className="dashboard-grid">
        <div style={{ gridColumn: "span 2", height: "100%" }}>
          <WidgetErrorBoundary name="Status Bar">
            <StatusBar />
          </WidgetErrorBoundary>
        </div>
        <WidgetErrorBoundary name="Context Strip">
          <ContextStrip />
        </WidgetErrorBoundary>
        <div style={{ minHeight: 0, overflow: "hidden" }}>
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
