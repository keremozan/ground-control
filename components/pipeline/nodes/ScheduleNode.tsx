import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clock, Power } from "lucide-react";
import type { ScheduleNodeData } from "../SystemGraph.types";

const F = "var(--font-mono)";

export default function ScheduleNode({ data }: NodeProps) {
  const d = data as unknown as ScheduleNodeData;

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 4,
      padding: "8px 12px", borderRadius: 5,
      background: "var(--surface)", border: "1px solid var(--border)",
      minWidth: 130,
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 6, height: 6 }} />

      {/* Header: name + LED */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: F, fontSize: 10, fontWeight: 600, color: d.charColor, lineHeight: 1.4 }}>
          {d.displayName}
        </span>
        <Power size={9} strokeWidth={1.5} style={{
          color: d.enabled ? "var(--led-green)" : "var(--led-red)",
          flexShrink: 0,
        }} />
      </div>

      {/* Cron + description */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Clock size={9} strokeWidth={1.5} style={{ color: "var(--text-3)", flexShrink: 0 }} />
        <span style={{ fontFamily: F, fontSize: 9, color: "var(--text-3)", lineHeight: 1.4 }}>
          {d.cron}
        </span>
      </div>
      <span style={{
        fontFamily: F, fontSize: 9, color: "var(--text-3)", lineHeight: 1.4,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {d.description}
      </span>

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 6, height: 6 }} />
    </div>
  );
}
