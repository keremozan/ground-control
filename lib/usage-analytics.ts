import fs from 'fs';
import path from 'path';

const MAX_AGE_DAYS = 30;

function analyticsPath() {
  const dir = process.env.__TEST_DATA_DIR || path.join(process.cwd(), 'data');
  return path.join(dir, 'usage-analytics.json');
}

export type UsageEventType = 'panel-open' | 'action-click' | 'chat-start' | 'chat-end' | 'job-view';

export type UsageEvent = {
  timestamp: string;
  type: UsageEventType;
  character: string;
  details?: Record<string, unknown>;
};

function readEvents(): UsageEvent[] {
  try { return JSON.parse(fs.readFileSync(analyticsPath(), 'utf-8')); }
  catch { return []; }
}

function writeEvents(events: UsageEvent[]) {
  const p = analyticsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(events, null, 2));
}

export function recordUsage(event: Omit<UsageEvent, 'timestamp'>) {
  const existing = readEvents();
  existing.unshift({ timestamp: new Date().toISOString(), ...event });
  writeEvents(existing);
}

export function pruneUsageEvents() {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const events = readEvents().filter(e => e.timestamp > cutoff);
  writeEvents(events);
}

export function getUsageSummary(): Record<string, { total: number; byType: Record<string, number> }> {
  const events = readEvents();
  const summary: Record<string, { total: number; byType: Record<string, number> }> = {};
  for (const e of events) {
    if (!summary[e.character]) summary[e.character] = { total: 0, byType: {} };
    summary[e.character].total++;
    summary[e.character].byType[e.type] = (summary[e.character].byType[e.type] || 0) + 1;
  }
  return summary;
}
