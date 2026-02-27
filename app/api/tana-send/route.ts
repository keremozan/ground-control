export const runtime = 'nodejs';
import { sendToTanaToday } from '@/lib/tana';

export async function POST(req: Request) {
  const { title, content } = await req.json() as { title: string; content: string };
  if (!title || !content) {
    return Response.json({ error: 'title and content required' }, { status: 400 });
  }
  try {
    await sendToTanaToday(title, content);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
