import fs from 'fs';
import path from 'path';

const LOG_PATH = path.join(process.cwd(), 'data', 'pipeline-log.json');
const MAX_ENTRIES = 500;

export type StageResult = {
  stage: number;
  name: string;
  result: string;
  reason?: string;
  actions?: string[];
  details?: string[];
  ms: number;
};

export type PipelineEntry = {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  account: string;
  receivedAt: string;
  stages: StageResult[];
  totalMs: number;
  finalAction: string;
};

function readLog(): PipelineEntry[] {
  try { return JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8')); }
  catch { return []; }
}

function writeLog(entries: PipelineEntry[]) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(entries.slice(0, MAX_ENTRIES), null, 2));
}

export function logPipelineEntry(entry: PipelineEntry) {
  const existing = readLog();
  writeLog([entry, ...existing]);
}

export function getPipelineLog(limit = 50): PipelineEntry[] {
  return readLog().slice(0, limit);
}

export function isMessageProcessed(messageId: string): boolean {
  const log = readLog();
  return log.some(e => e.messageId === messageId);
}
