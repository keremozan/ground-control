"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import Link from "next/link";
import CharacterGroupNode from "@/components/system/CharacterGroupNode";
import KnowledgeGraphNode from "@/components/system/KnowledgeGraphNode";
import ScheduleGraphNode from "@/components/system/ScheduleGraphNode";
import DetailPanel from "@/components/system/DetailPanel";

// ── Types matching /api/system/graph response ──

type ApiNode = {
  id: string;
  type: "character" | "skill" | "knowledge" | "schedule" | "source";
  label: string;
  metadata: Record<string, unknown>;
};

type ApiEdge = {
  source: string;
  target: string;
  type: "owns" | "declares" | "reads" | "triggers" | "feeds";
  status: "ok" | "broken" | "unused";
};

type ApiDiagnostics = {
  totalNodes: number;
  totalEdges: number;
  brokenEdges: number;
  unusedKnowledge: number;
  missingFiles: number;
};

// ── Node type registry ──

const nodeTypes = {
  character: CharacterGroupNode,
  knowledge: KnowledgeGraphNode,
  schedule: ScheduleGraphNode,
};

// ── Node dimensions for dagre ──

const NODE_DIMS: Record<string, { w: number; h: number }> = {
  character: { w: 210, h: 52 },
  knowledge: { w: 150, h: 42 },
  schedule: { w: 140, h: 38 },
};

// ── Edge styling ──

function edgeStyle(apiEdge: ApiEdge, charColor?: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    type: "smoothstep",
  };

  if (apiEdge.status === "broken") {
    return { ...base, style: { stroke: "#ef4444", strokeWidth: 2 }, animated: false };
  }
  if (apiEdge.status === "unused") {
    return { ...base, style: { stroke: "#f59e0b", strokeWidth: 1.5, strokeDasharray: "4 3" }, animated: false };
  }

  // ok status -- color by type
  switch (apiEdge.type) {
    case "triggers":
      return { ...base, style: { stroke: "#3b82f6", strokeWidth: 1 }, animated: true };
    case "declares":
      return { ...base, style: { stroke: charColor || "#666", strokeWidth: 1, strokeDasharray: "3 3", opacity: 0.4 }, animated: false };
    case "reads":
      return { ...base, style: { stroke: "#666", strokeWidth: 1, opacity: 0.5 }, animated: false };
    case "owns":
      return { ...base, style: { stroke: charColor || "#666", strokeWidth: 1, opacity: 0.3 }, animated: false };
    default:
      return { ...base, style: { stroke: "#666", strokeWidth: 1, opacity: 0.3 }, animated: false };
  }
}

// ── Dagre layout ──

function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 160, nodesep: 20 });

  for (const node of nodes) {
    const dim = NODE_DIMS[node.type || "character"] || NODE_DIMS.character;
    g.setNode(node.id, { width: dim.w, height: dim.h });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const dim = NODE_DIMS[node.type || "character"] || NODE_DIMS.character;
    return {
      ...node,
      position: { x: pos.x - dim.w / 2, y: pos.y - dim.h / 2 },
    };
  });
}

// ── Build collapsed graph (schedules -> characters -> knowledge) ──

function buildCollapsedGraph(
  apiNodes: ApiNode[],
  apiEdges: ApiEdge[],
  onSelectNode: (id: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = [];
  const rfEdges: Edge[] = [];

  // Index: character colors
  const charColors: Record<string, string> = {};
  for (const n of apiNodes) {
    if (n.type === "character") charColors[n.id] = (n.metadata.color as string) || "#888";
  }

  // Index: skills per character
  const charSkills: Record<string, Array<{ id: string; name: string; missingDeps: boolean }>> = {};
  const skillNodes = apiNodes.filter((n) => n.type === "skill");
  for (const edge of apiEdges) {
    if (edge.type === "owns") {
      if (!charSkills[edge.source]) charSkills[edge.source] = [];
      const skillNode = skillNodes.find((n) => n.id === edge.target);
      charSkills[edge.source].push({
        id: edge.target,
        name: skillNode?.label || edge.target.replace("skill:", ""),
        missingDeps: Array.isArray(skillNode?.metadata.missingDeps) && (skillNode.metadata.missingDeps as string[]).length > 0,
      });
    }
  }

  // Counts
  const charSkillCount: Record<string, number> = {};
  const charKnowledgeCount: Record<string, number> = {};
  for (const e of apiEdges) {
    if (e.type === "owns") charSkillCount[e.source] = (charSkillCount[e.source] || 0) + 1;
    if (e.type === "declares") charKnowledgeCount[e.source] = (charKnowledgeCount[e.source] || 0) + 1;
  }

  // Knowledge declared/read counts
  const knowledgeDeclared: Record<string, number> = {};
  const knowledgeRead: Record<string, number> = {};
  for (const e of apiEdges) {
    if (e.type === "declares") knowledgeDeclared[e.target] = (knowledgeDeclared[e.target] || 0) + 1;
    if (e.type === "reads") knowledgeRead[e.target] = (knowledgeRead[e.target] || 0) + 1;
  }

  // Has broken edges per character
  const charHasBroken: Record<string, boolean> = {};
  for (const e of apiEdges) {
    if (e.status === "broken" && e.source.startsWith("char:")) charHasBroken[e.source] = true;
    if (e.status === "broken" && e.source.startsWith("skill:")) {
      const ownerEdge = apiEdges.find((oe) => oe.type === "owns" && oe.target === e.source);
      if (ownerEdge) charHasBroken[ownerEdge.source] = true;
    }
  }

  // Character nodes
  for (const node of apiNodes) {
    if (node.type !== "character") continue;
    rfNodes.push({
      id: node.id,
      type: "character",
      position: { x: 0, y: 0 },
      data: {
        name: node.label,
        color: (node.metadata.color as string) || "#888",
        domain: (node.metadata.domain as string) || "",
        tier: (node.metadata.tier as string) || "",
        skillCount: charSkillCount[node.id] || 0,
        knowledgeCount: charKnowledgeCount[node.id] || 0,
        hasBroken: !!charHasBroken[node.id],
        skills: charSkills[node.id] || [],
        onSelectNode,
      },
    });
  }

  // Knowledge nodes
  for (const node of apiNodes) {
    if (node.type !== "knowledge") continue;
    const declared = knowledgeDeclared[node.id] || 0;
    const read = knowledgeRead[node.id] || 0;
    const hasBroken = apiEdges.some((e) => e.target === node.id && e.status === "broken");
    const hasUnused = apiEdges.some((e) => e.target === node.id && e.status === "unused");
    rfNodes.push({
      id: node.id,
      type: "knowledge",
      position: { x: 0, y: 0 },
      data: {
        name: node.label,
        status: hasBroken ? "broken" : hasUnused ? "unused" : "ok",
        declaredByCount: declared,
        readByCount: read,
      },
    });
  }

  // Schedule nodes
  for (const node of apiNodes) {
    if (node.type !== "schedule") continue;
    rfNodes.push({
      id: node.id,
      type: "schedule",
      position: { x: 0, y: 0 },
      data: {
        cron: (node.metadata.cron as string) || "",
        label: node.label,
        enabled: true,
      },
    });
  }

  // Edges: schedule -> character (triggers)
  // Edges: character -> knowledge (declares)
  // Skip owns and reads (skills hidden in collapsed view)
  for (const e of apiEdges) {
    if (e.type === "triggers" || e.type === "declares") {
      const srcExists = rfNodes.some((n) => n.id === e.source);
      const tgtExists = rfNodes.some((n) => n.id === e.target);
      if (!srcExists || !tgtExists) continue;

      const charColor = charColors[e.source] || charColors[e.target] || "#666";
      rfEdges.push({
        id: `e-${e.source}-${e.target}-${e.type}`,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        ...edgeStyle(e, charColor),
      });
    }
  }

  const laid = layoutGraph(rfNodes, rfEdges);
  return { nodes: laid, edges: rfEdges };
}

// ── Page component ──

export default function SystemPage() {
  const [apiData, setApiData] = useState<{ nodes: ApiNode[]; edges: ApiEdge[]; diagnostics: ApiDiagnostics } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [focusedChar, setFocusedChar] = useState<string | null>(null);

  const handleSelectNode = useCallback((id: string) => {
    setSelectedNode(id);
  }, []);

  useEffect(() => {
    fetch("/api/system/graph")
      .then((r) => r.json())
      .then((resp) => {
        const data = resp?.data ?? resp;
        if (!data?.nodes) throw new Error("Invalid response");
        setApiData(data);
        const { nodes: n, edges: e } = buildCollapsedGraph(data.nodes, data.edges, handleSelectNode);
        setNodes(n);
        setEdges(e);
      })
      .catch((err) => setError(err.message));
  }, [handleSelectNode]);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNode(node.id);
  }, []);

  const onNodeDoubleClick = useCallback((_: unknown, node: Node) => {
    if (node.type === "character") {
      setFocusedChar((prev) => (prev === node.id ? null : node.id));
    }
  }, []);

  // Apply focus mode: fade non-connected nodes/edges
  const styledNodes = useMemo(() => {
    if (!focusedChar) return nodes;
    const connectedIds = new Set<string>([focusedChar]);
    if (apiData) {
      for (const e of apiData.edges) {
        if (e.source === focusedChar) connectedIds.add(e.target);
        if (e.target === focusedChar) connectedIds.add(e.source);
        // Also include skills owned by this character and their knowledge connections
        if (e.type === "owns" && e.source === focusedChar) {
          connectedIds.add(e.target);
          for (const e2 of apiData.edges) {
            if (e2.source === e.target) connectedIds.add(e2.target);
          }
        }
      }
    }
    return nodes.map((n) => ({
      ...n,
      style: { ...((n.style as Record<string, unknown>) || {}), opacity: connectedIds.has(n.id) ? 1 : 0.12 },
    }));
  }, [nodes, focusedChar, apiData]);

  const styledEdges = useMemo(() => {
    if (!focusedChar) return edges;
    const connectedIds = new Set<string>([focusedChar]);
    if (apiData) {
      for (const e of apiData.edges) {
        if (e.source === focusedChar || e.target === focusedChar) {
          connectedIds.add(e.source);
          connectedIds.add(e.target);
        }
        if (e.type === "owns" && e.source === focusedChar) {
          connectedIds.add(e.target);
          for (const e2 of apiData.edges) {
            if (e2.source === e.target) {
              connectedIds.add(e2.source);
              connectedIds.add(e2.target);
            }
          }
        }
      }
    }
    return edges.map((e) => ({
      ...e,
      style: {
        ...((e.style as Record<string, unknown>) || {}),
        opacity: connectedIds.has(e.source) && connectedIds.has(e.target)
          ? ((e.style as Record<string, unknown>)?.opacity as number) || 1
          : 0.05,
      },
    }));
  }, [edges, focusedChar, apiData]);

  // Escape to exit focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFocusedChar(null);
        setSelectedNode(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const d = apiData?.diagnostics;
  const charCount = nodes.filter((n) => n.type === "character").length;
  const knowledgeCount = nodes.filter((n) => n.type === "knowledge").length;
  const scheduleCount = nodes.filter((n) => n.type === "schedule").length;

  return (
    <div style={{ height: "calc(100vh - 48px)", display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/" style={{
            fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)",
            textDecoration: "none", background: "var(--surface)",
            border: "1px solid var(--border)", borderRadius: 4, padding: "3px 10px",
          }}>
            &larr; Dashboard
          </Link>
          {focusedChar && (
            <button
              onClick={() => setFocusedChar(null)}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 10, color: "#3b82f6",
                background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
                borderRadius: 4, padding: "3px 8px", cursor: "pointer",
              }}
            >
              Exit focus (Esc)
            </button>
          )}
        </div>

        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span>{charCount} characters, {scheduleCount} schedules, {knowledgeCount} knowledge</span>
          <span style={{ color: "var(--border-2)" }}>|</span>
          <span style={{ color: (d?.brokenEdges || 0) > 0 ? "#ef4444" : "var(--text-3)" }}>
            {d?.brokenEdges || 0} broken
          </span>
          <span style={{ color: (d?.unusedKnowledge || 0) > 0 ? "#f59e0b" : "var(--text-3)" }}>
            {d?.unusedKnowledge || 0} unused
          </span>
        </div>
      </div>

      {error && (
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11, color: "#ef4444",
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 4, padding: "6px 10px",
        }}>
          Failed to load graph: {error}
        </div>
      )}

      {/* Canvas + Detail panel */}
      <div style={{
        flex: 1, borderRadius: 6, border: "1px solid var(--border)",
        overflow: "hidden", background: "var(--bg)", position: "relative",
      }}>
        <ReactFlow
          nodes={styledNodes}
          edges={styledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "smoothstep" }}
        >
          <Controls position="bottom-left" />
          <MiniMap
            position="bottom-right"
            nodeStrokeWidth={1}
            style={{ background: "var(--surface)" }}
          />
          <Background gap={20} size={1} color="var(--border)" />
        </ReactFlow>

        <DetailPanel nodeId={selectedNode} onClose={() => setSelectedNode(null)} />
      </div>
    </div>
  );
}
