export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { getClassNodes } from '@/lib/tana';
import { apiOk, apiError } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

export async function GET() {
  try {
    const classes = await getClassNodes();
    return apiOk({ classes });
  } catch (e) {
    captureError('class-prep', e);
    return apiError(500, String(e));
  }
}
