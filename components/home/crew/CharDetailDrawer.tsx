"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { X, Brain, Route, BookOpen, FileText, Plus, GitBranch } from "lucide-react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Dagre from "@dagrejs/dagre";
import FileEditorModal from "./FileEditorModal";
import SkillGraphNode from "@/components/system/SkillGraphNode";
import KnowledgeGraphNode from "@/components/system/KnowledgeGraphNode";
import ScheduleGraphNode from "@/components/system/ScheduleGraphNode";

type CharacterInfo = { id: string; name: string; color: string; skills?: string[]; routingKeywords?: string[]; sharedKnowledge?: string[] };
type Tab = "skills" | "keywords" | "knowledge" | "memory" | "graph";
const TABS: { key: Tab; label: string; icon: typeof Brain }[] = [
  { key: "skills", label: "Skills", icon: Brain }, { key: "keywords", label: "Keywords", icon: Route },
  { key: "knowledge", label: "Knowledge", icon: BookOpen }, { key: "memory", label: "Memory", icon: FileText },
  { key: "graph", label: "Graph", icon: GitBranch },
];
const mono = (size: number, extra?: React.CSSProperties): React.CSSProperties => ({ fontFamily: "var(--font-mono)", fontSize: size, ...extra });
const Empty = ({ text }: { text: string }) => <span style={mono(10, { color: "var(--text-3)" })}>{text}</span>;

const NODE_TYPES = {
  skill: SkillGraphNode,
  knowledge: KnowledgeGraphNode,
  schedule: ScheduleGraphNode,
};

const NODE_DIMS: Record<string, { w: number; h: number }> = {
  skill: { w: 160, h: 34 },
  knowledge: { w: 140, h: 42 },
  schedule: { w: 130, h: 38 },
};

const EDGE_STATUS_COLORS: Record<string, string> = {
  ok: "#22c55e",
  broken: "#ef4444",
  unused: "#f59e0b",
};

type GraphApiNode = {
  id: string;
  type: string;
  label: string;
  metadata: Record<string, unknown>;
};
type GraphApiEdge = {
  source: string;
  target: string;
  type: string;
  status: string;
};

function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 20, ranksep: 60, edgesep: 10 });
  for (const n of nodes) {
    const dims = NODE_DIMS[n.type || "skill"] || { w: 150, h: 36 };
    g.setNode(n.id, { width: dims.w, height: dims.h });
  }
  for (const e of edges) g.setEdge(e.source, e.target);
  Dagre.layout(g);
  return nodes.map(n => {
    const pos = g.node(n.id);
    const dims = NODE_DIMS[n.type || "skill"] || { w: 150, h: 36 };
    return { ...n, position: { x: pos.x - dims.w / 2, y: pos.y - dims.h / 2 } };
  });
}

function buildCharacterGraph(
  charId: string,
  apiNodes: GraphApiNode[],
  apiEdges: GraphApiEdge[],
  charColor: string,
): { nodes: Node[]; edges: Edge[] } {
  const charNodeId = `char:${charId}`;

  // Collect skill IDs owned by this character
  const ownedSkillIds = new Set<string>();
  for (const e of apiEdges) {
    if (e.source === charNodeId && e.type === "owns") ownedSkillIds.add(e.target);
  }

  // Collect knowledge IDs declared by this character or read by its skills
  const knowledgeIds = new Set<string>();
  for (const e of apiEdges) {
    if (e.source === charNodeId && e.type === "declares") knowledgeIds.add(e.target);
    if (ownedSkillIds.has(e.source) && e.type === "reads") knowledgeIds.add(e.target);
  }

  // Collect schedule IDs that trigger this character
  const scheduleIds = new Set<string>();
  for (const e of apiEdges) {
    if (e.target === charNodeId && e.type === "triggers") scheduleIds.add(e.source);
  }

  const relevantNodeIds = new Set([...ownedSkillIds, ...knowledgeIds, ...scheduleIds]);
  const nodeMap = new Map(apiNodes.map(n => [n.id, n]));

  const rfNodes: Node[] = [];
  for (const id of relevantNodeIds) {
    const n = nodeMap.get(id);
    if (!n) continue;
    const data: Record<string, unknown> = {};
    if (n.type === "skill") {
      data.name = n.label;
      data.ownerColor = charColor;
      data.missingDeps = Array.isArray(n.metadata.missingDeps) && (n.metadata.missingDeps as string[]).length > 0;
    } else if (n.type === "knowledge") {
      data.name = n.label;
      const declared = (n.metadata.declaredBy as string[]) || [];
      const readBy = (n.metadata.readBy as string[]) || [];
      data.declaredByCount = declared.length;
      data.readByCount = readBy.length;
      data.status = declared.length > 0 && readBy.length === 0 ? "unused" : "ok";
    } else if (n.type === "schedule") {
      data.cron = n.metadata.cron || "";
      data.label = n.label;
      data.enabled = true;
    }
    rfNodes.push({ id, type: n.type, data, position: { x: 0, y: 0 } });
  }

  // Build edges between relevant nodes (skip edges involving the character node itself)
  const rfEdges: Edge[] = [];
  for (const e of apiEdges) {
    if (!relevantNodeIds.has(e.source) && !relevantNodeIds.has(e.target)) continue;
    // Include edges between two relevant nodes, or from char to skill (remap to schedule->skill, skill->knowledge)
    if (e.source === charNodeId || e.target === charNodeId) {
      // Skip the character node edges (owns, declares, triggers) -- we link schedule->skill and skill->knowledge directly
      if (e.type === "triggers" && scheduleIds.has(e.source)) {
        // For each schedule, connect it to each owned skill
        for (const skillId of ownedSkillIds) {
          rfEdges.push({
            id: `${e.source}->${skillId}`,
            source: e.source,
            target: skillId,
            type: "smoothstep",
            style: { stroke: EDGE_STATUS_COLORS[e.status] || "#666", strokeWidth: 1.5 },
          });
        }
      }
      continue;
    }
    if (relevantNodeIds.has(e.source) && relevantNodeIds.has(e.target)) {
      rfEdges.push({
        id: `${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        style: { stroke: EDGE_STATUS_COLORS[e.status] || "#666", strokeWidth: 1.5 },
      });
    }
  }

  // If no schedules, connect skills directly (they're entry points)
  // Also ensure skill->knowledge edges from owns+declares
  for (const skillId of ownedSkillIds) {
    for (const e of apiEdges) {
      if (e.source === charNodeId && e.type === "declares") {
        // Connect skill to declared knowledge
        const edgeId = `${skillId}->${e.target}:declared`;
        if (!rfEdges.some(re => re.id === edgeId) && knowledgeIds.has(e.target) && !rfEdges.some(re => re.source === skillId && re.target === e.target)) {
          // Only add if no reads edge already covers it
        }
      }
    }
  }

  const laidOut = layoutGraph(rfNodes, rfEdges);
  return { nodes: laidOut, edges: rfEdges };
}

function ListButton({ label, hint, color, onClick }: { label: string; hint: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: "6px 10px", borderRadius: 4, background: "var(--surface-2)", border: "1px solid transparent", ...mono(11), color: "var(--text)", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = color + "40")} onMouseLeave={e => (e.currentTarget.style.borderColor = "transparent")}>
      <span>{label}</span><span style={{ fontSize: 9, color, opacity: 0.7 }}>{hint}</span>
    </button>
  );
}

function CharacterGraph({
  character,
  onSkillClick,
  onKnowledgeClick,
}: {
  character: CharacterInfo;
  onSkillClick: (name: string) => void;
  onKnowledgeClick: (key: string) => void;
}) {
  const [graphData, setGraphData] = useState<{ apiNodes: GraphApiNode[]; apiEdges: GraphApiEdge[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);

  useEffect(() => {
    setLoading(true);
    fetch("/api/system/graph")
      .then(r => r.json())
      .then(raw => {
        const d = raw?.data ?? raw;
        setGraphData({ apiNodes: d.nodes || [], apiEdges: d.edges || [] });
      })
      .catch(() => setGraphData({ apiNodes: [], apiEdges: [] }))
      .finally(() => setLoading(false));
  }, [character.id]);

  useEffect(() => {
    if (!graphData) return;
    const { nodes: n, edges: e } = buildCharacterGraph(
      character.id,
      graphData.apiNodes,
      graphData.apiEdges,
      character.color,
    );
    setNodes(n);
    setEdges(e);
  }, [graphData, character.id, character.color, setNodes, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === "skill") {
      const name = (node.data as Record<string, unknown>).name as string;
      onSkillClick(name);
    } else if (node.type === "knowledge") {
      const name = (node.data as Record<string, unknown>).name as string;
      // Knowledge name in the graph is without .md extension
      onKnowledgeClick(name.replace(/\.md$/, ""));
    }
  }, [onSkillClick, onKnowledgeClick]);

  if (loading) return <Empty text="Loading graph..." />;
  if (nodes.length === 0) return <Empty text="No graph data for this character" />;

  return (
    <div style={{ flex: 1, minHeight: 300, width: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        onNodeClick={onNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <Controls showInteractive={false} style={{ transform: "scale(0.75)", transformOrigin: "bottom left" }} />
        <Background gap={16} size={0.5} />
      </ReactFlow>
    </div>
  );
}

export default function CharDetailDrawer({ character, open, onClose, contained }: { character: CharacterInfo; open: boolean; onClose: () => void; contained?: boolean }) {
  const [tab, setTab] = useState<Tab>("skills");
  const [memContent, setMemContent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedKnowledge, setSelectedKnowledge] = useState<string | null>(null);
  const [knowledgeContent, setKnowledgeContent] = useState<string | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState<string | null>(null);
  const [skillLoading, setSkillLoading] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const newKeywordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTab("skills"); setMemContent(null); setEditing(false);
    setSelectedKnowledge(null); setKnowledgeContent(null);
    setSelectedSkill(null); setSkillContent(null);
    setKeywords(character.routingKeywords || []); setNewKeyword("");
  }, [open, character.id]);

  useEffect(() => {
    if (open && tab === "memory" && memContent === null)
      fetch(`/api/system/memory?char=${character.id}`).then(r => r.json()).then(raw => { const d = raw?.data ?? raw; setMemContent(d.content || ""); }).catch(() => setMemContent(""));
  }, [open, tab, character.id, memContent]);

  if (!open) return null;
  const skills = character.skills || [];
  const knowledge = character.sharedKnowledge || [];
  const pos = contained ? "absolute" : "fixed";
  const z = contained ? 10 : 900;

  const fetchAndSet = async (url: string, setter: (v: string) => void, loadSetter: (v: boolean) => void) => {
    loadSetter(true);
    try { const r = await fetch(url); const raw = await r.json(); const d = raw?.data ?? raw; setter(d.content ?? ""); } catch { setter(""); } finally { loadSetter(false); }
  };
  const saveAndClear = async (url: string, content: string, setter: (v: string) => void, closer: (v: null) => void) => {
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
    setter(content); closer(null);
  };
  const handleSkillClick = (name: string) => { setSelectedSkill(name); setSkillContent(null); fetchAndSet(`/api/system/skill?name=${name}`, setSkillContent, setSkillLoading); };
  const handleSkillSave = async (content: string) => { if (selectedSkill) await saveAndClear(`/api/system/skill?name=${selectedSkill}`, content, setSkillContent, setSelectedSkill); };
  const handleKnowledgeClick = (key: string) => { setSelectedKnowledge(key); setKnowledgeContent(null); fetchAndSet(`/api/system/knowledge?key=${key}`, setKnowledgeContent, setKnowledgeLoading); };
  const handleKnowledgeSave = async (content: string) => { if (selectedKnowledge) await saveAndClear(`/api/system/knowledge?key=${selectedKnowledge}`, content, setKnowledgeContent, setSelectedKnowledge); };

  const saveKeywords = async (next: string[]) => {
    setKeywords(next);
    await fetch(`/api/system/character?name=${character.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ routingKeywords: next }) });
  };
  const addKeyword = () => { const kw = newKeyword.trim().toLowerCase(); if (!kw || keywords.includes(kw)) { setNewKeyword(""); return; } saveKeywords([...keywords, kw]); setNewKeyword(""); setTimeout(() => newKeywordRef.current?.focus(), 50); };
  const handleMemSave = async (content: string) => {
    await fetch(`/api/system/memory?char=${character.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
    setMemContent(content); setEditing(false);
  };

  const handleGraphSkillClick = (name: string) => {
    setTab("skills");
    handleSkillClick(name);
  };
  const handleGraphKnowledgeClick = (key: string) => {
    setTab("knowledge");
    handleKnowledgeClick(key);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: pos, inset: 0, zIndex: z, background: "rgba(0,0,0,0.2)" }} />
      <div style={{ position: pos, top: 0, right: 0, bottom: 0, zIndex: z + 1, width: contained ? "100%" : "min(380px, 90vw)", background: "var(--surface)", borderLeft: contained ? "none" : "1px solid var(--border)", boxShadow: "-4px 0 20px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", animation: "slideIn 0.15s ease-out" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: character.color }} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{character.name}</span>
          </div>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)" }}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", padding: "0 12px" }}>
          {TABS.map(t => { const Icon = t.icon; const active = tab === t.key; return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 10px", ...mono(10, { fontWeight: active ? 600 : 400 }), color: active ? character.color : "var(--text-3)", background: "transparent", border: "none", borderBottom: active ? `2px solid ${character.color}` : "2px solid transparent", cursor: "pointer", transition: "all 0.12s" }}>
              <Icon size={10} strokeWidth={1.5} />{t.label}
            </button>
          ); })}
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflow: tab === "graph" ? "hidden" : "auto", padding: tab === "graph" ? 0 : "12px 16px", display: "flex", flexDirection: "column" }}>
          {tab === "skills" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {skills.length === 0 && <Empty text="No skills configured" />}
              {skillLoading && <Empty text="Loading..." />}
              {skills.map(s => <ListButton key={s} label={s} hint="edit" color={character.color} onClick={() => handleSkillClick(s)} />)}
            </div>
          )}
          {tab === "keywords" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {keywords.length === 0 && <Empty text="No routing keywords" />}
                {keywords.map(k => (
                  <span key={k} style={{ padding: "3px 8px", borderRadius: 3, background: character.color + "12", border: `1px solid ${character.color}24`, ...mono(10), color: character.color, display: "flex", alignItems: "center", gap: 4 }}>
                    {k}
                    <button onClick={() => saveKeywords(keywords.filter(x => x !== k))} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 12, height: 12, borderRadius: 2, background: "transparent", border: "none", cursor: "pointer", color: character.color, opacity: 0.5, padding: 0 }} onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}>
                      <X size={8} strokeWidth={2} />
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input ref={newKeywordRef} value={newKeyword} onChange={e => setNewKeyword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addKeyword(); }} placeholder="Add keyword..." style={{ flex: 1, ...mono(10), padding: "4px 8px", borderRadius: 4, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }} />
                <button onClick={addKeyword} disabled={!newKeyword.trim()} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 4, background: newKeyword.trim() ? character.color + "18" : "transparent", border: `1px solid ${newKeyword.trim() ? character.color + "40" : "var(--border)"}`, cursor: newKeyword.trim() ? "pointer" : "default", color: newKeyword.trim() ? character.color : "var(--text-3)" }}>
                  <Plus size={12} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}
          {tab === "knowledge" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {knowledgeLoading && <Empty text="Loading..." />}
              {knowledge.length === 0 && <Empty text="No knowledge files" />}
              {knowledge.map(k => <ListButton key={k} label={`${k}.md`} hint="edit" color={character.color} onClick={() => handleKnowledgeClick(k)} />)}
            </div>
          )}
          {tab === "memory" && (
            <div>
              {memContent === null ? <Empty text="Loading..." /> : memContent === "" ? <Empty text="Memory file is empty" /> : (
                <pre style={{ ...mono(10, { lineHeight: 1.6 }), color: "var(--text-2)", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, padding: 0 }}>{memContent}</pre>
              )}
              <button onClick={() => setEditing(true)} style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 4, background: "transparent", border: `1px solid ${character.color}30`, color: character.color, ...mono(10), cursor: "pointer" }}>
                <FileText size={10} strokeWidth={1.5} /> Edit memory
              </button>
            </div>
          )}
          {tab === "graph" && (
            <CharacterGraph
              character={character}
              onSkillClick={handleGraphSkillClick}
              onKnowledgeClick={handleGraphKnowledgeClick}
            />
          )}
        </div>
      </div>
      {selectedSkill !== null && !skillLoading && skillContent !== null && (
        <FileEditorModal title={`${selectedSkill}/SKILL.md`} content={skillContent} onSave={handleSkillSave} onClose={() => { setSelectedSkill(null); setSkillContent(null); }} />
      )}
      {selectedKnowledge !== null && !knowledgeLoading && knowledgeContent !== null && (
        <FileEditorModal title={`${selectedKnowledge}.md`} content={knowledgeContent} onSave={handleKnowledgeSave} onClose={() => { setSelectedKnowledge(null); setKnowledgeContent(null); }} />
      )}
      {editing && memContent !== null && (
        <FileEditorModal title={`${character.name} -- memory`} content={memContent} onSave={handleMemSave} onClose={() => setEditing(false)} lineLimit={100} />
      )}
      <style jsx>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </>
  );
}
