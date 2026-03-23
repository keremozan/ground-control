"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type KnowledgeGraphNodeData = {
  name: string;
  status: "ok" | "unused" | "broken";
  declaredByCount: number;
  readByCount: number;
};

export default function KnowledgeGraphNode({ data }: NodeProps) {
  const d = data as unknown as KnowledgeGraphNodeData;

  const bgTint =
    d.status === "broken" ? "rgba(239, 68, 68, 0.08)" :
    d.status === "unused" ? "rgba(245, 158, 11, 0.08)" :
    "var(--surface)";

  const borderColor =
    d.status === "broken" ? "rgba(239, 68, 68, 0.35)" :
    d.status === "unused" ? "rgba(245, 158, 11, 0.35)" :
    "var(--border)";

  return (
    <div style={{
      width: 140,
      background: bgTint,
      border: `1px solid ${borderColor}`,
      borderRadius: 6,
      padding: "5px 8px",
    }}>
      <Handle type="target" position={Position.Left} style={{ background: "var(--border-2)" }} />
      <Handle type="source" position={Position.Right} style={{ background: "var(--border-2)" }} />
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--text)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {d.name.replace(/\.md$/, "")}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--text-3)",
          background: "var(--bg)",
          borderRadius: 3,
          padding: "0 3px",
        }}>
          {d.declaredByCount}d
        </span>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--text-3)",
          background: "var(--bg)",
          borderRadius: 3,
          padding: "0 3px",
        }}>
          {d.readByCount}r
        </span>
      </div>
    </div>
  );
}
