export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import fs from 'fs';
import path from 'path';
import { clearSharedCache } from '@/lib/shared';
import { SHARED_DIR as SHARED_PATH } from '@/lib/config';
import { apiOk, apiError, validateName } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

const SHARED_DIR = SHARED_PATH;

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key');
  const keyErr = validateName(key || '');
  if (!key || keyErr) return apiError(400, keyErr || 'Invalid key');
  const p = path.join(SHARED_DIR, key + '.md');
  try {
    const content = fs.readFileSync(p, 'utf-8');
    return apiOk({ content });
  } catch {
    return apiError(404, 'Not found');
  }
}

export async function PUT(req: Request) {
  const key = new URL(req.url).searchParams.get('key');
  const keyErr = validateName(key || '');
  if (!key || keyErr) return apiError(400, keyErr || 'Invalid key');
  const p = path.join(SHARED_DIR, key + '.md');
  if (!fs.existsSync(p)) return apiError(404, 'File not found');
  const { content } = await req.json() as { content: string };
  if (typeof content !== 'string') return apiError(400, 'Missing content');
  try {
    fs.writeFileSync(p, content, 'utf-8');
    clearSharedCache();
    return apiOk();
  } catch (e) {
    captureError('system/knowledge/PUT', e);
    return apiError(500, String(e));
  }
}
