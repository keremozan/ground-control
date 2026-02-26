import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

const STORAGE_KEY = "gc-graph-positions";

/** Node dimensions by type — dagre needs these to route edges around nodes */
const NODE_SIZES: Record<string, { width: number; height: number }> = {
  source:    { width: 120, height: 40 },
  postman:   { width: 200, height: 120 },
  schedule:  { width: 160, height: 60 },
  tanaTag:   { width: 140, height: 50 },
  character: { width: 280, height: 140 },
  output:    { width: 120, height: 40 },
  group:     { width: 100, height: 30 },
};

/** Load saved positions from localStorage */
function loadPositions(): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Save positions to localStorage */
export function savePositions(nodes: Node[]) {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    positions[n.id] = { x: n.position.x, y: n.position.y };
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {}
}

/** Run dagre layout, return nodes with positions. Saved positions override dagre. */
export function buildLayout(nodes: Node[], edges: Edge[]): Node[] {
  const saved = loadPositions();

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 40, marginx: 40, marginy: 40 });

  for (const node of nodes) {
    const size = NODE_SIZES[node.type || "source"] || NODE_SIZES.source;
    g.setNode(node.id, { width: size.width, height: size.height });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map(node => {
    // Use saved position if available, otherwise use dagre result
    if (saved[node.id]) {
      return { ...node, position: saved[node.id] };
    }
    const pos = g.node(node.id);
    const size = NODE_SIZES[node.type || "source"] || NODE_SIZES.source;
    return {
      ...node,
      position: {
        x: pos.x - size.width / 2,
        y: pos.y - size.height / 2,
      },
    };
  });
}
