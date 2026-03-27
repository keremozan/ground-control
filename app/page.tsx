"use client";
import { ChatProvider } from "@/lib/chat-store";
import { SharedDataProvider } from "@/lib/shared-data";
import { WidgetErrorBoundary } from "@/components/ui/WidgetErrorBoundary";
import InfoPanel from "@/components/home/info-panel";
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
        <div style={{ gridRow: "2 / 4", height: "100%", minHeight: 0, overflow: "hidden" }}>
          <WidgetErrorBoundary name="Chat">
            <ChatWidget />
          </WidgetErrorBoundary>
        </div>
        <WidgetErrorBoundary name="Info Panel">
          <InfoPanel />
        </WidgetErrorBoundary>
        <WidgetErrorBoundary name="Crew">
          <CrewWidget />
        </WidgetErrorBoundary>
      </div>
    </ChatProvider>
    </SharedDataProvider>
  );
}
