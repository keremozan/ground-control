export const runtime = 'nodejs';
import { checkRemainingPrepItems } from '@/lib/tana';

export async function POST(req: Request) {
  try {
    const { classNodeId } = await req.json();
    if (!classNodeId) return Response.json({ error: 'classNodeId required' }, { status: 400 });
    const checked = await checkRemainingPrepItems(classNodeId);
    return Response.json({ ok: true, checked });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
