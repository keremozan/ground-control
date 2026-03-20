"use client";
import { Loader2 } from "lucide-react";
import { parseToolName } from "@/lib/mcp-icons";
import { resolveIcon } from "@/lib/icon-map";
import { toolInputLabel } from "./helpers";

type ChatToolOutputProps = {
  activeTool: string | null;
  activeToolInput: string;
  toolLog: string[];
  elapsed: number;
  accent: string;
  streamingText: string;
};

export default function ChatToolOutput({
  activeTool, activeToolInput, toolLog, elapsed, accent, streamingText,
}: ChatToolOutputProps) {
  if (!activeTool && streamingText) return null;
  if (!activeTool && toolLog.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="thinking-dots">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
        {elapsed > 2 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", opacity: 0.5 }}>{elapsed}s</span>
        )}
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)",
      marginTop: streamingText ? 4 : 0, paddingLeft: 2,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      <Loader2 size={10} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite", color: accent, opacity: 0.7 }} />
      {(() => {
        if (!activeTool) return <span>Working...</span>;
        const info = parseToolName(activeTool);
        const ToolIcon = resolveIcon(info.iconName);
        const label = activeToolInput ? toolInputLabel(activeTool, activeToolInput) : "";
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, minWidth: 0 }}>
            <ToolIcon size={10} strokeWidth={1.5} style={{ flexShrink: 0, color: accent, opacity: 0.6 }} />
            <span>{info.displayName}</span>
            {label && <span style={{ opacity: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>}
          </span>
        );
      })()}
      {toolLog.length > 1 && (
        <span style={{ opacity: 0.4 }}>{toolLog.length} steps</span>
      )}
      {elapsed > 0 && (
        <span style={{ opacity: 0.35 }}>{elapsed}s</span>
      )}
    </div>
  );
}
