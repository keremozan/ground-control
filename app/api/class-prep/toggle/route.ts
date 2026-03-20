export const runtime = 'nodejs';
import { toggleClassItem } from '@/lib/tana';
import { apiOk, apiError } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.nodeId || typeof body.checked !== 'boolean') {
      return apiError(400, 'nodeId and checked required');
    }
    await toggleClassItem(body.nodeId, body.checked);
    return apiOk();
  } catch (e) {
    captureError('class-prep/toggle', e);
    return apiError(500, String(e));
  }
}
