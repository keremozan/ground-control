import { getBezierPath, type EdgeProps } from "@xyflow/react";

export type FlowEdgeData = {
  color?: string;
  animated?: boolean;
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
        strokeWidth: 1.2,
        strokeOpacity: 0.5,
        fill: "none",
        ...style,
      }}
      className="react-flow__edge-path"
    />
  );
}
