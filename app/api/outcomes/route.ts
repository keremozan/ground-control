export const runtime = 'nodejs';
import { getOutcomes } from '@/lib/outcome-tracker';
import { getUsageSummary, recordUsage, type UsageEventType } from '@/lib/usage-analytics';
import { apiOk, apiError } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

/** GET: return outcome summary + usage analytics */
export async function GET() {
  try {
    const outcomes = getOutcomes({ limit: 50 });
    const usage = getUsageSummary();
    return apiOk({ outcomes, usage });
  } catch (err) {
    captureError('outcomes/get', err);
    return apiError(500, String(err));
  }
}

/** POST: record a usage event from the dashboard */
export async function POST(req: Request) {
  try {
    const body = await req.json() as { type: UsageEventType; character: string; details?: Record<string, unknown> };
    if (!body.type || !body.character) {
      return apiError(400, 'type and character required');
    }
    recordUsage({
      type: body.type,
      character: body.character,
      details: body.details,
    });
    return apiOk({ recorded: true });
  } catch (err) {
    captureError('outcomes/post', err);
    return apiError(400, String(err));
  }
}
