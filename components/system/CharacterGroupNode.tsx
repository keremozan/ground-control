"use client";
import { useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type SkillEntry = {
  id: string;
  name: string;
  missingDeps: boolean;
};

export type CharacterGroupNodeData = {
  name: string;
  color: string;
  domain: string;
  tier: string;
  skillCount: number;
  knowledgeCount: number;
  hasBroken: boolean;
  skills: SkillEntry[];
  onSelectNode?: (id: string) => void;
};

export default function CharacterGroupNode({ data, id }: NodeProps) {
  const d = data as unknown as CharacterGroupNodeData;
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  }, []);

  const selectSkill = useCallback((skillId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    d.onSelectNode?.(skillId);
  }, [d]);

  return (
    <div style={{
      minWidth: 200,
      background: "var(--surface)",
      border: `1px solid ${d.hasBroken ? "rgba(239,68,68,0.5)" : "var(--border)"}`,
      borderLeft: `3px solid ${d.color}`,
      borderRadius: 6,
      overflow: "hidden",
    }}>
      <Handle type="target" position={Position.Left} style={{ background: d.color }} />

      {/* Header */}
      <div
        onClick={toggle}
        style={{
          padding: "8px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: d.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
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
          <div style={{ fontSize: 9, color: "var(--text-3)", lineHeight: 1.3, marginTop: 1 }}>
            {d.domain}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)",
            background: "var(--bg)", borderRadius: 3, padding: "0 4px",
          }}>
            {d.skillCount}s
          </span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)",
            background: "var(--bg)", borderRadius: 3, padding: "0 4px",
          }}>
            {d.knowledgeCount}k
          </span>
          {d.hasBroken && (
            <span style={{
              width: 6, height: 6, borderRadius: "50%", background: "#ef4444", flexShrink: 0,
            }} />
          )}
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)",
            transform: expanded ? "rotate(90deg)" : "none",
            transition: "transform 0.15s",
          }}>
            ▸
          </span>
        </div>
      </div>

      {/* Expanded skills list */}
      {expanded && d.skills.length > 0 && (
        <div style={{
          borderTop: "1px solid var(--border)",
          padding: "4px 0",
          maxHeight: 300,
          overflowY: "auto",
        }}>
          {d.skills.map((skill) => (
            <div
              key={skill.id}
              onClick={(e) => selectSkill(skill.id, e)}
              style={{
                padding: "3px 10px 3px 42px",
                display: "flex",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--text-2)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{
                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {skill.name}
              </span>
              {skill.missingDeps && (
                <span style={{
                  width: 5, height: 5, borderRadius: "50%", background: "#ef4444", flexShrink: 0,
                }} />
              )}
            </div>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ background: d.color }} />
    </div>
  );
}
