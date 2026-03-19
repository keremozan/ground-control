export const runtime = 'nodejs';
import { startResearch, listResearch, pollAllResearch } from '@/lib/deep-research';

// GET: List all research tasks + poll running ones for updates
export async function GET() {
  const completed = await pollAllResearch();
  const tasks = listResearch();
  return Response.json({ tasks, newlyCompleted: completed.length });
}

// POST: Start a new deep research task
export async function POST(req: Request) {
  const body = await req.json() as { query: string; requestedBy?: string };
  if (!body.query) {
    return Response.json({ error: 'query is required' }, { status: 400 });
  }

  try {
    const task = await startResearch({
      query: body.query,
      requestedBy: body.requestedBy || 'scholar',
    });
    return Response.json({ ok: true, task });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
