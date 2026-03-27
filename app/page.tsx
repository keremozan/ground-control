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
        <div style={{ minHeight: 0, overflow: "hidden" }}>
          <WidgetErrorBoundary name="Chat">
            <ChatWidget />
          </WidgetErrorBoundary>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <WidgetErrorBoundary name="Info Panel">
              <InfoPanel />
            </WidgetErrorBoundary>
          </div>
          <div style={{ flex: 1.4, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <WidgetErrorBoundary name="Crew">
              <CrewWidget />
            </WidgetErrorBoundary>
          </div>
        </div>
      </div>
    </ChatProvider>
    </SharedDataProvider>
  );
}
