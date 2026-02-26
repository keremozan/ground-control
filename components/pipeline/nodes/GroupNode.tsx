import type { NodeProps } from "@xyflow/react";
import type { GroupNodeData } from "../SystemGraph.types";

const F = "var(--font-mono)";

export default function GroupNode({ data }: NodeProps) {
  const d = data as unknown as GroupNodeData;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, pointerEvents: "none" }}>
      <span style={{
        fontFamily: F, fontSize: 10, fontWeight: 700,
        color: "var(--text)", lineHeight: 1.4,
        textTransform: "uppercase", letterSpacing: "0.06em",
      }}>
        {d.label}
      </span>
      {d.note && (
        <span style={{ fontFamily: F, fontSize: 9, color: "var(--text-3)", lineHeight: 1.4, textAlign: "center", maxWidth: 420 }}>
          {d.note}
        </span>
      )}
    </div>
  );
}
