"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type ScheduleGraphNodeData = {
  cron: string;
  label: string;
  enabled: boolean;
};

export default function ScheduleGraphNode({ data }: NodeProps) {
  const d = data as unknown as ScheduleGraphNodeData;
  return (
    <div style={{
      width: 130,
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "5px 8px",
      display: "flex",
      alignItems: "center",
      gap: 6,
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: d.enabled ? "var(--led-green)" : "var(--border-2)",
        boxShadow: d.enabled ? "0 0 3px var(--led-green)" : "none",
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 600,
          color: "var(--text)",
          lineHeight: 1.2,
        }}>
          {d.cron}
        </div>
        <div style={{
          fontSize: 9,
          color: "var(--text-3)",
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {d.label}
        </div>
      </div>
      <Handle type="target" position={Position.Left} style={{ background: "var(--border-2)" }} />
      <Handle type="source" position={Position.Right} style={{ background: "var(--border-2)" }} />
    </div>
  );
}
