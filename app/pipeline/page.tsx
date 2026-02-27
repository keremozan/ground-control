"use client";
import { useState } from "react";
import { ChatProvider } from "@/lib/chat-store";
import { type JobResult } from "@/lib/scheduler";
import StatusBar from "@/components/home/StatusBar";
import FlowExplorer from "@/components/pipeline/FlowExplorer";
import LogsWidget from "@/components/pipeline/LogsWidget";
import SchedulesWidget from "@/components/pipeline/SchedulesWidget";
import ProposalsWidget from "@/components/pipeline/ProposalsWidget";
import CycleToolbar from "@/components/pipeline/CycleToolbar";
import JobResultModal from "@/components/pipeline/JobResultModal";

export default function PipelinePage() {
  const [selectedResult, setSelectedResult] = useState<JobResult | null>(null);

  return (
    <ChatProvider>
      <div style={{
        display: "grid",
        gridTemplateRows: "44px 1fr 32px",
        gridTemplateColumns: "1fr 420px",
        gap: 10,
        height: "calc(100vh - 44px)",
      }}>
        <div style={{ gridColumn: "span 2", height: "100%" }}>
          <StatusBar activePage="pipeline" />
        </div>

        {/* Main area: flow explorer */}
        <FlowExplorer />

        {/* Right sidebar: logs + schedules */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <div style={{ flex: 1.6, minHeight: 0 }}>
            <LogsWidget onShowResult={setSelectedResult} />
          </div>
          <div style={{ flex: 0.8, minHeight: 0 }}>
            <ProposalsWidget />
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <SchedulesWidget />
          </div>
        </div>

        {/* Bottom toolbar */}
        <div style={{ gridColumn: "span 2" }}>
          <CycleToolbar />
        </div>
      </div>

      {selectedResult && (
        <JobResultModal result={selectedResult} onClose={() => setSelectedResult(null)} />
      )}
    </ChatProvider>
  );
}
