export const runtime = 'nodejs';
import { deleteCalendarEvent, createCalendarEvent } from '@/lib/google-calendar';
import { createTask } from '@/lib/tana';
import { apiOk, apiError } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

export async function POST(req: Request) {
  try {
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
        return apiError(400, 'summary, start, end required');
      }
      const result = await createCalendarEvent({ summary: summary.trim(), start, end });
      return apiOk({ eventId: result.id });
    }

    if (!action || !eventId || !calendarId) {
      return apiError(400, 'action, eventId, calendarId required');
    }

    if (action === 'delete') {
      await deleteCalendarEvent(calendarId, eventId);
      return apiOk({ message: 'Deleted' });
    }

    if (action === 'task') {
      await createTask({
        title: summary || 'Calendar event',
        context: `Event: ${summary} | Start: ${start}`,
        priority: 'medium',
      });
      return apiOk({ message: 'Task created' });
    }

    return apiError(400, `Unknown action: ${action}`);
  } catch (e) {
    captureError('calendar/action', e);
    return apiError(500, String(e));
  }
}
