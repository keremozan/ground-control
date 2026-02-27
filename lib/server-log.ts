import { appendFile } from 'fs/promises';
import { join } from 'path';
import { HOME } from './config';

const LOG_PATH = join(HOME, '.claude/logs/tiny-log.jsonl');

export async function serverLog(entry: Record<string, unknown>) {
  const line = JSON.stringify({ ...entry, ts: new Date().toISOString(), source: 'server' }) + '\n';
  try { await appendFile(LOG_PATH, line, 'utf-8'); } catch {}
}
