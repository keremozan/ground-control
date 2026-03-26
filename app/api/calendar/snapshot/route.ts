import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getTodayEvents, getWeekEvents, CalendarEvent } from '@/lib/google-calendar';

export const runtime = 'nodejs';

const SNAPSHOT_FILE = path.join(process.cwd(), 'data', 'calendar-snapshot.json');
const DIFF_LOG_FILE = path.join(process.cwd(), 'data', 'calendar-diffs.json');

type Snapshot = {
  date: string;
  timestamp: string;
  events: Array<{
    id: string;
    summary: string;
    start: string;
    end: string;
    calendarId: string;
  }>;
};

type DiffEntry = {
  timestamp: string;
  date: string;
  added: Array<{ summary: string; start: string; end: string }>;
  removed: Array<{ summary: string; start: string; end: string }>;
  changed: Array<{ summary: string; field: string; from: string; to: string }>;
};

function readSnapshot(): Snapshot | null {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) return null;
    return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8'));
  } catch { return null; }
}

function writeSnapshot(snap: Snapshot): void {
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snap, null, 2));
}

function readDiffs(): DiffEntry[] {
  try {
    if (!fs.existsSync(DIFF_LOG_FILE)) return [];
    return JSON.parse(fs.readFileSync(DIFF_LOG_FILE, 'utf-8'));
  } catch { return []; }
}

function writeDiffs(diffs: DiffEntry[]): void {
  // Keep last 200 entries
  fs.writeFileSync(DIFF_LOG_FILE, JSON.stringify(diffs.slice(-200), null, 2));
}

function computeDiff(prev: Snapshot, curr: Snapshot): DiffEntry {
  const prevMap = new Map(prev.events.map(e => [e.id, e]));
  const currMap = new Map(curr.events.map(e => [e.id, e]));

  const added: DiffEntry['added'] = [];
  const removed: DiffEntry['removed'] = [];
  const changed: DiffEntry['changed'] = [];

  // Find added and changed
  for (const [id, event] of currMap) {
    const old = prevMap.get(id);
    if (!old) {
      added.push({ summary: event.summary, start: event.start, end: event.end });
    } else {
      if (old.start !== event.start) {
        changed.push({ summary: event.summary, field: 'start', from: old.start, to: event.start });
      }
      if (old.end !== event.end) {
        changed.push({ summary: event.summary, field: 'end', from: old.end, to: event.end });
      }
      if (old.summary !== event.summary) {
        changed.push({ summary: event.summary, field: 'summary', from: old.summary, to: event.summary });
      }
    }
  }

  // Find removed
  for (const [id, event] of prevMap) {
    if (!currMap.has(id)) {
      removed.push({ summary: event.summary, start: event.start, end: event.end });
    }
  }

  return {
    timestamp: new Date().toISOString(),
    date: curr.date,
    added,
    removed,
    changed,
  };
}

/**
 * GET: Take a calendar snapshot, diff against previous, return changes.
 * Called by kybernetes-pulse (morning) and kybernetes-capture (evening).
 */
export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const events = await getWeekEvents();

    const curr: Snapshot = {
      date: today,
      timestamp: new Date().toISOString(),
      events: events.map(e => ({
        id: e.id,
        summary: e.summary,
        start: e.start,
        end: e.end,
        calendarId: e.calendarId,
      })),
    };

    const prev = readSnapshot();
    let diff: DiffEntry | null = null;

    if (prev) {
      diff = computeDiff(prev, curr);
      // Only log if something actually changed
      if (diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0) {
        const diffs = readDiffs();
        diffs.push(diff);
        writeDiffs(diffs);
      }
    }

    writeSnapshot(curr);

    return NextResponse.json({
      ok: true,
      snapshotDate: today,
      eventCount: curr.events.length,
      diff: diff && (diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0)
        ? diff : null,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
