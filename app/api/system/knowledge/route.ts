export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { clearSharedCache } from '@/lib/shared';
import { SHARED_DIR as SHARED_PATH } from '@/lib/config';

const SHARED_DIR = SHARED_PATH;
const SAFE = /^[a-z0-9-]+$/;

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key');
  if (!key || !SAFE.test(key)) return Response.json({ error: 'Invalid key' }, { status: 400 });
  const p = path.join(SHARED_DIR, key + '.md');
  try {
    const content = fs.readFileSync(p, 'utf-8');
    return Response.json({ content });
  } catch {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function PUT(req: Request) {
  const key = new URL(req.url).searchParams.get('key');
  if (!key || !SAFE.test(key)) return Response.json({ error: 'Invalid key' }, { status: 400 });
  const p = path.join(SHARED_DIR, key + '.md');
  if (!fs.existsSync(p)) return Response.json({ error: 'File not found' }, { status: 404 });
  const { content } = await req.json() as { content: string };
  if (typeof content !== 'string') return Response.json({ error: 'Missing content' }, { status: 400 });
  try {
    fs.writeFileSync(p, content, 'utf-8');
    clearSharedCache();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
