export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import fs from 'fs';
import path from 'path';
import { getCharacters, clearCharacterCache } from '@/lib/characters';
import { CHARACTERS_DIR } from '@/lib/config';
import { apiOk, apiError, validateName } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

const CHARS_DIR = CHARACTERS_DIR;

function memPath(charName: string): string | null {
  const chars = getCharacters();
  const char = chars[charName];
  if (!char) return null;
  return path.join(CHARS_DIR, char.tier, char.id + '.memory.md');
}

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get('char');
  const nameErr = validateName(name || '');
  if (!name || nameErr) return apiError(400, nameErr || 'Invalid character');
  const p = memPath(name);
  if (!p) return apiError(404, 'Character not found');
  try {
    const content = fs.readFileSync(p, 'utf-8');
    return apiOk({ content });
  } catch {
    return apiOk({ content: '' });
  }
}

export async function PUT(req: Request) {
  const name = new URL(req.url).searchParams.get('char');
  const nameErr = validateName(name || '');
  if (!name || nameErr) return apiError(400, nameErr || 'Invalid character');
  const p = memPath(name);
  if (!p) return apiError(404, 'Character not found');
  const { content } = await req.json() as { content: string };
  if (typeof content !== 'string') return apiError(400, 'Missing content');
  try {
    fs.writeFileSync(p, content, 'utf-8');
    clearCharacterCache();
    return apiOk();
  } catch (e) {
    captureError('system/memory/PUT', e);
    return apiError(500, String(e));
  }
}
