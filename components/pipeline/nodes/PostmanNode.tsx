import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { PostmanNodeData } from "../SystemGraph.types";

const F = "var(--font-mono)";

export default function PostmanNode({ data }: NodeProps) {
  const d = data as unknown as PostmanNodeData;
  const Icon = d.icon;

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      padding: "10px 14px", borderRadius: 6,
      background: d.color + "08", border: `1px solid ${d.color}18`,
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 6, height: 6 }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Icon size={11} strokeWidth={1.5} style={{ color: d.color }} />
        <span style={{ fontFamily: F, fontSize: 11, fontWeight: 600, color: d.color, lineHeight: 1.4 }}>
          {d.name}
        </span>
        <span style={{
          fontFamily: F, fontSize: 9, color: "var(--text-3)", lineHeight: 1.4,
          padding: "1px 4px", borderRadius: 3,
          background: "var(--surface)", border: "1px solid var(--border)",
        }}>{d.model}</span>
      </div>

      {/* Action pills */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 4 }}>
        {d.actions.map(a => {
          const AIcon = a.icon;
          return (
            <div key={a.label} style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "2px 6px 2px 4px", borderRadius: 3,
              background: d.color + "0a", border: `1px solid ${d.color}18`,
            }} title={a.description}>
              <AIcon size={8} strokeWidth={1.5} style={{ color: d.color }} />
              <span style={{ fontFamily: F, fontSize: 9, fontWeight: 500, color: d.color, lineHeight: 1.4 }}>
                {a.label}
              </span>
            </div>
          );
        })}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 6, height: 6 }} />
    </div>
  );
}
