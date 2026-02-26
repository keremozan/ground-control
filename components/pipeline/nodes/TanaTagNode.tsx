import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TanaTagNodeData } from "../SystemGraph.types";

const F = "var(--font-mono)";

export default function TanaTagNode({ data }: NodeProps) {
  const d = data as unknown as TanaTagNodeData;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 6, height: 6 }} />
      <div
        style={{
          padding: "4px 14px", borderRadius: 4,
          background: "#f59e0b0c", border: "1px solid #f59e0b20",
        }}
        title={d.description}
      >
        <span style={{ fontFamily: F, fontSize: 11, fontWeight: 700, color: "#b45309", lineHeight: 1.4 }}>
          {d.tag}
        </span>
      </div>
      <span style={{ fontFamily: F, fontSize: 9, color: "var(--text-3)", lineHeight: 1.4 }}>
        {d.fields}
      </span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 6, height: 6 }} />
    </div>
  );
}
