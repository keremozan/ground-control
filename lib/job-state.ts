import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(process.cwd(), 'data', 'job-state.json');

export type JobState = Record<string, { lastRunAt: string; lastResult?: 'success' | 'error' }>;

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

export function markJobRun(jobId: string, result: 'success' | 'error') {
  const state = readJobState();
  state[jobId] = { lastRunAt: new Date().toISOString(), lastResult: result };
  writeJobState(state);
}
