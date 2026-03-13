import fs from 'fs';
import path from 'path';
import { TANA_MCP_URL, TANA_MCP_TOKEN, TANA_WORKSPACE_ID, TANA_INBOX_ID, SHARED_DIR } from './config';
import { TANA, ASSIGNED_BY_NAME, PRIORITY_BY_NAME } from './tana-schema';
import { getCharacters } from './characters';

// Local aliases — keep all downstream code unchanged
const MCP_URL = TANA_MCP_URL;

// --- Server-side exclusion tracking ---
// When tasks are trashed/done via dashboard, Tana's search index lags (sometimes >5 min).
// We record excluded IDs in a persistent file so getTanaTasks() filters them out immediately.
const EXCLUSION_PATH = path.join(process.cwd(), 'data', 'task-exclusions.json');
const EXCLUSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type ExclusionEntry = { action: 'done' | 'deleted'; ts: number };
type ExclusionMap = Record<string, ExclusionEntry>;

function loadExclusions(): ExclusionMap {
  try { return JSON.parse(fs.readFileSync(EXCLUSION_PATH, 'utf-8')); } catch { return {}; }
}

function saveExclusions(map: ExclusionMap) {
  fs.mkdirSync(path.dirname(EXCLUSION_PATH), { recursive: true });
  fs.writeFileSync(EXCLUSION_PATH, JSON.stringify(map, null, 2));
}

export function excludeTask(nodeId: string, action: 'done' | 'deleted') {
  const map = loadExclusions();
  map[nodeId] = { action, ts: Date.now() };
  // Prune expired entries
  const cutoff = Date.now() - EXCLUSION_TTL_MS;
  for (const [id, entry] of Object.entries(map)) {
    if (entry.ts < cutoff) delete map[id];
  }
  saveExclusions(map);
}

function getExcludedIds(): Set<string> {
  const map = loadExclusions();
  const cutoff = Date.now() - EXCLUSION_TTL_MS;
  const ids = new Set<string>();
  for (const [id, entry] of Object.entries(map)) {
    if (entry.ts >= cutoff) ids.add(id);
  }
  return ids;
}
const MCP_TOKEN = TANA_MCP_TOKEN;
const TASK_TAG_ID = TANA.tags.task;
const WS_TAG_ID = TANA.tags.workstream;
const STATUS_FIELD_ID = TANA.fields.status;
const STATUS_OPTIONS = TANA.statusOptions;
const PRIORITY_FIELD_ID = TANA.fields.priority;
const PRIORITY_OPTIONS = TANA.priorityOptions;
const ASSIGNED_FIELD_ID = TANA.fields.assigned;
const ASSIGNED_OPTIONS = TANA.assignedOptions;
const WS_STATUS_FIELD_ID = TANA.fields.wsStatus;
const WS_TRACK_FIELD_ID = TANA.fields.wsTrack;
const WS_STATUS_OPTIONS = TANA.wsStatusOptions;

async function mcpCall(method: string, params: Record<string, unknown>) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${MCP_TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  if (data.result?.isError) {
    const msg = data.result?.content?.[0]?.text || 'MCP tool error';
    throw new Error(msg);
  }
  const text = data.result?.content?.[0]?.text;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

export type TanaTask = {
  id: string;
  name: string;
  status: string;
  priority: string;
  track: string;
  trackId: string | null;
  assigned: string | null;
  dueDate: string | null;
  phaseId?: string;
  phaseName?: string;
};

export type TanaPhase = {
  id: string;
  name: string;
  status: string;
  track: string;
  trackId: string | null;
  taskIds: string[];
};

function parseFields(markdown: string): { status: string; priority: string; track: string; trackId: string | null; assigned: string | null; dueDate: string | null } {
  let status = 'backlog';
  let priority = 'medium';
  let track = 'Uncategorized';
  let trackId: string | null = null;
  let assigned: string | null = null;
  let dueDate: string | null = null;

  const statusMatch = markdown.match(/\*\*task status\*\*:\s*\[([^\]]+)\]\(tana:([\w-]+)\)/);
  if (statusMatch) {
    status = STATUS_OPTIONS[statusMatch[2]] || statusMatch[1].toLowerCase();
  }

  const priorityMatch = markdown.match(/\*\*priority\*\*:\s*\[([^\]]+)\]\(tana:([\w-]+)\)/);
  if (priorityMatch) {
    priority = PRIORITY_OPTIONS[priorityMatch[2]] || priorityMatch[1].toLowerCase();
  }

  const trackMatch = markdown.match(/\*\*track\*\*:\s*\[([^\]]+?)(?:\s*#\w+)?\]\(tana:([\w-]+)\)/);
  if (trackMatch) {
    track = trackMatch[1].trim();
    trackId = trackMatch[2];
  }

  const assignedMatch = markdown.match(/\*\*assigned\*\*:\s*\[([^\]]+)\]\(tana:([\w-]+)\)/);
  if (assignedMatch) {
    assigned = ASSIGNED_OPTIONS[assignedMatch[2]] || assignedMatch[1].toLowerCase();
  }

  // Due date: matches "**due date**: Thu, Mar 15", "**due date**: 2026-03-15", or relative like "Today", "Tomorrow", "Yesterday"
  const dueDateMatch = markdown.match(/\*\*due date\*\*:\s*(?:\w+, )?(\w+ \d+(?:, \d+)?|\d{4}-\d{2}-\d{2}|Today|Tomorrow|Yesterday)/i);
  if (dueDateMatch) {
    const raw = dueDateMatch[1];
    const localDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      dueDate = raw;
    } else if (/^today$/i.test(raw)) {
      dueDate = localDate(new Date());
    } else if (/^tomorrow$/i.test(raw)) {
      const d = new Date(); d.setDate(d.getDate() + 1);
      dueDate = localDate(d);
    } else if (/^yesterday$/i.test(raw)) {
      const d = new Date(); d.setDate(d.getDate() - 1);
      dueDate = localDate(d);
    } else {
      // "Mar 1" or "Mar 1, 2026" — if no year, append current year
      const withYear = /,\s*\d{4}$/.test(raw) ? raw : `${raw}, ${new Date().getFullYear()}`;
      const parsed = new Date(withYear);
      if (!isNaN(parsed.getTime())) {
        dueDate = localDate(parsed);
      }
    }
  }

  return { status, priority, track, trackId, assigned, dueDate };
}

const DUE_DATE_FIELD_ID = TANA.fields.dueDate;

export async function getTanaTasks(): Promise<TanaTask[]> {
  const nodes = await mcpCall('tools/call', {
    name: 'search_nodes',
    arguments: {
      query: {
        and: [
          { hasType: TASK_TAG_ID },
          { not: { is: 'done' } },
          { not: { field: { fieldId: STATUS_FIELD_ID, nodeId: STATUS_OPTION_IDS.done } } },
        ],
      },
      limit: 100,
    },
  });

  if (!Array.isArray(nodes)) return [];

  // Filter out tasks recently trashed/done via dashboard (Tana search index lags)
  const excluded = getExcludedIds();

  // Deduplicate by node ID — Tana can return the same node multiple times
  // when a task is tagged with both #task and a child supertag (both match hasType)
  const seen = new Set<string>();
  const uniqueNodes = nodes.filter((n: { id: string; inTrash?: boolean }) => {
    if (n.inTrash) return false;
    if (excluded.has(n.id)) return false;
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  // Sequential — Tana MCP server doesn't support concurrent requests
  const tasks: TanaTask[] = [];

  for (const node of uniqueNodes) {
    try {
      const md = await mcpCall('tools/call', {
        name: 'read_node',
        arguments: { nodeId: (node as { id: string }).id },
      });
      if (typeof md !== 'string') continue;
      const fields = parseFields(md);
      const cleanName = (node as { id: string; name: string }).name
        .replace(/<span[^>]*>[^<]*<\/span>/g, '')
        .replace(/\s*—\s*$/, '')
        .trim();
      tasks.push({ id: (node as { id: string }).id, name: cleanName, ...fields });
    } catch {
      const n = node as { id: string; name: string };
      tasks.push({ id: n.id, name: n.name, status: 'backlog', priority: 'medium', track: 'Uncategorized', trackId: null, assigned: null, dueDate: null });
    }
  }

  return tasks;
}

// --- #workstream fetching ---

function parseWorkstreamFields(markdown: string): { status: string; track: string; trackId: string | null } {
  let status = 'pending';
  let track = 'Uncategorized';
  let trackId: string | null = null;

  const statusMatch = markdown.match(/\*\*status\*\*:\s*\[([^\]]+)\]\(tana:([\w-]+)\)/);
  if (statusMatch) {
    status = WS_STATUS_OPTIONS[statusMatch[2]] || statusMatch[1].toLowerCase();
  }

  const trackMatch = markdown.match(/\*\*track\*\*:\s*\[([^\]]+?)(?:\s*#\w+)?\]\(tana:([\w-]+)\)/);
  if (trackMatch) {
    track = trackMatch[1].trim();
    trackId = trackMatch[2];
  }

  return { status, track, trackId };
}

export async function getTanaPhases(): Promise<TanaPhase[]> {
  // Search for #workstream parent tag + legacy #phase tag
  const LEGACY_PHASE_TAG = TANA.tags.phaseLegacy;
  // Sequential — Tana MCP server doesn't support concurrent requests
  const wsNodes = await mcpCall('tools/call', {
    name: 'search_nodes',
    arguments: {
      query: {
        and: [
          { hasType: WS_TAG_ID },
          { not: { field: { fieldId: WS_STATUS_FIELD_ID, nodeId: TANA.wsStatusByName.completed } } },
        ],
      },
      limit: 50,
    },
  });
  const legacyNodes = await mcpCall('tools/call', {
    name: 'search_nodes',
    arguments: {
      query: { hasType: LEGACY_PHASE_TAG },
      limit: 50,
    },
  });

  const seen = new Set<string>();
  const nodes: { id: string; name: string }[] = [];
  for (const n of (Array.isArray(wsNodes) ? wsNodes : [])) {
    if (n.docType === 'tagDef') continue; // skip schema tag definitions
    if (n.inTrash) continue;
    if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); }
  }
  for (const n of (Array.isArray(legacyNodes) ? legacyNodes : [])) {
    if (n.docType === 'tagDef') continue;
    if (n.inTrash) continue;
    if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); }
  }

  const phases: TanaPhase[] = [];

  for (const node of nodes) {
    try {
      const md = await mcpCall('tools/call', {
        name: 'read_node',
        arguments: { nodeId: node.id, maxDepth: 1 },
      });
      if (typeof md !== 'string') continue;
      const fields = parseWorkstreamFields(md);
      const cleanName = node.name
        .replace(/<span[^>]*>[^<]*<\/span>/g, '')
        .replace(/\s*—\s*$/, '')
        .trim();

      // Extract child task IDs from markdown
      const taskIds: string[] = [];
      const childMatches = md.matchAll(/<!-- node-id: ([\w-]+) -->/g);
      // First match is the workstream node itself, skip it
      let first = true;
      for (const m of childMatches) {
        if (first) { first = false; continue; }
        taskIds.push(m[1]);
      }

      // Skip completed phases (legacy phases not filtered by query)
      if (fields.status === 'completed') continue;
      phases.push({ id: node.id, name: cleanName, ...fields, taskIds });
    } catch {
      // Skip unreadable workstreams
    }
  }

  return phases;
}

/** Create a workstream node (any child tag of #workstream) under a track.
 *  tagId defaults to the parent #workstream tag — pass a child tag ID for
 *  #phase, #logistics, #admin, etc. */
export async function createWorkstream(data: {
  name: string;
  trackId: string;
  tagId?: string;
}): Promise<string | null> {
  const tagId = data.tagId || WS_TAG_ID;
  const lines = [
    `- ${data.name} #[[^${tagId}]]`,
    `  - [[^${WS_TRACK_FIELD_ID}]]:: [[^${data.trackId}]]`,
    `  - [[^${WS_STATUS_FIELD_ID}]]:: [[^${TANA.wsStatusByName.active}]]`,
  ];

  await mcpCall('tools/call', {
    name: 'import_tana_paste',
    arguments: {
      parentNodeId: data.trackId,
      content: lines.join('\n'),
    },
  });

  const found = await mcpCall('tools/call', {
    name: 'search_nodes',
    arguments: {
      query: { and: [{ hasType: tagId }, { text: data.name }] },
      limit: 1,
    },
  });
  return Array.isArray(found) && found.length > 0 ? found[0].id : null;
}

/** Create a #task as a child of a workstream node */
export async function createTaskInWorkstream(wsId: string, data: {
  title: string;
  assigned?: string;
  priority?: string;
  dueDate?: string;
  context?: string;
}): Promise<void> {
  const lines = [
    `- [ ] ${data.title} #[[^${TASK_TAG_ID}]]`,
    `  - [[^${STATUS_FIELD_ID}]]:: [[^${STATUS_OPTION_IDS.backlog}]]`,
  ];
  if (data.assigned && ASSIGNED_BY_NAME[data.assigned]) {
    lines.push(`  - [[^${ASSIGNED_FIELD_ID}]]:: [[^${ASSIGNED_BY_NAME[data.assigned]}]]`);
  }
  if (data.priority) {
    const pMap = PRIORITY_BY_NAME;
    if (pMap[data.priority]) lines.push(`  - [[^${PRIORITY_FIELD_ID}]]:: [[^${pMap[data.priority]}]]`);
  }
  if (data.dueDate) {
    lines.push(`  - [[^${DUE_DATE_FIELD_ID}]]:: ${data.dueDate}`);
  }
  if (data.context) {
    lines.push(`  - ${data.context.replace(/\n+/g, ' ').trim()}`);
  }

  await mcpCall('tools/call', {
    name: 'import_tana_paste',
    arguments: {
      parentNodeId: wsId,
      content: lines.join('\n'),
    },
  });
}

// --- #post creation ---

const POST_TAG_ID = TANA.tags.post;
const POST_SOURCE_FIELD = TANA.postFields.source;
const POST_RECEIVER_FIELD = TANA.postFields.receiver;
const POST_TYPE_FIELD = TANA.postFields.type;
const POST_STATUS_FIELD = TANA.postFields.status;
const POST_PRIORITY_FIELD = TANA.postFields.priority;
const POST_CONTEXT_FIELD = TANA.postFields.context;

/** Create a #post node in Tana inbox for Postman to process */
export async function createPost(data: {
  title: string;
  context: string;
  source: string;
  body?: string;
  receiver?: string;
  type?: string;
  priority?: string;
}): Promise<void> {
  // Context field must be single-line for Tana paste format
  const contextClean = data.context.replace(/\n+/g, ' ').trim();
  const lines = [
    `- ${data.title} #[[^${POST_TAG_ID}]]`,
    `  - [[^${POST_CONTEXT_FIELD}]]:: ${contextClean}`,
    `  - [[^${POST_SOURCE_FIELD}]]:: ${data.source}`,
  ];
  if (data.receiver) lines.push(`  - [[^${POST_RECEIVER_FIELD}]]:: ${data.receiver}`);
  if (data.type) lines.push(`  - [[^${POST_TYPE_FIELD}]]:: ${data.type}`);
  if (data.priority) lines.push(`  - [[^${POST_PRIORITY_FIELD}]]:: ${data.priority}`);
  lines.push(`  - [[^${POST_STATUS_FIELD}]]:: pending`);
  // Add body as a child node if present (not in a field — avoids format breakage)
  if (data.body) {
    const trimmed = data.body.trim().slice(0, 2000);
    for (const line of trimmed.split('\n')) {
      const clean = line.trim();
      if (clean) lines.push(`  - ${clean}`);
    }
  }

  await mcpCall('tools/call', {
    name: 'import_tana_paste',
    arguments: {
      parentNodeId: TANA_INBOX_ID,
      content: lines.join('\n'),
    },
  });
}

/** Create a #task node directly in Tana inbox */
export async function createTask(data: {
  title: string;
  context?: string;
  body?: string;
  assigned?: string;
  priority?: string;
}): Promise<void> {
  const lines = [
    `- ${data.title} #[[^${TASK_TAG_ID}]]`,
    `  - [[^${STATUS_FIELD_ID}]]:: [[^${STATUS_OPTION_IDS.backlog}]]`,
  ];
  if (data.assigned && ASSIGNED_BY_NAME[data.assigned]) {
    lines.push(`  - [[^${ASSIGNED_FIELD_ID}]]:: [[^${ASSIGNED_BY_NAME[data.assigned]}]]`);
  }
  if (data.priority) {
    const pMap = PRIORITY_BY_NAME;
    if (pMap[data.priority]) lines.push(`  - [[^${PRIORITY_FIELD_ID}]]:: [[^${pMap[data.priority]}]]`);
  }
  if (data.context) {
    lines.push(`  - ${data.context.replace(/\n+/g, ' ').trim()}`);
  }
  if (data.body) {
    const trimmed = data.body.trim().slice(0, 2000);
    for (const line of trimmed.split('\n')) {
      const clean = line.trim();
      if (clean) lines.push(`  - ${clean}`);
    }
  }

  await mcpCall('tools/call', {
    name: 'import_tana_paste',
    arguments: {
      parentNodeId: TANA_INBOX_ID,
      content: lines.join('\n'),
    },
  });
}

// --- Task actions ---

const STATUS_OPTION_IDS = TANA.statusByName;
const LOG_TAG_ID = TANA.tags.log;
const TRACK_FIELD_ID = TANA.fields.track;

// ── Dynamic routing — built from character configs at runtime ──

function buildTrackPatterns(): Record<string, RegExp> {
  const chars = getCharacters();
  const patterns: Record<string, RegExp> = {};
  for (const [id, char] of Object.entries(chars)) {
    const tp = (char as any).trackPatterns as string[] | undefined;
    if (tp && tp.length > 0) {
      patterns[id] = new RegExp(tp.join('|'), 'i');
    }
  }
  return patterns;
}

function buildKeywordPatterns(): [RegExp, string][] {
  const chars = getCharacters();
  const overrides: [RegExp, string][] = [];
  for (const [id, char] of Object.entries(chars)) {
    const kw = (char as any).routingKeywords as string[] | undefined;
    if (kw && kw.length > 0) {
      // Word boundaries prevent partial matches (e.g. "art" matching "start")
      const pattern = kw.map(k => `\\b${k}\\b`).join('|');
      overrides.push([new RegExp(pattern, 'i'), id]);
    }
  }
  return overrides;
}

let _trackCache: Record<string, RegExp> | null = null;
let _keywordCache: [RegExp, string][] | null = null;
let _overrideCache: [RegExp, string][] | null = null;

const isDev = process.env.NODE_ENV === 'development';

function getRoutingOverrides(): [RegExp, string][] {
  if (_overrideCache && !isDev) return _overrideCache;
  try {
    const content = fs.readFileSync(path.join(SHARED_DIR, 'routing-overrides.md'), 'utf-8');
    const overrides: [RegExp, string][] = [];
    for (const line of content.split('\n')) {
      const m = line.match(/^- (.+?) → (\w+)/);
      if (m) overrides.push([new RegExp(m[1], 'i'), m[2]]);
    }
    _overrideCache = overrides;
    return overrides;
  } catch { return []; }
}

function getTrackPatterns() {
  if (!_trackCache || isDev) _trackCache = buildTrackPatterns();
  return _trackCache;
}

function getKeywordPatterns() {
  if (!_keywordCache || isDev) _keywordCache = buildKeywordPatterns();
  return _keywordCache;
}

export function clearRoutingCache() {
  _trackCache = null;
  _keywordCache = null;
  _overrideCache = null;
}

export function characterForTrack(track: string, taskName?: string): string {
  if (taskName) {
    for (const [pattern, char] of getKeywordPatterns()) {
      if (pattern.test(taskName)) return char;
    }
  }
  for (const [char, pattern] of Object.entries(getTrackPatterns())) {
    if (pattern.test(track)) return char;
  }
  return 'postman';
}

/**
 * Resolve final character assignment for a task.
 * Explicit Tana assignment always wins. Keywords and track patterns are fallbacks
 * for unassigned tasks only.
 */
export function resolveCharacter(assigned: string | null, track: string, taskName: string): string {
  // 1. Explicit Tana assignment always wins (manual reassignment respected)
  if (assigned) return assigned;
  // 2. Learned overrides (from routing-overrides.md)
  for (const [pattern, char] of getRoutingOverrides()) {
    if (pattern.test(taskName)) return char;
  }
  // 3. Character keyword patterns (from JSON configs)
  for (const [pattern, char] of getKeywordPatterns()) {
    if (pattern.test(taskName)) return char;
  }
  // 4. Track patterns
  for (const [char, pattern] of Object.entries(getTrackPatterns())) {
    if (pattern.test(track)) return char;
  }
  return 'postman';
}

/** Read full task node markdown for AI context */
export async function readTanaNode(nodeId: string): Promise<string | null> {
  const md = await mcpCall('tools/call', { name: 'read_node', arguments: { nodeId } });
  return typeof md === 'string' ? md : null;
}

// Reverse map: priority name → option ID
const PRIORITY_OPTION_IDS: Record<string, string> = Object.fromEntries(
  Object.entries(PRIORITY_OPTIONS).map(([id, name]) => [name, id])
);

/** Set task priority field */
export async function setTaskPriority(nodeId: string, priority: 'high' | 'medium' | 'low') {
  const optionId = PRIORITY_OPTION_IDS[priority];
  if (!optionId) throw new Error(`Unknown priority: ${priority}`);
  await mcpCall('tools/call', {
    name: 'set_field_option',
    arguments: { nodeId, attributeId: PRIORITY_FIELD_ID, optionId },
  });
}

/** Set task status to in-progress and assign character */
export async function setTaskInProgress(nodeId: string, characterId?: string) {
  await mcpCall('tools/call', {
    name: 'set_field_option',
    arguments: { nodeId, attributeId: STATUS_FIELD_ID, optionId: STATUS_OPTION_IDS['in-progress'] },
  });
  // Set assigned field if character provided
  if (characterId && ASSIGNED_BY_NAME[characterId]) {
    await mcpCall('tools/call', {
      name: 'set_field_option',
      arguments: { nodeId, attributeId: ASSIGNED_FIELD_ID, optionId: ASSIGNED_BY_NAME[characterId] },
    });
  }
}

/** Mark task as done — checkbox is critical (getTanaTasks filters on it), status field is secondary */
export async function markTaskDone(nodeId: string) {
  // Immediately exclude from getTanaTasks results (Tana search index lags)
  excludeTask(nodeId, 'done');

  // check_node is what matters — getTanaTasks uses { not: { is: 'done' } } which checks the checkbox
  // Do it first, retry up to 3 times with backoff
  let checked = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await mcpCall('tools/call', { name: 'check_node', arguments: { nodeId } });
      checked = true;
      break;
    } catch {
      if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  // Status field is secondary — best effort
  try {
    await mcpCall('tools/call', {
      name: 'set_field_option',
      arguments: { nodeId, attributeId: STATUS_FIELD_ID, optionId: STATUS_OPTION_IDS.done },
    });
  } catch {
    // Status field failure is non-critical
  }

  if (!checked) throw new Error('Failed to check task as done in Tana (checkbox)');
}

/** Open a node in the desktop Tana app */
export async function openNode(nodeId: string) {
  await mcpCall('tools/call', { name: 'open_node', arguments: { nodeId } });
}

/** Trash a task node (idempotent — ignores "already in trash") */
export async function trashTask(nodeId: string) {
  // Immediately exclude from getTanaTasks results (Tana search index lags)
  excludeTask(nodeId, 'deleted');
  try {
    await mcpCall('tools/call', { name: 'trash_node', arguments: { nodeId } });
  } catch (e) {
    if (String(e).includes('already in trash')) return;
    throw e;
  }
}

/**
 * Archive a task: find/create #log node for the track,
 * add a short summary child, then delete the task.
 */
export async function archiveTask(nodeId: string, taskName: string, trackId: string | null) {
  // Create a #log entry with the task summary as node name, then trash the task
  try {
    const today = new Date().toISOString().split('T')[0];
    const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const trackLine = trackId ? `\n  - [[^${TRACK_FIELD_ID}]]:: [[^${trackId}]]` : '';
    const content = `- ${todayLabel}: ${taskName} #[[^${LOG_TAG_ID}]]${trackLine}\n  - [[^SYS_A90]]:: [[date:${today}]]`;
    await mcpCall('tools/call', {
      name: 'import_tana_paste',
      arguments: {
        parentNodeId: TANA_INBOX_ID,
        content,
      },
    });
  } catch {
    // Log creation failed, but we still trash the task
  }

  try {
    await mcpCall('tools/call', { name: 'trash_node', arguments: { nodeId } });
  } catch {
    // Node may already be trashed — ignore
  }
}

const WORKSPACE_ID = TANA_WORKSPACE_ID;

// ── Class prep ───────────────────────────────────────────────────────────────

const CLASS_TAG_ID = TANA.classTags.class;

export type ChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
  group: 'prep' | 'post-lesson' | null;
};

export type ClassPrepNode = {
  id: string;
  name: string;
  course: string;
  courseId: string | null;
  date: string | null;
  number: number | null;
  checklist: ChecklistItem[];
  totalItems: number;
  checkedItems: number;
};

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseClassDate(raw: string): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Handle relative words from Tana: "Today", "Tomorrow", "Yesterday"
  const lower = raw.toLowerCase().trim();
  if (lower === 'today') return localDateStr(today);
  if (lower === 'tomorrow') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return localDateStr(d);
  }
  if (lower === 'yesterday') {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return localDateStr(d);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const withYear = /,\s*\d{4}$/.test(raw) ? raw : `${raw}, ${today.getFullYear()}`;
  const parsed = new Date(withYear);
  if (!isNaN(parsed.getTime())) return localDateStr(parsed);
  return null;
}

function parseClassFields(markdown: string): {
  course: string; courseId: string | null; date: string | null; number: number | null;
} {
  let course = '';
  let courseId: string | null = null;
  let date: string | null = null;
  let number: number | null = null;

  const courseMatch = markdown.match(/\*\*course\*\*:\s*\[([^\]]+?)(?:\s*#[^\]]+)?\]\(tana:([\w-]+)\)/);
  if (courseMatch) { course = courseMatch[1].trim(); courseId = courseMatch[2]; }

  // Full date field content (everything after "Date**: " up to next newline or <!-- )
  const dateLineMatch = markdown.match(/\*\*Date\*\*:\s*([^\n<]+)/i);
  if (dateLineMatch) {
    const dateLine = dateLineMatch[1].trim();
    // Strip time portion: "Tomorrow, 14:40 → 16:30" -> "Tomorrow"
    // "Mon, Mar 5, 14:40 → 16:30" -> "Mon, Mar 5"
    // "Mar 5, 2026, 14:40" -> "Mar 5, 2026"
    const withoutTime = dateLine.replace(/,?\s*\d{1,2}:\d{2}.*$/, '').trim();
    // Strip leading weekday if followed by month name: "Mon, Mar 5" -> "Mar 5"
    const stripped = withoutTime.replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*/i, '').trim();
    date = parseClassDate(stripped);
  }

  const numMatch = markdown.match(/\*\*number\*\*:\s*(\d+)/i);
  if (numMatch) number = parseInt(numMatch[1], 10);

  return { course, courseId, date, number };
}

function parseChecklist(markdown: string): ChecklistItem[] {
  // Each <!-- node-id: X --> comment appears inline at the end of its own line.
  // Parse line-by-line and associate the ID with the todo on that same line.
  const lines = markdown.split('\n');
  const allItems: { id: string; text: string; checked: boolean; indentLevel: number }[] = [];

  for (const line of lines) {
    const nodeIdMatch = line.match(/<!-- node-id: ([\w-]+) -->/);
    if (!nodeIdMatch) continue;
    const nodeId = nodeIdMatch[1];
    const cleanLine = line.replace(/\s*<!-- node-id: [\w-]+ -->/, '').trimEnd();
    const m = cleanLine.match(/^(\s*)- \[( |x)\] (.+)$/);
    if (m) allItems.push({ id: nodeId, text: m[3].trim(), checked: m[2] === 'x', indentLevel: m[1].length });
  }

  if (allItems.length === 0) return [];

  // Known group headers by text pattern — skip them and use as group transitions.
  // Children (deeper indent) inherit the current group.
  const GROUP_HEADERS: { pattern: RegExp; group: 'prep' | 'post-lesson' }[] = [
    { pattern: /prep lesson/i, group: 'prep' },
    { pattern: /post.?lesson/i, group: 'post-lesson' },
  ];

  // Find the indent level of group headers (the level below the class node itself)
  const groupHeaderLevel = allItems
    .filter(i => GROUP_HEADERS.some(g => g.pattern.test(i.text)))
    .reduce((min, i) => Math.min(min, i.indentLevel), Infinity);

  let currentGroup: 'prep' | 'post-lesson' | null = null;
  let inTemplateContainer = false; // true when inside a non-group-header node at groupHeaderLevel (e.g. "prep tasks")
  const result: ChecklistItem[] = [];

  for (const item of allItems) {
    // Skip the class node itself
    if (item.indentLevel < groupHeaderLevel) continue;

    const headerMatch = GROUP_HEADERS.find(g => g.pattern.test(item.text));

    if (item.indentLevel === groupHeaderLevel) {
      if (headerMatch) {
        // Real group header — update group, exit any template container
        currentGroup = headerMatch.group;
        inTemplateContainer = false;
      } else {
        // Non-group-header at this level (e.g. "prep tasks") — treat as template container, skip it and its subtree
        inTemplateContainer = true;
      }
      continue;
    }

    // Skip anything inside a template container
    if (inTemplateContainer) continue;

    result.push({ id: item.id, text: item.text, checked: item.checked, group: currentGroup });
  }

  return result;
}

const STANDARD_CLASS_CHECKLIST = `- [ ] prep lesson
  - [ ] send readings + SUCourse announcement
  - [ ] prep content
  - [ ] prep slides
  - [ ] prep activities
  - [ ] create SUCourse hidden folder + pending tasks
  - [ ] rehearse
- [ ] post-lesson review
  - [ ] upload slides
  - [ ] update activity report
  - [ ] review workshop node
  - [ ] check submissions`;

async function attachChecklistToClass(nodeId: string): Promise<string> {
  await mcpCall('tools/call', {
    name: 'import_tana_paste',
    arguments: { parentNodeId: nodeId, content: STANDARD_CLASS_CHECKLIST },
  });
  const md = await mcpCall('tools/call', {
    name: 'read_node',
    arguments: { nodeId, maxDepth: 3 },
  });
  return typeof md === 'string' ? md : '';
}

export async function getClassNodes(): Promise<ClassPrepNode[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 90); // show up to ~3 months ahead

  const nodes = await mcpCall('tools/call', {
    name: 'search_nodes',
    arguments: { query: { hasType: CLASS_TAG_ID }, limit: 100 },
  });

  if (!Array.isArray(nodes)) return [];

  const classes: ClassPrepNode[] = [];

  for (const node of nodes) {
    if (node.docType === 'tagDef') continue;
    try {
      const md = await mcpCall('tools/call', {
        name: 'read_node',
        arguments: { nodeId: node.id, maxDepth: 3 },
      });
      if (typeof md !== 'string') continue;

      const fields = parseClassFields(md);

      // Filter: only upcoming classes within 90 days
      if (!fields.date) continue;
      const classDate = new Date(fields.date + 'T00:00:00');
      if (classDate < today || classDate > cutoff) continue;

      const rawNodeName = (node.name as string);
      // Extract lesson number from name pattern if not in number field
      const lessonNumFromName = rawNodeName.match(/(\d+)\.lesson/i);
      const lessonNumber = fields.number ?? (lessonNumFromName ? parseInt(lessonNumFromName[1]) : null);

      const cleanName = rawNodeName
        .replace(/<span[^>]*>[^<]*<\/span>/g, '')
        // Strip ALL lesson suffix patterns (handles duplicates like "4.lesson 4.lesson",
        // unresolved templates like "number.lesson", "__number__.lesson")
        .replace(/(\s+(?:\d+|number|__number__)\.lesson)+$/gi, '')
        // Strip leading course-code prefix like "VA 315/515 — " or "VAVCD — "
        .replace(/^[A-Z][A-Z0-9/\s]*\s*—\s*/, '')
        .replace(/\s*—\s*$/, '')
        .trim() || rawNodeName.trim();

      let checklist = parseChecklist(md);

      // Auto-attach standard checklist if missing (handles calendar-synced nodes).
      // Guard: check actual direct children to see if prep/post-lesson nodes already exist.
      // The supertag template may auto-create a "prep tasks" container with "prep lesson"
      // inside it — that doesn't count. Only direct content children named "prep lesson"
      // or "post-lesson review" mean the checklist is already attached.
      if (checklist.length === 0) {
        const childrenResult = await mcpCall('tools/call', {
          name: 'get_children',
          arguments: { nodeId: node.id, limit: 50 },
        });
        const childList: { name: string; docType: string }[] = Array.isArray(childrenResult?.children) ? childrenResult.children : [];
        const hasDirectChecklist = childList.some(
          c => c.docType === 'content' && (/prep lesson/i.test(c.name) || /post[\s-]?lesson/i.test(c.name))
        );
        if (!hasDirectChecklist) {
          const freshMd = await attachChecklistToClass(node.id);
          if (freshMd) checklist = parseChecklist(freshMd);
        }
      }

      classes.push({
        id: node.id,
        name: cleanName,
        ...fields,
        number: lessonNumber,
        checklist,
        totalItems: checklist.length,
        checkedItems: checklist.filter(i => i.checked).length,
      });
    } catch {
      // Skip unreadable class nodes
    }
  }

  // Sort by date ascending
  classes.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  return classes;
}

/** Toggle a class checklist item (plain todo node, not #task) */
export async function toggleClassItem(nodeId: string, checked: boolean): Promise<void> {
  const tool = checked ? 'check_node' : 'uncheck_node';
  await mcpCall('tools/call', { name: tool, arguments: { nodeId } });
}

/** Check all remaining unchecked checklist items for a class node. Returns count checked. */
export async function checkRemainingPrepItems(classNodeId: string): Promise<number> {
  const md = await mcpCall('tools/call', {
    name: 'read_node',
    arguments: { nodeId: classNodeId, maxDepth: 3 },
  });
  if (typeof md !== 'string') return 0;
  const checklist = parseChecklist(md);
  const toCheck = checklist.filter(i => !i.checked);
  for (const item of toCheck) {
    await mcpCall('tools/call', { name: 'check_node', arguments: { nodeId: item.id } });
  }
  return toCheck.length;
}

/** Send text to today's day page in Tana */
export async function sendToTanaToday(title: string, content: string): Promise<void> {
  // Get today's day node
  const dayNode = await mcpCall('tools/call', {
    name: 'get_or_create_calendar_node',
    arguments: { workspaceId: WORKSPACE_ID, granularity: 'day' },
  });
  const dayNodeId = typeof dayNode === 'string' ? dayNode : dayNode?.nodeId;
  if (!dayNodeId) throw new Error('Could not get today node');

  // Build tana paste content
  const lines = [`- ${title}`];
  for (const line of content.split('\n')) {
    const clean = line.trim();
    if (clean) lines.push(`  - ${clean}`);
  }

  await mcpCall('tools/call', {
    name: 'import_tana_paste',
    arguments: {
      parentNodeId: dayNodeId,
      content: lines.join('\n'),
    },
  });
}
