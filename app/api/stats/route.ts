export const runtime = 'nodejs';

import fs from 'fs';
import { join } from 'path';
import { HOME } from '@/lib/config';

const LOG_PATH = join(HOME, '.claude/logs/tiny-log.jsonl');

export async function GET() {
  try {
    let lines: string[] = [];
    try {
      const raw = fs.readFileSync(LOG_PATH, 'utf-8');
      lines = raw.split('\n').filter(Boolean);
    } catch {
      // Log file may not exist yet
    }

    const entries = lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const weekEntries = entries.filter(e => {
      const ts = new Date(e.ts || e.timestamp).getTime();
      return ts >= weekAgo;
    });

    // Skill invocations
    const skillCounts: Record<string, number> = {};
    for (const e of weekEntries) {
      if (e.action === 'skill-invoked') {
        skillCounts[e.detail] = (skillCounts[e.detail] || 0) + 1;
      }
    }

    // Actions per character
    const charActions: Record<string, number> = {};
    for (const e of weekEntries) {
      const char = e.char || e.character;
      if (char) charActions[char] = (charActions[char] || 0) + 1;
    }

    // Routing signals
    const stops = weekEntries.filter(e => e.action === 'stop').length;
    const sendToPostman = weekEntries.filter(e => e.action === 'send-to-postman').length;
    const totalRouted = weekEntries.filter(e =>
      e.action?.startsWith('trigger:') || e.action === 'action'
    ).length;

    return Response.json({
      skillCounts,
      charActions,
      routingAccuracy: totalRouted > 0
        ? Math.round(((totalRouted - sendToPostman) / totalRouted) * 100)
        : 100,
      stops,
      sendToPostman,
      totalActions: weekEntries.length,
      period: {
        from: new Date(weekAgo).toISOString(),
        to: new Date().toISOString(),
      },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
