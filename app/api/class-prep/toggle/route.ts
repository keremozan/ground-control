export const runtime = 'nodejs';
import { toggleClassItem } from '@/lib/tana';

export async function POST(req: Request) {
  try {
    const { nodeId, checked } = await req.json();
    if (!nodeId || typeof checked !== 'boolean') {
      return Response.json({ error: 'nodeId and checked required' }, { status: 400 });
    }
    await toggleClassItem(nodeId, checked);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
