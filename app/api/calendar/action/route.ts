export const runtime = 'nodejs';
import { deleteCalendarEvent, createCalendarEvent } from '@/lib/google-calendar';
import { createTask } from '@/lib/tana';

export async function POST(req: Request) {
  const { action, eventId, calendarId, summary, start, end } = await req.json() as {
    action: string;
    eventId?: string;
    calendarId?: string;
    summary?: string;
    start?: string;
    end?: string;
  };

  // Create event — no eventId/calendarId needed
  if (action === 'create') {
    if (!summary?.trim() || !start || !end) {
      return Response.json({ error: 'summary, start, end required' }, { status: 400 });
    }
    try {
      const result = await createCalendarEvent({ summary: summary.trim(), start, end });
      return Response.json({ ok: true, eventId: result.id });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  if (!action || !eventId || !calendarId) {
    return Response.json({ error: 'action, eventId, calendarId required' }, { status: 400 });
  }

  try {
    if (action === 'delete') {
      await deleteCalendarEvent(calendarId, eventId);
      return Response.json({ ok: true, message: 'Deleted' });
    }

    if (action === 'task') {
      await createTask({
        title: summary || 'Calendar event',
        context: `Event: ${summary} | Start: ${start}`,
        priority: 'medium',
      });
      return Response.json({ ok: true, message: 'Task created' });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
