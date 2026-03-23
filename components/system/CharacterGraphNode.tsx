"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type CharacterGraphNodeData = {
  name: string;
  color: string;
  domain: string;
  tier: string;
  skillCount: number;
  knowledgeCount: number;
};

export default function CharacterGraphNode({ data }: NodeProps) {
  const d = data as unknown as CharacterGraphNodeData;
  return (
    <div style={{
      width: 180,
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "8px 10px",
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}>
      <Handle type="target" position={Position.Left} style={{ background: "var(--border-2)" }} />
      <div style={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: d.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 600,
        color: "#fff",
        flexShrink: 0,
      }}>
        {d.name.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.2 }}>
          {d.name}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-3)", lineHeight: 1.3, marginTop: 1 }}>
          {d.domain}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-3)",
            background: "var(--bg)",
            borderRadius: 3,
            padding: "0 4px",
            textTransform: "uppercase",
          }}>
            {d.tier}
          </span>
          {d.skillCount > 0 && (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-3)",
              background: "var(--bg)",
              borderRadius: 3,
              padding: "0 4px",
            }}>
              {d.skillCount}s
            </span>
          )}
          {d.knowledgeCount > 0 && (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-3)",
              background: "var(--bg)",
              borderRadius: 3,
              padding: "0 4px",
            }}>
              {d.knowledgeCount}k
            </span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: "var(--border-2)" }} />
    </div>
  );
}
