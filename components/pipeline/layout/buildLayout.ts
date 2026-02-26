import type { Node, Edge } from "@xyflow/react";

const STORAGE_KEY = "gc-graph-positions";

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

/**
 * Structured grid layout matching the system architecture sketch:
 *
 *  ┌─────────────── CAPTURES ─────────────────┐
 *  │  [Source] [Source] [Source] [Source]       │
 *  └──────────────────────────────────────────-┘
 *  ┌─ PROCESSING ──────────────────┐ ┌ OUTPUTS ┐
 *  │ Schedules │ Postman │ #post   │ │ [out]   │
 *  │           │         │ #task   │ │ [out]   │
 *  └───────────────────────────────┘ │ [#log]  │
 *  ┌─ CHARACTERS ──────────────────┐ │ [out]   │
 *  │ [Character Row]               │ │         │
 *  │ [Character Row]               │ │         │
 *  │ ...                           │ └─────────┘
 *  └───────────────────────────────┘
 */
export function buildLayout(nodes: Node[]): Node[] {
  const saved = loadPositions();

  // Classify nodes by type
  const byType: Record<string, Node[]> = {};
  for (const n of nodes) {
    const t = n.type || "unknown";
    (byType[t] ||= []).push(n);
  }

  const sources = byType["source"] || [];
  const postman = byType["postman"] || [];
  const schedules = byType["schedule"] || [];
  const tags = byType["tanaTag"] || [];
  const characters = byType["character"] || [];
  const outputs = byType["output"] || [];
  const groups = byType["group"] || [];

  // Layout constants
  const MAIN_W = 700;       // main content width
  const OUT_X = MAIN_W + 60; // outputs column x
  const GAP = 14;

  let y = 0;

  // ── Row 0: CAPTURES label ──
  const capturesLabel = groups.find(g => (g.data as { label: string }).label === "CAPTURES");
  if (capturesLabel) capturesLabel.position = { x: MAIN_W / 2 - 40, y };
  y += 30;

  // Sources: spread horizontally
  const srcW = 120;
  const srcTotal = sources.length * srcW + (sources.length - 1) * GAP;
  const srcStart = (MAIN_W - srcTotal) / 2;
  sources.forEach((n, i) => {
    n.position = { x: srcStart + i * (srcW + GAP), y };
  });
  y += 60;

  // ── Row 1: PROCESSING ──
  const procY = y;

  // Schedules (left column)
  const schedX = 0;
  schedules.forEach((n, i) => {
    n.position = { x: schedX, y: procY + i * 70 };
  });

  // Postman (center)
  postman.forEach(n => {
    n.position = { x: 200, y: procY };
  });

  // Tana tags #post, #task (right of postman)
  const tagPost = tags.find(t => (t.data as { tag: string }).tag === "#post");
  const tagTask = tags.find(t => (t.data as { tag: string }).tag === "#task");
  const tagLog = tags.find(t => (t.data as { tag: string }).tag === "#log");
  if (tagPost) tagPost.position = { x: 480, y: procY };
  if (tagTask) tagTask.position = { x: 480, y: procY + 70 };

  const procHeight = Math.max(
    schedules.length * 70,
    140,
    tagTask ? 140 : 70,
  );
  y = procY + procHeight + 40;

  // ── Row 2: CHARACTERS ──
  const charY = y;
  const CHAR_ROW_H = 170;
  characters.forEach((n, i) => {
    n.position = { x: 0, y: charY + i * CHAR_ROW_H };
  });
  y = charY + characters.length * CHAR_ROW_H;

  // ── Right column: OUTPUTS ──
  const outY = procY;
  outputs.forEach((n, i) => {
    n.position = { x: OUT_X, y: outY + i * 50 };
  });
  // #log at bottom of outputs
  if (tagLog) {
    const logY = outY + outputs.length * 50;
    tagLog.position = { x: OUT_X, y: logY };
  }

  // Apply saved positions as overrides
  const allNodes = [...sources, ...postman, ...schedules, ...tags, ...characters, ...outputs, ...groups];
  return nodes.map(node => {
    if (saved[node.id]) {
      return { ...node, position: saved[node.id] };
    }
    const found = allNodes.find(n => n.id === node.id);
    if (found?.position) {
      return { ...node, position: found.position };
    }
    return node;
  });
}
