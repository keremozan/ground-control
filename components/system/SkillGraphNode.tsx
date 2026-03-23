"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type SkillGraphNodeData = {
  name: string;
  ownerColor: string;
  missingDeps: boolean;
};

export default function SkillGraphNode({ data }: NodeProps) {
  const d = data as unknown as SkillGraphNodeData;
  return (
    <div style={{
      width: 150,
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderLeft: `3px solid ${d.ownerColor}`,
      borderRadius: 6,
      padding: "5px 8px",
      display: "flex",
      alignItems: "center",
      gap: 5,
    }}>
      <Handle type="target" position={Position.Left} style={{ background: "var(--border-2)" }} />
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--text)",
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {d.name}
      </span>
      {d.missingDeps && (
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#ef4444",
          flexShrink: 0,
        }} />
      )}
      <Handle type="source" position={Position.Right} style={{ background: "var(--border-2)" }} />
    </div>
  );
}
