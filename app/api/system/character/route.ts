export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { getCharacters, clearCharacterCache } from '@/lib/characters';
import { clearRoutingCache } from '@/lib/tana';
import { CHARACTERS_DIR } from '@/lib/config';
import { SCHEDULE_JOBS } from '@/lib/scheduler';

const CHARS_DIR = CHARACTERS_DIR;
const SAFE = /^[a-z0-9-]+$/;

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get('name');
  if (!name || !SAFE.test(name)) return Response.json({ error: 'Invalid name' }, { status: 400 });
  const chars = getCharacters();
  const char = chars[name];
  if (!char) return Response.json({ error: 'Not found' }, { status: 404 });

  // Merge config-level schedules into character data
  const charScheds = char.schedules || [];
  const charSchedIds = new Set(charScheds.map(s => s.id));
  const configJobs = SCHEDULE_JOBS
    .filter(j => j.charName === name && !charSchedIds.has(j.id))
    .map(j => ({ id: j.id, displayName: j.displayName, seedPrompt: j.seedPrompt, cron: j.cron, label: j.label, enabled: j.enabled }));

  return Response.json({ character: { ...char, schedules: [...charScheds, ...configJobs] } });
}

export async function PUT(req: Request) {
  const name = new URL(req.url).searchParams.get('name');
  if (!name || !SAFE.test(name)) return Response.json({ error: 'Invalid name' }, { status: 400 });
  const chars = getCharacters();
  const char = chars[name];
  if (!char) return Response.json({ error: 'Not found' }, { status: 404 });

  const updates = await req.json() as Record<string, unknown>;
  const allowed = ['skills', 'routingKeywords', 'sharedKnowledge', 'modifiers', 'schedules'];
  const filtered: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }
  if (Object.keys(filtered).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const configPath = path.join(CHARS_DIR, char.tier, name + '.json');
  try {
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const merged = { ...existing, ...filtered };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    clearCharacterCache();
    clearRoutingCache();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
