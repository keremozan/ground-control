import { getCalendarToken } from './google-auth';

const CAL_API = 'https://www.googleapis.com/calendar/v3';

export type CalendarEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  allDay: boolean;
  calendarId: string;
  htmlLink?: string;
};

async function calFetch(path: string, opts?: RequestInit) {
  const token = await getCalendarToken();
  const res = await fetch(`${CAL_API}${path}`, {
    ...opts,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

/** Create a calendar event on the primary calendar */
export async function createCalendarEvent(data: {
  summary: string;
  start: string; // ISO datetime
  end: string;   // ISO datetime
}): Promise<{ id: string; htmlLink?: string }> {
  const result = await calFetch('/calendars/primary/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: data.summary,
      start: { dateTime: data.start },
      end: { dateTime: data.end },
    }),
  });
  return { id: result.id, htmlLink: result.htmlLink };
}

/** Delete a calendar event */
export async function deleteCalendarEvent(calendarId: string, eventId: string) {
  await calFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
}

export async function getTodayEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  // Get calendar list first
  const calList = await calFetch('/users/me/calendarList');
  const calendars: { id: string }[] = calList.items || [];

  // Fetch events from all calendars in parallel
  const allEvents: CalendarEvent[] = [];
  await Promise.all(
    calendars.map(async (cal) => {
      try {
        const params = new URLSearchParams({
          timeMin: startOfDay,
          timeMax: endOfDay,
          singleEvents: 'true',
          orderBy: 'startTime',
        });
        const data = await calFetch(`/calendars/${encodeURIComponent(cal.id)}/events?${params}`);
        for (const ev of data.items || []) {
          if (ev.status === 'cancelled') continue;
          const allDay = !!ev.start?.date;
          allEvents.push({
            id: ev.id,
            summary: ev.summary || '(no title)',
            start: ev.start?.dateTime || ev.start?.date || '',
            end: ev.end?.dateTime || ev.end?.date || '',
            location: ev.location,
            allDay,
            calendarId: cal.id,
            htmlLink: ev.htmlLink,
          });
        }
      } catch {}
    })
  );

  // Sort by start time
  allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return allEvents;
}

export async function getWeekEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString();

  const calList = await calFetch('/users/me/calendarList');
  const calendars: { id: string }[] = calList.items || [];

  const allEvents: CalendarEvent[] = [];
  await Promise.all(
    calendars.map(async (cal) => {
      try {
        const params = new URLSearchParams({
          timeMin: startOfDay,
          timeMax: endOfWeek,
          singleEvents: 'true',
          orderBy: 'startTime',
        });
        const data = await calFetch(`/calendars/${encodeURIComponent(cal.id)}/events?${params}`);
        for (const ev of data.items || []) {
          if (ev.status === 'cancelled') continue;
          const allDay = !!ev.start?.date;
          allEvents.push({
            id: ev.id,
            summary: ev.summary || '(no title)',
            start: ev.start?.dateTime || ev.start?.date || '',
            end: ev.end?.dateTime || ev.end?.date || '',
            location: ev.location,
            allDay,
            calendarId: cal.id,
            htmlLink: ev.htmlLink,
          });
        }
      } catch {}
    })
  );

  allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return allEvents;
}
