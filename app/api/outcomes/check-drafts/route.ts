export const runtime = 'nodejs';
import { checkDraftOutcomes } from '@/lib/draft-checker';
import { apiOk, apiError } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

/** GET: cron-triggered draft outcome check (every 2 hours) */
export async function GET() {
  try {
    const result = await checkDraftOutcomes();
    return apiOk(result);
  } catch (err) {
    captureError('outcomes/check-drafts', err);
    return apiError(500, String(err));
  }
}
