import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const LOG_FILE = path.join(process.cwd(), 'data', 'tutor-log.jsonl');
const CURRICULUM_FILE = path.join(process.env.HOME || '', '.claude', 'shared', 'tutor-curriculum.md');
const PROGRESS_FILE = path.join(process.env.HOME || '', '.claude', 'shared', 'tutor-progress.md');

// ── Types ──

type LogEntry = {
  date: string;
  type: 'vocab' | 'grammar' | 'writing';
  item: string;
  result: 'correct' | 'wrong' | 'partial';
  source: 'drill' | 'test' | 'exercise' | 'passive';
  note?: string;
};

type ItemStats = {
  item: string;
  type: string;
  streak: number;
  interval: number;
  lastDate: string;
  nextDue: string;
  status: 'new' | 'active' | 'mastered';
  totalCorrect: number;
  totalAttempts: number;
  lastNote?: string;
};

// ── Spaced Repetition ──

function computeInterval(streak: number): number {
  if (streak <= 0) return 1;
  if (streak === 1) return 2;
  if (streak === 2) return 4;
  if (streak === 3) return 8;
  if (streak === 4) return 16;
  return 30; // mastered
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function readLog(): LogEntry[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const raw = fs.readFileSync(LOG_FILE, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n')
      .filter(line => line.trim().length > 0)
      .flatMap(line => {
        try { return [JSON.parse(line) as LogEntry]; }
        catch { return []; }
      });
  } catch { return []; }
}

function parseCurriculumItems(content: string): Array<{ item: string; type: string; set?: string }> {
  const items: Array<{ item: string; type: string; set?: string }> = [];

  // Parse vocab: lines like "- word /pronunciation/ -- definition" or "| word | definition |"
  const vocabSection = content.match(/## Vocabulary[\s\S]*?(?=## |$)/);
  if (vocabSection) {
    const setBlocks = vocabSection[0].matchAll(/### (AWL Set \d+|Set \d+|[\w\s]+)\n([\s\S]*?)(?=###|$)/g);
    for (const block of setBlocks) {
      const setName = block[1].trim();
      const lines = block[2].split('\n');
      for (const line of lines) {
        const match = line.match(/^[-*]\s+\*?(\w[\w\s]*\w?)\*?\s/);
        if (match) {
          items.push({ item: match[1].trim().toLowerCase(), type: 'vocab', set: setName });
        }
      }
    }
  }

  // Parse grammar: lines like "- rule name"
  const grammarSection = content.match(/## Grammar[\s\S]*?(?=## |$)/);
  if (grammarSection) {
    const lines = grammarSection[0].split('\n');
    for (const line of lines) {
      const match = line.match(/^[-*]\s+(.+?)(?:\s*\(|$)/);
      if (match && !line.startsWith('##')) {
        const rule = match[1].trim();
        if (rule.length > 3 && rule.length < 80) {
          items.push({ item: rule.toLowerCase(), type: 'grammar' });
        }
      }
    }
  }

  return items;
}

function computeStats(entries: LogEntry[], curriculumItems: Array<{ item: string; type: string; set?: string }>): ItemStats[] {
  const today = new Date().toISOString().split('T')[0];

  // Group log entries by item
  const byItem = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const key = `${e.type}:${e.item}`;
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key)!.push(e);
  }

  const stats: ItemStats[] = [];
  const seen = new Set<string>();

  // Process items that have log entries
  for (const [key, itemEntries] of byItem) {
    seen.add(key);
    const sorted = itemEntries.sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];

    // Passive-only items: accumulate silently until 2+ observations, then enter SRS with interval 7
    const nonPassive = sorted.filter(e => e.source !== 'passive');
    const passiveCount = sorted.filter(e => e.source === 'passive').length;
    if (nonPassive.length === 0) {
      // All entries are passive
      if (passiveCount < 2) continue; // not enough signal yet, skip entirely
      // 2+ passive observations: enter as active with 7-day interval
      stats.push({
        item: last.item,
        type: last.type,
        streak: 0,
        interval: 7,
        lastDate: last.date,
        nextDue: addDays(last.date, 7),
        status: 'active',
        totalCorrect: 0,
        totalAttempts: passiveCount,
        lastNote: [...sorted].reverse().find(e => e.note)?.note,
      });
      continue;
    }

    // Compute streak (consecutive correct from the end)
    // partial freezes the streak (doesn't increment or reset), wrong resets to 0
    let streak = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].result === 'correct') streak++;
      else if (sorted[i].result === 'wrong') break;
      // partial: stop counting but don't reset
      else break;
    }

    const interval = computeInterval(streak);
    const nextDue = addDays(last.date, interval);
    const totalCorrect = sorted.filter(e => e.result === 'correct').length;
    const status = streak >= 5 && interval >= 30 ? 'mastered' : 'active';

    stats.push({
      item: last.item,
      type: last.type,
      streak,
      interval,
      lastDate: last.date,
      nextDue,
      status,
      totalCorrect,
      totalAttempts: sorted.length,
      lastNote: [...sorted].reverse().find(e => e.note)?.note,
    });
  }

  // Add curriculum items that have never been logged
  for (const ci of curriculumItems) {
    const key = `${ci.type}:${ci.item}`;
    if (!seen.has(key)) {
      stats.push({
        item: ci.item,
        type: ci.type,
        streak: 0,
        interval: 0,
        lastDate: '',
        nextDue: '',
        status: 'new',
        totalCorrect: 0,
        totalAttempts: 0,
      });
    }
  }

  return stats;
}

function writeProgressSummary(stats: ItemStats[], entries: LogEntry[]): void {
  const today = new Date().toISOString().split('T')[0];

  const active = stats.filter(s => s.status === 'active');
  const mastered = stats.filter(s => s.status === 'mastered');
  const newItems = stats.filter(s => s.status === 'new');
  const due = stats.filter(s => s.status === 'active' && s.nextDue <= today);

  // Accuracy by type
  const byType: Record<string, { correct: number; total: number }> = {};
  for (const e of entries) {
    if (!byType[e.type]) byType[e.type] = { correct: 0, total: 0 };
    byType[e.type].total++;
    if (e.result === 'correct') byType[e.type].correct++;
  }

  const accuracy = Object.entries(byType).map(([type, { correct, total }]) =>
    `${type}: ${Math.round((correct / total) * 100)}% (${correct}/${total})`
  ).join(', ');

  // Last 5 test dates with scores
  const testEntries = entries.filter(e => e.source === 'test');
  const testDates = [...new Set(testEntries.map(e => e.date))].sort().slice(-5);
  const testScores = testDates.map(d => {
    const dayTests = testEntries.filter(e => e.date === d);
    const correct = dayTests.filter(e => e.result === 'correct').length;
    return `| ${d} | ${correct}/${dayTests.length} | ${Math.round((correct / dayTests.length) * 100)}% |`;
  });

  const md = `# Tutor Progress
**Updated:** ${today} (computed by /api/tutor/due)

## Level
B2 (Upper Intermediate)

## Accuracy
${accuracy || 'No data yet'}

## Status
- Active: ${active.length} items
- Mastered: ${mastered.length} items
- New (not yet introduced): ${newItems.length} items
- Due today: ${due.length} items

## Recent Tests
| Date | Score | % |
|------|-------|---|
${testScores.join('\n') || '| -- | -- | -- |'}

## Mastered Items
${mastered.map(s => `- ${s.item} (${s.type})`).join('\n') || 'None yet'}
`;

  try {
    fs.writeFileSync(PROGRESS_FILE, md);
  } catch (err) {
    console.error('[tutor/due] Failed to write progress:', err);
  }
}

// ── Route ──

export async function GET() {
  const today = new Date().toISOString().split('T')[0];
  const entries = readLog();

  // Parse curriculum
  let curriculumItems: Array<{ item: string; type: string; set?: string }> = [];
  try {
    if (fs.existsSync(CURRICULUM_FILE)) {
      const content = fs.readFileSync(CURRICULUM_FILE, 'utf-8');
      curriculumItems = parseCurriculumItems(content);
    }
  } catch {}

  const stats = computeStats(entries, curriculumItems);

  // Categorize
  const due: Record<string, string[]> = { vocab: [], grammar: [], writing: [] };
  const newItems: Record<string, string[]> = { vocab: [], grammar: [], writing: [] };
  const mastered: Record<string, string[]> = { vocab: [], grammar: [], writing: [] };
  const streaks: Record<string, number> = {};

  for (const s of stats) {
    streaks[`${s.type}:${s.item}`] = s.streak;
    if (s.status === 'mastered') {
      (mastered[s.type] ||= []).push(s.item);
    } else if (s.status === 'new') {
      (newItems[s.type] ||= []).push(s.item);
    } else if (s.nextDue <= today) {
      (due[s.type] ||= []).push(s.item);
    }
  }

  // Recent errors (last 7 days)
  const weekAgo = addDays(today, -7);
  const recentErrors = entries
    .filter(e => e.date >= weekAgo && e.result !== 'correct')
    .slice(-10)
    .map(e => ({ item: e.item, note: e.note || e.result, date: e.date }));

  // Accuracy by type
  const accuracy: Record<string, number> = {};
  const byType: Record<string, { correct: number; total: number }> = {};
  for (const e of entries) {
    if (!byType[e.type]) byType[e.type] = { correct: 0, total: 0 };
    byType[e.type].total++;
    if (e.result === 'correct') byType[e.type].correct++;
  }
  for (const [type, { correct, total }] of Object.entries(byType)) {
    accuracy[type] = Math.round((correct / total) * 100) / 100;
  }

  // Test due?
  const testEntries = entries.filter(e => e.source === 'test');
  const testDates = testEntries.map(e => e.date).sort();
  const lastTestDate = testDates.length > 0 ? testDates[testDates.length - 1] : '';

  // Rewrite progress summary
  writeProgressSummary(stats, entries);

  return NextResponse.json({
    ok: true,
    data: {
      level: 'B2',
      accuracy,
      due,
      new: newItems,
      mastered,
      recentErrors,
      lastTestDate,
      streaks,
      stats: {
        activeCount: stats.filter(s => s.status === 'active').length,
        masteredCount: stats.filter(s => s.status === 'mastered').length,
        newCount: stats.filter(s => s.status === 'new').length,
        dueCount: Object.values(due).reduce((sum, arr) => sum + arr.length, 0),
      },
    },
  });
}
