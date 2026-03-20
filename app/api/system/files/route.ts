export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import fs from 'fs';
import path from 'path';
import { getCharacters } from '@/lib/characters';
import { SKILLS_DIR, SHARED_DIR, CHARACTERS_DIR } from '@/lib/config';
import { apiOk, apiError, validateName } from '@/lib/api-helpers';

export async function GET(req: Request) {
  const charName = new URL(req.url).searchParams.get('char');
  const nameErr = validateName(charName || '');
  if (!charName || nameErr) return apiError(400, nameErr || 'Invalid character name');

  const chars = getCharacters();
  const char = chars[charName];
  if (!char) return apiError(404, 'Not found');

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
  const memoryFile = char.memoryFile || `${charName}.memory.md`;
  const memoryExists = fs.existsSync(path.join(CHARACTERS_DIR, char.tier, memoryFile));

  return apiOk({
    status: { skills, knowledge, memoryExists },
  });
}
