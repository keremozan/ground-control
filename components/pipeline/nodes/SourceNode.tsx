import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SourceNodeData } from "../SystemGraph.types";

const F = "var(--font-mono)";

export default function SourceNode({ data }: NodeProps) {
  const d = data as unknown as SourceNodeData;
  const Icon = d.icon;
  return (
    <div
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "4px 10px 4px 7px", borderRadius: 4,
        background: d.color + "0f", border: `1px solid ${d.color}22`,
        cursor: "default",
      }}
      data-tip={d.description}
    >
      <Icon size={11} strokeWidth={1.5} style={{ color: d.color, flexShrink: 0 }} />
      <span style={{ fontFamily: F, fontSize: 10, fontWeight: 500, color: d.color, lineHeight: 1.4 }}>
        {d.label}
      </span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 6, height: 6 }} />
    </div>
  );
}
