import { mcpCall } from './client';
import { excludeTask } from './cache';
import { TANA_INBOX_ID, TANA_WORKSPACE_ID } from '../config';
import { TANA, ASSIGNED_BY_NAME, PRIORITY_BY_NAME } from '../tana-schema';

// Local aliases
const TASK_TAG_ID = TANA.tags.task;
const WS_TAG_ID = TANA.tags.workstream;
const STATUS_FIELD_ID = TANA.fields.status;
const PRIORITY_FIELD_ID = TANA.fields.priority;
const PRIORITY_OPTIONS = TANA.priorityOptions;
const ASSIGNED_FIELD_ID = TANA.fields.assigned;
const WS_STATUS_FIELD_ID = TANA.fields.wsStatus;
const WS_TRACK_FIELD_ID = TANA.fields.wsTrack;
const DUE_DATE_FIELD_ID = TANA.fields.dueDate;
const STATUS_OPTION_IDS = TANA.statusByName;
const LOG_TAG_ID = TANA.tags.log;
const TRACK_FIELD_ID = TANA.fields.track;
const WORKSPACE_ID = TANA_WORKSPACE_ID;

// --- #post creation ---

const POST_TAG_ID = TANA.tags.post;
const POST_SOURCE_FIELD = TANA.postFields.source;
const POST_RECEIVER_FIELD = TANA.postFields.receiver;
const POST_TYPE_FIELD = TANA.postFields.type;
const POST_STATUS_FIELD = TANA.postFields.status;
const POST_PRIORITY_FIELD = TANA.postFields.priority;
const POST_CONTEXT_FIELD = TANA.postFields.context;

// Reverse map: priority name → option ID
const PRIORITY_OPTION_IDS: Record<string, string> = Object.fromEntries(
  Object.entries(PRIORITY_OPTIONS).map(([id, name]) => [name, id])
);

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

/** Read full task node markdown for AI context */
export async function readTanaNode(nodeId: string): Promise<string | null> {
  const md = await mcpCall('tools/call', { name: 'read_node', arguments: { nodeId } });
  return typeof md === 'string' ? md : null;
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
