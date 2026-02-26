"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2, Settings } from "lucide-react";
import { resolveIcon } from "@/lib/icon-map";
import { SCHEDULE_JOBS } from "@/lib/scheduler";
import { buildLayout, savePositions } from "./layout/buildLayout";
import FileEditorModal from "./FileEditorModal";
import SystemConfigDrawer from "./SystemConfigDrawer";

// Node components
import SourceNode from "./nodes/SourceNode";
import PostmanNode from "./nodes/PostmanNode";
import TanaTagNode from "./nodes/TanaTagNode";
import CharacterNode from "./nodes/CharacterNode";
import OutputNode from "./nodes/OutputNode";

// Edge components
import FlowEdge from "./edges/FlowEdge";

// Types
import type {
  ApiCharacter, ApiConfig,
  SourceNodeData, PostmanNodeData,
  TanaTagNodeData, CharacterNodeData, OutputNodeData,
} from "./SystemGraph.types";
import { tagInfo as TAG_INFO } from "./SystemGraph.types";

const F = "var(--font-mono)";

const nodeTypes = {
  source: SourceNode,
  postman: PostmanNode,
  tanaTag: TanaTagNode,
  character: CharacterNode,
  output: OutputNode,
};

const edgeTypes = {
  flow: FlowEdge,
};

export default function SystemGraph() {
  const [apiChars, setApiChars] = useState<ApiCharacter[]>([]);
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [editor, setEditor] = useState<{
    title: string; content: string; saveUrl: string; lineLimit?: number;
  } | null>(null);

  // Fetch all data on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/characters").then(r => r.json()),
      fetch("/api/system/config").then(r => r.json()),
    ]).then(([charData, configData]) => {
      setApiChars(charData.characters || []);
      setApiConfig(configData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Editor handlers
  const openEditor = useCallback(async (title: string, fetchUrl: string, saveUrl: string, lineLimit?: number) => {
    try {
      const res = await fetch(fetchUrl);
      const data = await res.json();
      if (data.content !== undefined) {
        setEditor({ title, content: data.content, saveUrl, lineLimit });
      } else if (data.error) {
        setEditor({ title, content: `---\nname: ${title.replace('.md', '')}\ndescription: \n---\n\n`, saveUrl, lineLimit });
      }
    } catch {}
  }, []);

  const handleEditorSave = useCallback(async (content: string) => {
    if (!editor) return;
    await fetch(editor.saveUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  }, [editor]);

  // Derived data
  const charColorMap = useMemo(() =>
    Object.fromEntries(apiChars.map(c => [c.id, c.color])),
    [apiChars]
  );

  // Build nodes + edges when API data arrives
  useEffect(() => {
    if (!apiConfig || apiChars.length === 0) return;

    const postman = apiChars.find(c => c.id === "postman");
    const characters = apiChars.filter(c => c.id !== "postman" && c.tier !== "stationed");
    const sources = apiConfig.sources || [];
    const outputs = apiConfig.outputs || [];
    const enabledJobs = SCHEDULE_JOBS.filter(j => j.enabled);

    // Build a map of charName → schedule jobs
    const charSchedules: Record<string, { displayName: string; cron: string }[]> = {};
    for (const job of enabledJobs) {
      (charSchedules[job.charName] ||= []).push({
        displayName: job.displayName,
        cron: job.cron,
      });
    }

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // ── Row 0: SOURCES ──
    sources.forEach((s) => {
      const nodeId = `source-${s.label}`;
      newNodes.push({
        id: nodeId,
        type: "source",
        position: { x: 0, y: 0 },
        data: {
          label: s.label,
          icon: resolveIcon(s.icon),
          color: s.color,
          description: s.description,
        } satisfies SourceNodeData,
      });
      // Edge: source → postman (intake)
      if (postman) {
        newEdges.push({
          id: `e-${nodeId}-postman`,
          source: nodeId,
          target: "postman",
          type: "flow",
          data: { color: s.color, edgeType: "intake" },
        });
      }
    });

    // ── Row 1: PROCESSING ──

    // Postman node
    if (postman) {
      newNodes.push({
        id: "postman",
        type: "postman",
        position: { x: 0, y: 0 },
        data: {
          id: postman.id,
          name: postman.name,
          icon: resolveIcon(postman.icon),
          color: postman.color,
          model: postman.model,
          actions: postman.actions.map(a => ({
            label: a.label, icon: resolveIcon(a.icon), description: a.description,
          })),
        } satisfies PostmanNodeData,
      });
      // Edge: postman → #post (intake)
      newEdges.push({
        id: "e-postman-post",
        source: "postman",
        target: "tag-post",
        type: "flow",
        data: { color: postman.color, edgeType: "intake" },
      });
    }

    // TanaTag #post
    newNodes.push({
      id: "tag-post",
      type: "tanaTag",
      position: { x: 0, y: 0 },
      data: {
        tag: "#post",
        fields: "From · Source · Receiver · Type · Priority",
        description: TAG_INFO["#post"],
      } satisfies TanaTagNodeData,
    });

    // TanaTag #task
    newNodes.push({
      id: "tag-task",
      type: "tanaTag",
      position: { x: 0, y: 0 },
      data: {
        tag: "#task",
        fields: "Status · Priority · Track · Assigned",
        description: TAG_INFO["#task"],
      } satisfies TanaTagNodeData,
    });

    // Edge: #post → #task (routing)
    newEdges.push({
      id: "e-post-task",
      source: "tag-post",
      target: "tag-task",
      type: "flow",
      data: { color: "#f59e0b", edgeType: "routing" },
    });

    // ── Row 2: CHARACTERS ──
    characters.forEach((c, charIdx) => {
      const nodeId = `char-${c.id}`;
      newNodes.push({
        id: nodeId,
        type: "character",
        position: { x: 0, y: 0 },
        data: {
          id: c.id,
          name: c.name,
          icon: resolveIcon(c.icon),
          color: c.color,
          model: c.model,
          domain: c.domain,
          actions: c.actions.map(a => ({
            label: a.label, icon: resolveIcon(a.icon), description: a.description,
          })),
          outputs: c.outputs,
          routing: c.routingKeywords,
          gates: c.gates.length > 0 ? c.gates : undefined,
          skills: c.skills,
          sharedKnowledge: c.sharedKnowledge,
          schedules: charSchedules[c.id] || [],
          onOpenEditor: openEditor,
        } satisfies CharacterNodeData,
      });

      // Edge: #task → character (routing) — offset to separate parallel lines
      const routeOffset = (charIdx - (characters.length - 1) / 2) * 8;
      newEdges.push({
        id: `e-task-${c.id}`,
        source: "tag-task",
        target: nodeId,
        type: "flow",
        data: { color: c.color, edgeType: "routing", offset: routeOffset },
      });

      // Edge: character → outputs (output type, from right handle)
      c.outputs.forEach((out, outIdx) => {
        const outputNode = outputs.find(o => o.label === out);
        if (outputNode) {
          newEdges.push({
            id: `e-${c.id}-out-${out}`,
            source: nodeId,
            sourceHandle: "right",
            target: `output-${out}`,
            type: "flow",
            data: { color: c.color, edgeType: "output", offset: outIdx * 4 },
          });
        }
      });

      // Edge: character → #log (archive)
      newEdges.push({
        id: `e-${c.id}-log`,
        source: nodeId,
        sourceHandle: "right",
        target: "tag-log",
        type: "flow",
        data: { color: "var(--border-2)", edgeType: "archive", offset: charIdx * 3 },
      });
    });

    // ── Right column: OUTPUTS ──
    outputs.forEach(o => {
      newNodes.push({
        id: `output-${o.label}`,
        type: "output",
        position: { x: 0, y: 0 },
        data: {
          label: o.label,
          icon: resolveIcon(o.icon),
          color: o.color,
        } satisfies OutputNodeData,
      });
    });

    // TanaTag #log (in outputs column)
    newNodes.push({
      id: "tag-log",
      type: "tanaTag",
      position: { x: 0, y: 0 },
      data: {
        tag: "#log",
        fields: "Track · Date · Summary",
        description: TAG_INFO["#log"],
      } satisfies TanaTagNodeData,
    });

    // Run structured layout
    const layoutedNodes = buildLayout(newNodes);
    setNodes(layoutedNodes);
    setEdges(newEdges);
  }, [apiChars, apiConfig, charColorMap, openEditor, setNodes, setEdges]);

  // Save positions on drag end
  const onNodeDragStop = useCallback(() => {
    savePositions(nodes);
  }, [nodes]);

  if (loading) {
    return (
      <div className="widget" style={{ overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="widget-header">
          <span className="widget-header-label">System Flow</span>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Loader2 size={14} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
          <span style={{ fontFamily: F, fontSize: 10, color: "var(--text-3)" }}>Loading system data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="widget" style={{ overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="widget-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="widget-header-label">System Flow</span>
        <button
          onClick={() => setShowConfig(true)}
          style={{
            display: "flex", alignItems: "center", gap: 3,
            padding: "2px 6px", borderRadius: 3,
            background: "transparent", border: "1px solid var(--border)",
            cursor: "pointer", color: "var(--text-3)",
            fontFamily: F, fontSize: 9,
          }}
        >
          <Settings size={10} strokeWidth={1.5} />
          Config
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          style={{ background: "var(--surface-2)" }}
        >
          <Background gap={20} size={0.5} color="var(--border)" />
          <Controls
            showInteractive={false}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4 }}
          />
          <MiniMap
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4 }}
            maskColor="rgba(0,0,0,0.08)"
            nodeStrokeWidth={1}
          />
        </ReactFlow>
      </div>

      {showConfig && (
        <SystemConfigDrawer
          onClose={() => setShowConfig(false)}
          onOpenEditor={openEditor}
          charColorMap={charColorMap}
        />
      )}

      {editor && (
        <FileEditorModal
          title={editor.title}
          content={editor.content}
          onSave={handleEditorSave}
          onClose={() => setEditor(null)}
          lineLimit={editor.lineLimit}
        />
      )}
    </div>
  );
}
