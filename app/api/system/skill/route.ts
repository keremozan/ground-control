export const runtime = 'nodejs';
import { readSkill, writeSkill } from '@/lib/skills';

const SAFE = /^[a-z0-9-]+$/;

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get('name');
  if (!name || !SAFE.test(name)) return Response.json({ error: 'Invalid skill name' }, { status: 400 });
  const content = readSkill(name);
  if (content === null) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ content });
}

export async function PUT(req: Request) {
  const name = new URL(req.url).searchParams.get('name');
  if (!name || !SAFE.test(name)) return Response.json({ error: 'Invalid skill name' }, { status: 400 });
  const { content } = await req.json() as { content: string };
  if (typeof content !== 'string') return Response.json({ error: 'Missing content' }, { status: 400 });
  try {
    writeSkill(name, content);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
