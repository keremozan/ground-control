export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { getCharacters } from '@/lib/characters';
import { SKILLS_DIR, SHARED_DIR, CHARACTERS_DIR } from '@/lib/config';

const SAFE = /^[a-z0-9-]+$/;

export async function GET(req: Request) {
  const charName = new URL(req.url).searchParams.get('char');
  if (!charName || !SAFE.test(charName)) {
    return Response.json({ error: 'Invalid character name' }, { status: 400 });
  }

  const chars = getCharacters();
  const char = chars[charName];
  if (!char) return Response.json({ error: 'Not found' }, { status: 404 });

  // Check which skill files actually exist
  const skills = (char.skills || []).map((name: string) => ({
    name,
    exists: fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md')),
  }));

  // Check which knowledge files actually exist
  const knowledge = (char.sharedKnowledge || []).map((name: string) => ({
    name,
    exists: fs.existsSync(path.join(SHARED_DIR, name + '.md')),
  }));

  // Check memory file
  const memoryFile = (char as Record<string, unknown>).memoryFile as string || `${charName}.memory.md`;
  const memoryExists = fs.existsSync(path.join(CHARACTERS_DIR, char.tier, memoryFile));

  return Response.json({
    status: { skills, knowledge, memoryExists },
  });
}
