import crypto from 'crypto';
import { getOutcomes, type OutcomeEvent } from './outcome-tracker';
import { spawnOnce } from './spawn';
import fs from 'fs';
import path from 'path';
import { CHARACTERS_DIR } from './config';

export type Pattern = {
  type: 'repeated-negative' | 'repeated-positive' | 'recipient-divergence' | 'engagement-drop';
  count: number;
  summary: string;
  details?: Record<string, unknown>;
};

export function groupByCharacter(events: OutcomeEvent[]): Record<string, OutcomeEvent[]> {
  const groups: Record<string, OutcomeEvent[]> = {};
  for (const e of events) {
    (groups[e.character] ||= []).push(e);
  }
  return groups;
}

export function detectPatterns(events: OutcomeEvent[]): Pattern[] {
  const patterns: Pattern[] = [];
  const negatives = events.filter(e => e.outcome === 'negative' || e.outcome === 'strong-negative');
  const positives = events.filter(e => e.outcome === 'positive');
  const total = events.length;

  if (negatives.length >= 3) {
    patterns.push({
      type: 'repeated-negative',
      count: negatives.length,
      summary: `${negatives.length} of ${total} outcomes were negative`,
      details: { negativeRate: Math.round((negatives.length / total) * 100) },
    });
  }

  if (positives.length >= 5 && positives.length / total > 0.7) {
    patterns.push({
      type: 'repeated-positive',
      count: positives.length,
      summary: `${positives.length} of ${total} outcomes were positive`,
    });
  }

  const draftEvents = events.filter(e => e.signalType === 'draft-outcome');
  const byRecipient: Record<string, OutcomeEvent[]> = {};
  for (const e of draftEvents) {
    const r = (e.details.recipient as string) || 'unknown';
    (byRecipient[r] ||= []).push(e);
  }
  for (const [recipient, rEvents] of Object.entries(byRecipient)) {
    const rNeg = rEvents.filter(e => e.outcome === 'negative' || e.outcome === 'strong-negative');
    if (rNeg.length >= 2 && rNeg.length / rEvents.length > 0.5) {
      patterns.push({
        type: 'recipient-divergence',
        count: rNeg.length,
        summary: `${rNeg.length} of ${rEvents.length} drafts to ${recipient} were edited/deleted`,
        details: { recipient },
      });
    }
  }

  return patterns;
}

export function buildLessonPrompt(character: string, patterns: Pattern[]): string {
  const patternText = patterns.map(p =>
    `- ${p.type}: ${p.summary}${p.details ? ` (${JSON.stringify(p.details)})` : ''}`
  ).join('\n');

  return `You are analyzing behavioral patterns for the "${character}" character in an agent system.

Based on these observed patterns from the last 2 weeks:
${patternText}

Write 1-3 concise behavioral lessons for the character's memory file. Each lesson should:
- Start with [+] for positive reinforcement or [-] for corrections
- Include today's date (${new Date().toISOString().split('T')[0]})
- Be actionable and specific (not generic advice)
- Be under 120 characters

Example format:
[-] 2026-03-24: Drafts to gallery contacts get heavily edited. Use less formal tone for art world emails.
[+] 2026-03-24: University admin drafts sent as-is. Current formal tone works for institutional emails.

Output only the lesson lines, nothing else.`;
}

function lessonHash(line: string): string {
  const normalized = line.replace(/^\[.\]\s*\d{4}-\d{2}-\d{2}:\s*/, '').trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

export async function extractLessons(character: string): Promise<string[]> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const allEvents = getOutcomes({ character });
  const recentEvents = allEvents.filter(e => e.timestamp > cutoff);

  if (recentEvents.length < 3) return [];

  const patterns = detectPatterns(recentEvents);
  if (patterns.length === 0) return [];

  const prompt = buildLessonPrompt(character, patterns);
  const rawLessons = await spawnOnce({ prompt, model: 'sonnet' });

  const lessons = rawLessons
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('[+]') || l.startsWith('[-]') || l.startsWith('[!]'));

  if (lessons.length === 0) return [];

  const memoryPath = findMemoryPath(character);
  if (!memoryPath) return [];

  let existing = '';
  try { existing = fs.readFileSync(memoryPath, 'utf-8'); } catch {}

  const existingHashes = new Set(
    existing.split('\n')
      .filter(l => l.startsWith('['))
      .map(l => lessonHash(l))
  );
  const newLessons = lessons.filter(l => !existingHashes.has(lessonHash(l)));

  if (newLessons.length === 0) return [];

  const lines = existing.split('\n').filter(l => l.trim());
  const autoHeader = '# Self-learning (auto-generated)';
  if (!lines.includes(autoHeader)) lines.push('', autoHeader);
  lines.push(...newLessons);

  if (lines.length > 100) {
    const autoIdx = lines.indexOf(autoHeader);
    if (autoIdx >= 0) {
      const manualLines = lines.slice(0, autoIdx);
      const autoLines = lines.slice(autoIdx);
      const budget = 100 - manualLines.length;
      const trimmed = [...manualLines, ...autoLines.slice(-budget)];
      fs.writeFileSync(memoryPath, trimmed.join('\n') + '\n');
    }
  } else {
    fs.writeFileSync(memoryPath, lines.join('\n') + '\n');
  }

  return newLessons;
}

function findMemoryPath(character: string): string | null {
  for (const tier of ['core', 'meta', 'stationed']) {
    const memPath = path.join(CHARACTERS_DIR, tier, `${character}.memory.md`);
    if (fs.existsSync(memPath)) return memPath;
    const configPath = path.join(CHARACTERS_DIR, tier, `${character}.json`);
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.memoryFile) {
        const customPath = path.join(CHARACTERS_DIR, tier, config.memoryFile);
        if (fs.existsSync(customPath)) return customPath;
      }
    } catch {}
  }
  return null;
}

export async function extractAllLessons(): Promise<Record<string, string[]>> {
  const allEvents = getOutcomes();
  const grouped = groupByCharacter(allEvents);
  const results: Record<string, string[]> = {};

  for (const character of Object.keys(grouped)) {
    try {
      const lessons = await extractLessons(character);
      if (lessons.length > 0) results[character] = lessons;
    } catch {}
  }

  return results;
}
