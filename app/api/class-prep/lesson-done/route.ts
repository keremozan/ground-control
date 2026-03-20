export const runtime = 'nodejs';
import { checkRemainingPrepItems } from '@/lib/tana';
import { apiOk, apiError, requireFields } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const missing = requireFields(body, ['classNodeId']);
    if (missing) return apiError(400, missing);
    const checked = await checkRemainingPrepItems(body.classNodeId);
    return apiOk({ checked });
  } catch (e) {
    captureError('class-prep/lesson-done', e);
    return apiError(500, String(e));
  }
}
