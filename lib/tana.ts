import fs from 'fs';
import path from 'path';
import { TANA_MCP_URL, TANA_MCP_TOKEN, TANA_WORKSPACE_ID, TANA_INBOX_ID, SHARED_DIR } from './config';
import { TANA, ASSIGNED_BY_NAME, PRIORITY_BY_NAME } from './tana-schema';
import { getCharacters } from './characters';

// Local aliases — keep all downstream code unchanged
const MCP_URL = TANA_MCP_URL;
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
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      dueDate = raw;
    } else if (/^today$/i.test(raw)) {
      dueDate = new Date().toISOString().split('T')[0];
    } else if (/^tomorrow$/i.test(raw)) {
      const d = new Date(); d.setDate(d.getDate() + 1);
      dueDate = d.toISOString().split('T')[0];
    } else if (/^yesterday$/i.test(raw)) {
      const d = new Date(); d.setDate(d.getDate() - 1);
      dueDate = d.toISOString().split('T')[0];
    } else {
      // "Mar 1" or "Mar 1, 2026" — if no year, append current year
      const withYear = /,\s*\d{4}$/.test(raw) ? raw : `${raw}, ${new Date().getFullYear()}`;
      const parsed = new Date(withYear);
      if (!isNaN(parsed.getTime())) {
        dueDate = parsed.toISOString().split('T')[0];
      }
    }
  }

  return { status, priority, track, trackId, assigned, dueDate };
}

const DUE_DATE_FIELD_ID = TANA.fields.dueDate;

export async function getTanaTasks(): Promise<TanaTask[]> {
  // 30-day lookahead from today
  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() + 30);
  const cutoff = cutoffDate.toISOString().split('T')[0];

  const nodes = await mcpCall('tools/call', {
    name: 'search_nodes',
    arguments: {
      query: {
        and: [
          { hasType: TASK_TAG_ID },
          { not: { is: 'done' } },
          { not: { compare: { fieldId: DUE_DATE_FIELD_ID, operator: 'gt', value: cutoff, type: 'date' } } },
        ],
      },
      limit: 100,
    },
  });

  if (!Array.isArray(nodes)) return [];

  // Deduplicate by node ID — Tana can return the same node multiple times
  // when a task is tagged with both #task and a child supertag (both match hasType)
  const seen = new Set<string>();
  const uniqueNodes = nodes.filter((n: { id: string }) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  const tasks: TanaTask[] = [];
  const BATCH = 5;

  for (let i = 0; i < uniqueNodes.length; i += BATCH) {
    const batch = uniqueNodes.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (node: { id: string; name: string }) => {
        try {
          const md = await mcpCall('tools/call', {
            name: 'read_node',
            arguments: { nodeId: node.id },
          });
          if (typeof md !== 'string') return null;
          const fields = parseFields(md);
          const cleanName = node.name
            .replace(/<span[^>]*>[^<]*<\/span>/g, '')
            .replace(/\s*—\s*$/, '')
            .trim();
          return { id: node.id, name: cleanName, ...fields };
        } catch {
          return { id: node.id, name: node.name, status: 'backlog', priority: 'medium', track: 'Uncategorized', trackId: null, assigned: null, dueDate: null };
        }
      })
    );
    tasks.push(...results.filter((t): t is TanaTask => t !== null));
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
  const [wsNodes, legacyNodes] = await Promise.all([
    mcpCall('tools/call', {
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
    }),
    mcpCall('tools/call', {
      name: 'search_nodes',
      arguments: {
        query: { hasType: LEGACY_PHASE_TAG },
        limit: 50,
      },
    }),
  ]);

  const seen = new Set<string>();
  const nodes: { id: string; name: string }[] = [];
  for (const n of (Array.isArray(wsNodes) ? wsNodes : [])) {
    if (n.docType === 'tagDef') continue; // skip schema tag definitions
    if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); }
  }
  for (const n of (Array.isArray(legacyNodes) ? legacyNodes : [])) {
    if (n.docType === 'tagDef') continue;
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

/** Mark task as done */
export async function markTaskDone(nodeId: string) {
  await mcpCall('tools/call', {
    name: 'set_field_option',
    arguments: { nodeId, attributeId: STATUS_FIELD_ID, optionId: STATUS_OPTION_IDS.done },
  });
  await mcpCall('tools/call', { name: 'check_node', arguments: { nodeId } });
}

/** Open a node in the desktop Tana app */
export async function openNode(nodeId: string) {
  await mcpCall('tools/call', { name: 'open_node', arguments: { nodeId } });
}

/** Trash a task node */
export async function trashTask(nodeId: string) {
  await mcpCall('tools/call', { name: 'trash_node', arguments: { nodeId } });
}

/**
 * Archive a task: find/create #log node for the track,
 * add a short summary child, then delete the task.
 */
export async function archiveTask(nodeId: string, taskName: string, trackId: string | null) {
  // Try to create a #log entry, but always trash the task even if logging fails
  try {
    let logNodeId: string | null = null;

    if (trackId) {
      const logs = await mcpCall('tools/call', {
        name: 'search_nodes',
        arguments: {
          query: {
            and: [
              { hasType: LOG_TAG_ID },
              { field: { fieldId: TRACK_FIELD_ID, nodeId: trackId } },
            ],
          },
          limit: 1,
        },
      });
      if (Array.isArray(logs) && logs.length > 0) {
        logNodeId = logs[0].id;
      }
    }

    if (!logNodeId) {
      const today = new Date().toISOString().split('T')[0];
      const trackRef = trackId ? `[[^${trackId}]]` : '';
      const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const content = `- Log #[[^${LOG_TAG_ID}]]\n  - [[^${TRACK_FIELD_ID}]]:: ${trackRef}\n  - [[^SYS_A90]]:: [[date:${today}]]\n  - ${todayLabel}: ${taskName}`;
      await mcpCall('tools/call', {
        name: 'import_tana_paste',
        arguments: {
          parentNodeId: TANA_INBOX_ID,
          content,
        },
      });
    } else {
      const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      await mcpCall('tools/call', {
        name: 'import_tana_paste',
        arguments: {
          parentNodeId: logNodeId,
          content: `- ${todayLabel}: ${taskName}`,
        },
      });
    }
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
