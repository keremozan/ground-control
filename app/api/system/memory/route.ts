export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { getCharacters, clearCharacterCache } from '@/lib/characters';
import { CHARACTERS_DIR } from '@/lib/config';

const CHARS_DIR = CHARACTERS_DIR;
const SAFE = /^[a-z0-9-]+$/;

function memPath(charName: string): string | null {
  const chars = getCharacters();
  const char = chars[charName];
  if (!char) return null;
  return path.join(CHARS_DIR, char.tier, char.id + '.memory.md');
}

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get('char');
  if (!name || !SAFE.test(name)) return Response.json({ error: 'Invalid character' }, { status: 400 });
  const p = memPath(name);
  if (!p) return Response.json({ error: 'Character not found' }, { status: 404 });
  try {
    const content = fs.readFileSync(p, 'utf-8');
    return Response.json({ content });
  } catch {
    return Response.json({ content: '' });
  }
}

export async function PUT(req: Request) {
  const name = new URL(req.url).searchParams.get('char');
  if (!name || !SAFE.test(name)) return Response.json({ error: 'Invalid character' }, { status: 400 });
  const p = memPath(name);
  if (!p) return Response.json({ error: 'Character not found' }, { status: 404 });
  const { content } = await req.json() as { content: string };
  if (typeof content !== 'string') return Response.json({ error: 'Missing content' }, { status: 400 });
  try {
    fs.writeFileSync(p, content, 'utf-8');
    clearCharacterCache();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
