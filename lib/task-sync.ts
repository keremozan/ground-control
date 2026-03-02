import fs from 'fs';
import path from 'path';
import { getTanaTasks, markTaskDone } from './tana';
import { getOrCreateTaskList, listGoogleTasks, createGoogleTask, updateGoogleTask, deleteGoogleTask } from './google-tasks';

const STATE_PATH = path.join(process.cwd(), 'data', 'task-sync-state.json');
const TASK_LIST_NAME = 'Tana Tasks';
const DONE_RETENTION_DAYS = 30;

type SyncMapping = {
  googleTaskId: string;
  title: string;
  dueDate: string | null;
  notes?: string;
  status: 'active' | 'done';
  doneAt?: string;
};

type SyncState = {
  taskListId: string;
  lastSyncAt: string;
  mappings: Record<string, SyncMapping>; // keyed by tanaNodeId
};

type SyncReport = {
  created: number;
  updated: number;
  completedFromTana: number;
  completedFromGoogle: number;
  pruned: number;
  errors: string[];
};

function loadState(): SyncState | null {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function saveState(state: SyncState) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/** Format a YYYY-MM-DD date as RFC 3339 for Google Tasks API */
function toGoogleDue(date: string): string {
  return `${date}T00:00:00.000Z`;
}

/** Build notes string from task metadata */
function buildNotes(task: { track: string; priority: string }): string {
  const parts: string[] = [];
  if (task.track && task.track !== 'Uncategorized') parts.push(`Track: ${task.track}`);
  if (task.priority && task.priority !== 'medium') parts.push(`Priority: ${task.priority}`);
  return parts.join('\n');
}

// Concurrency lock — if a sync is already running, return its result
let syncLock: Promise<SyncReport> | null = null;

export async function syncTasks(): Promise<SyncReport> {
  if (syncLock) return syncLock;
  syncLock = doSync();
  try { return await syncLock; } finally { syncLock = null; }
}

async function doSync(): Promise<SyncReport> {
  const report: SyncReport = { created: 0, updated: 0, completedFromTana: 0, completedFromGoogle: 0, pruned: 0, errors: [] };

  // 1. Load or initialize state, always verify task list exists
  let state = loadState();
  let taskListId: string;
  try {
    taskListId = await getOrCreateTaskList(TASK_LIST_NAME);
  } catch (e) {
    report.errors.push(`Failed to access task list: ${e}`);
    return report;
  }

  if (!state) {
    state = { taskListId, lastSyncAt: new Date().toISOString(), mappings: {} };
  } else {
    state.taskListId = taskListId;
  }

  // 2. Fetch both sides
  const [tanaTasks, googleTasks] = await Promise.all([
    getTanaTasks().catch(() => [] as Awaited<ReturnType<typeof getTanaTasks>>),
    listGoogleTasks(state.taskListId),
  ]);

  // Safety: if Tana returns 0 tasks but state has active mappings, it's likely an MCP error — abort entirely
  const activeCount = Object.values(state.mappings).filter(m => m.status === 'active').length;
  if (tanaTasks.length === 0 && activeCount > 0) {
    report.errors.push('Tana returned 0 tasks but sync state has active mappings — aborting sync (likely MCP error)');
    saveState(state);
    return report;
  }

  const activeTanaIds = new Set(tanaTasks.map((t) => t.id));
  const googleTaskById = new Map(googleTasks.map((t) => [t.id, t]));

  // Track tasks created in this run — their Google Task IDs won't be in googleTaskById
  const createdThisRun = new Set<string>();

  // 3. Forward sync: Tana → Google Tasks
  for (const task of tanaTasks) {
    const mapping = state.mappings[task.id];
    const notes = buildNotes(task);

    if (!mapping) {
      // New task — create in Google Tasks
      try {
        const gt = await createGoogleTask(state.taskListId, {
          title: task.name,
          due: task.dueDate ? toGoogleDue(task.dueDate) : undefined,
          notes: notes || undefined,
        });
        state.mappings[task.id] = {
          googleTaskId: gt.id,
          title: task.name,
          dueDate: task.dueDate,
          status: 'active',
        };
        createdThisRun.add(task.id);
        report.created++;
      } catch (e) {
        report.errors.push(`Create failed for "${task.name}": ${e}`);
      }
    } else if (mapping.status === 'active') {
      // Existing task — update if changed
      const titleChanged = mapping.title !== task.name;
      const dueChanged = mapping.dueDate !== task.dueDate;
      const notesChanged = (mapping.notes || '') !== notes;

      if (titleChanged || dueChanged || notesChanged) {
        try {
          await updateGoogleTask(state.taskListId, mapping.googleTaskId, {
            title: titleChanged ? task.name : undefined,
            due: dueChanged ? (task.dueDate ? toGoogleDue(task.dueDate) : null) : undefined,
            notes: notes || undefined,
          });
          mapping.title = task.name;
          mapping.dueDate = task.dueDate;
          mapping.notes = notes;
          report.updated++;
        } catch (e) {
          report.errors.push(`Update failed for "${task.name}": ${e}`);
        }
      }
    }
  }

  // 4. Detect tasks completed in Tana (in state but no longer in active list)
  //    Note: step 4 mutates mapping.status in-place, so step 5's
  //    `if (mapping.status !== 'active')` guard correctly skips these.
  for (const [tanaId, mapping] of Object.entries(state.mappings)) {
    if (mapping.status === 'active' && !activeTanaIds.has(tanaId)) {
      try {
        await updateGoogleTask(state.taskListId, mapping.googleTaskId, { status: 'completed' });
        mapping.status = 'done';
        mapping.doneAt = new Date().toISOString();
        report.completedFromTana++;
      } catch (e) {
        report.errors.push(`Complete in Google failed for "${mapping.title}": ${e}`);
      }
    }
  }

  // 5. Reverse sync: Google Tasks completion → Tana
  for (const [tanaId, mapping] of Object.entries(state.mappings)) {
    if (mapping.status !== 'active') continue;
    if (createdThisRun.has(tanaId)) continue; // just created, not in pre-fetched list

    const gt = googleTaskById.get(mapping.googleTaskId);
    if (!gt) {
      // Google Task was deleted — clean up orphaned mapping
      mapping.status = 'done';
      mapping.doneAt = new Date().toISOString();
      continue;
    }
    if (gt.status === 'completed') {
      try {
        await markTaskDone(tanaId);
        mapping.status = 'done';
        mapping.doneAt = new Date().toISOString();
        report.completedFromGoogle++;
      } catch (e) {
        report.errors.push(`Complete in Tana failed for "${mapping.title}": ${e}`);
      }
    }
  }

  // 6. Prune old done mappings (older than 30 days)
  const cutoff = Date.now() - DONE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const [tanaId, mapping] of Object.entries(state.mappings)) {
    if (mapping.status === 'done' && mapping.doneAt && new Date(mapping.doneAt).getTime() < cutoff) {
      delete state.mappings[tanaId];
      report.pruned++;
    }
  }

  // 7. Save state
  state.lastSyncAt = new Date().toISOString();
  saveState(state);

  return report;
}

/**
 * Update Google Tasks immediately when a dashboard action modifies a Tana task.
 * Called by the tana-tasks/action route after Tana mutation succeeds.
 * Failures are logged but never thrown — Google Tasks is secondary.
 */
export async function syncGoogleTaskForAction(tanaNodeId: string, action: 'done' | 'deleted'): Promise<void> {
  try {
    const state = loadState();
    if (!state) return;

    const mapping = state.mappings[tanaNodeId];
    if (!mapping || mapping.status !== 'active') return;

    if (action === 'done') {
      await updateGoogleTask(state.taskListId, mapping.googleTaskId, { status: 'completed' });
      mapping.status = 'done';
      mapping.doneAt = new Date().toISOString();
    } else if (action === 'deleted') {
      try {
        await deleteGoogleTask(state.taskListId, mapping.googleTaskId);
      } catch {
        // Google Task may already be deleted — ignore
      }
      delete state.mappings[tanaNodeId];
    }

    saveState(state);
  } catch {
    // Never throw — Google Tasks sync is best-effort from dashboard actions
  }
}
