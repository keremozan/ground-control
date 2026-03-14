export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { getTodayEvents, getWeekEvents, getFullWeekEvents, getMonthEvents } from '@/lib/google-calendar';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const range = searchParams.get('range') || 'today';

  try {
    let events;
    if (range === 'week') {
      events = await getWeekEvents();
    } else if (range === 'full-week') {
      const offset = parseInt(searchParams.get('offset') || '0');
      events = await getFullWeekEvents(offset);
    } else if (range === 'month') {
      const now = new Date();
      const year = parseInt(searchParams.get('year') || String(now.getFullYear()));
      const month = parseInt(searchParams.get('month') || String(now.getMonth()));
      events = await getMonthEvents(year, month);
    } else {
      events = await getTodayEvents();
    }
    return Response.json({ events });
  } catch (e) {
    return Response.json({ error: String(e), events: [] }, { status: 500 });
  }
}
