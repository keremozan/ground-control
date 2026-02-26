import { getBezierPath, type EdgeProps } from "@xyflow/react";

export type FlowEdgeData = {
  color?: string;
  edgeType?: "intake" | "routing" | "schedule" | "output" | "archive";
};

const EDGE_STYLES: Record<string, { dasharray?: string; width: number; opacity: number }> = {
  intake:   { width: 1.4, opacity: 0.5 },
  routing:  { dasharray: "6 3", width: 1.2, opacity: 0.6 },
  schedule: { dasharray: "2 3", width: 1, opacity: 0.35 },
  output:   { width: 1.2, opacity: 0.45 },
  archive:  { width: 0.8, opacity: 0.25 },
};

export default function FlowEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition,
  targetPosition,
  data,
  style = {},
}: EdgeProps) {
  const edgeData = data as FlowEdgeData | undefined;
  const color = edgeData?.color || "var(--border-2)";
  const eType = edgeData?.edgeType || "output";
  const es = EDGE_STYLES[eType] || EDGE_STYLES.output;

  const [edgePath] = getBezierPath({
    sourceX, sourceY,
    targetX, targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <path
      id={id}
      d={edgePath}
      style={{
        stroke: color,
        strokeWidth: es.width,
        strokeOpacity: es.opacity,
        strokeDasharray: es.dasharray,
        fill: "none",
        ...style,
      }}
      className="react-flow__edge-path"
    />
  );
}
