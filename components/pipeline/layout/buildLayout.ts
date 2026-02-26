import type { Node } from "@xyflow/react";

const STORAGE_KEY = "gc-graph-positions-v2";

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
 * Structured grid layout:
 *
 *  [Source] [Source] [Source] [Source] [Source]
 *
 *  [Postman]   [#post]  →  [#task]
 *
 *  [Char] [Char] [Char]          [Output]
 *  [Char] [Char] [Char]          [Output]
 *                                 [#log]
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
  const tags = byType["tanaTag"] || [];
  const characters = byType["character"] || [];
  const outputs = byType["output"] || [];

  // Layout constants
  const COLS = 3;
  const CHAR_W = 280;
  const CHAR_H = 160;
  const CHAR_GAP_X = 20;
  const CHAR_GAP_Y = 20;
  const GRID_W = COLS * CHAR_W + (COLS - 1) * CHAR_GAP_X; // ~880
  const OUT_X = GRID_W + 80;
  const GAP = 14;

  let y = 0;

  // ── Row 0: SOURCES ──
  const srcW = 100;
  const srcTotal = sources.length * srcW + (sources.length - 1) * GAP;
  const srcStart = (GRID_W - srcTotal) / 2;
  sources.forEach((n, i) => {
    n.position = { x: srcStart + i * (srcW + GAP), y };
  });
  y += 55;

  // ── Row 1: PROCESSING (Postman + tags) ──
  const procY = y;
  postman.forEach(n => {
    n.position = { x: 0, y: procY };
  });

  const tagPost = tags.find(t => (t.data as { tag: string }).tag === "#post");
  const tagTask = tags.find(t => (t.data as { tag: string }).tag === "#task");
  const tagLog = tags.find(t => (t.data as { tag: string }).tag === "#log");

  if (tagPost) tagPost.position = { x: 380, y: procY };
  if (tagTask) tagTask.position = { x: 580, y: procY };

  y = procY + 120;

  // ── Row 2: CHARACTERS (3-column grid) ──
  const charY = y;
  characters.forEach((n, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    n.position = {
      x: col * (CHAR_W + CHAR_GAP_X),
      y: charY + row * (CHAR_H + CHAR_GAP_Y),
    };
  });
  const charRows = Math.ceil(characters.length / COLS);
  y = charY + charRows * (CHAR_H + CHAR_GAP_Y);

  // ── Right column: OUTPUTS ──
  const outY = charY;
  outputs.forEach((n, i) => {
    n.position = { x: OUT_X, y: outY + i * 45 };
  });
  if (tagLog) {
    tagLog.position = { x: OUT_X, y: outY + outputs.length * 45 };
  }

  // Apply saved positions as overrides
  return nodes.map(node => {
    if (saved[node.id]) {
      return { ...node, position: saved[node.id] };
    }
    return node;
  });
}
