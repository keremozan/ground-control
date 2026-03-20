export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { readSkill, writeSkill } from '@/lib/skills';
import { apiOk, apiError, validateName } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get('name');
  const nameErr = validateName(name || '');
  if (!name || nameErr) return apiError(400, nameErr || 'Invalid skill name');
  const content = readSkill(name);
  if (content === null) return apiError(404, 'Not found');
  return apiOk({ content });
}

export async function PUT(req: Request) {
  const name = new URL(req.url).searchParams.get('name');
  const nameErr = validateName(name || '');
  if (!name || nameErr) return apiError(400, nameErr || 'Invalid skill name');
  const { content } = await req.json() as { content: string };
  if (typeof content !== 'string') return apiError(400, 'Missing content');
  try {
    writeSkill(name, content);
    return apiOk();
  } catch (e) {
    captureError('system/skill/PUT', e);
    return apiError(500, String(e));
  }
}
