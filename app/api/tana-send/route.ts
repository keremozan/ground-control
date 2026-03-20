export const runtime = 'nodejs';
import { sendToTanaToday } from '@/lib/tana';
import { apiOk, apiError, requireFields } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

export async function POST(req: Request) {
  try {
    const body = await req.json() as { title: string; content: string };
    const missing = requireFields(body, ['title', 'content']);
    if (missing) return apiError(400, missing);
    await sendToTanaToday(body.title, body.content);
    return apiOk();
  } catch (e) {
    captureError('tana-send', e);
    return apiError(500, String(e));
  }
}
