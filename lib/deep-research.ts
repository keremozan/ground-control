import fs from 'fs';
import path from 'path';
import { GEMINI_API_KEY, HOME } from './config';

const INTERACTIONS_API = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const AGENT = 'deep-research-pro-preview-12-2025';
const STATE_PATH = path.join(process.cwd(), 'data', 'deep-research-state.json');

// ── Types ──

export type ResearchStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ResearchTask = {
  id: string;           // Gemini interaction ID
  query: string;        // The research question
  requestedBy: string;  // Character that requested it
  requestedAt: string;  // ISO timestamp
  status: ResearchStatus;
  completedAt?: string;
  result?: string;      // Full research report text
  error?: string;
};

type ResearchState = {
  tasks: ResearchTask[];
};

// ── State persistence ──

function readState(): ResearchState {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')); }
  catch { return { tasks: [] }; }
}

function writeState(state: ResearchState) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  // Keep last 20 tasks
  state.tasks = state.tasks.slice(0, 20);
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ── API calls ──

async function apiCall(urlPath: string, opts?: RequestInit): Promise<Record<string, unknown>> {
  const url = urlPath.startsWith('http') ? urlPath : `${INTERACTIONS_API}${urlPath}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
      ...opts?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Deep Research API ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Public API ──

/**
 * Start a new deep research task. Returns immediately.
 * The task runs in the background on Google's servers (up to 20 min).
 */
export async function startResearch(opts: {
  query: string;
  requestedBy: string;
}): Promise<ResearchTask> {
  const data = await apiCall('', {
    method: 'POST',
    body: JSON.stringify({
      input: opts.query,
      agent: AGENT,
      background: true,
      tools: [],
      stream: false,
    }),
  });

  const interactionId = (data.id || data.name || '') as string;
  if (!interactionId) throw new Error('No interaction ID returned');

  const task: ResearchTask = {
    id: interactionId,
    query: opts.query,
    requestedBy: opts.requestedBy,
    requestedAt: new Date().toISOString(),
    status: 'running',
  };

  const state = readState();
  state.tasks.unshift(task);
  writeState(state);

  return task;
}

/**
 * Check status of a running research task.
 * If completed, stores the result text.
 */
export async function checkResearch(taskId: string): Promise<ResearchTask | null> {
  const state = readState();
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return null;
  if (task.status === 'completed' || task.status === 'failed') return task;

  try {
    const data = await apiCall(`/${taskId}`);
    const status = (data.status as string || '').toLowerCase();

    if (status === 'completed' || status === 'done') {
      const outputs = data.outputs as Array<{ text?: string }> | undefined;
      const resultText = outputs?.[outputs.length - 1]?.text || '';
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      task.result = resultText;

      // Save as markdown for Scholar to read
      const researchDir = path.join(HOME, 'Desktop', 'Scholar', 'deep-research');
      fs.mkdirSync(researchDir, { recursive: true });
      const slug = task.query.slice(0, 60).replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
      const date = new Date().toISOString().split('T')[0];
      fs.writeFileSync(
        path.join(researchDir, `${date}-${slug}.md`),
        `# Deep Research: ${task.query}\n\nRequested by: ${task.requestedBy}\nCompleted: ${task.completedAt}\n\n---\n\n${resultText}`
      );
    } else if (status === 'failed' || status === 'error') {
      task.status = 'failed';
      task.error = (data.error as string) || 'Unknown error';
    }
    // else still running

    writeState(state);
    return task;
  } catch (err) {
    task.status = 'failed';
    task.error = String(err);
    writeState(state);
    return task;
  }
}

/**
 * Get all research tasks (for dashboard display).
 */
export function listResearch(): ResearchTask[] {
  return readState().tasks;
}

/**
 * Check all running tasks and update their status.
 * Returns any newly completed tasks.
 */
export async function pollAllResearch(): Promise<ResearchTask[]> {
  const state = readState();
  const completed: ResearchTask[] = [];

  for (const task of state.tasks) {
    if (task.status !== 'running') continue;
    const updated = await checkResearch(task.id);
    if (updated?.status === 'completed') {
      completed.push(updated);
    }
  }

  return completed;
}
