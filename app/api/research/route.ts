export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { startResearch, listResearch, pollAllResearch } from '@/lib/deep-research';
import { apiOk, apiError, requireFields } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

// GET: List all research tasks + poll running ones for updates
export async function GET() {
  const completed = await pollAllResearch();
  const tasks = listResearch();
  return apiOk({ tasks, newlyCompleted: completed.length });
}

// POST: Start a new deep research task
export async function POST(req: Request) {
  try {
    const body = await req.json() as { query: string; requestedBy?: string };
    const missing = requireFields(body, ['query']);
    if (missing) return apiError(400, missing);

    const task = await startResearch({
      query: body.query,
      requestedBy: body.requestedBy || 'scholar',
    });
    return apiOk({ task });
  } catch (err) {
    captureError('research/POST', err);
    return apiError(500, String(err));
  }
}
