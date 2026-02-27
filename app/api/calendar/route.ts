export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { getTodayEvents, getWeekEvents } from '@/lib/google-calendar';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const range = searchParams.get('range') || 'today';

  try {
    const events = range === 'week' ? await getWeekEvents() : await getTodayEvents();
    return Response.json({ events });
  } catch (e) {
    return Response.json({ error: String(e), events: [] }, { status: 500 });
  }
}
