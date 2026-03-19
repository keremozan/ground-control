import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(process.cwd(), 'data', 'job-state.json');

export type JobState = Record<string, {
  lastRunAt: string;
  lastResult?: 'success' | 'error';
  startedAt?: string;
}>;

export function readJobState(): JobState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function writeJobState(state: JobState) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function markJobStarted(jobId: string) {
  const state = readJobState();
  state[jobId] = { ...(state[jobId] ?? {}), startedAt: new Date().toISOString(), lastRunAt: state[jobId]?.lastRunAt ?? new Date().toISOString() };
  writeJobState(state);
}

export function markJobRun(jobId: string, result: 'success' | 'error') {
  const state = readJobState();
  state[jobId] = { lastRunAt: new Date().toISOString(), lastResult: result };
  writeJobState(state);
}

// ── Gmail History Tracking ──

const HISTORY_FILE = path.join(process.cwd(), 'data', 'gmail-history.json');

export type HistoryState = Record<string, string>; // account -> historyId

export function readHistoryState(): HistoryState {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')); }
  catch { return {}; }
}

export function writeHistoryId(account: string, historyId: string) {
  const state = readHistoryState();
  state[account] = historyId;
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(state, null, 2));
}
