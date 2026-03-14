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

async function fetchEventsInRange(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
  const calList = await calFetch('/users/me/calendarList');
  const calendars: { id: string }[] = calList.items || [];
  const allEvents: CalendarEvent[] = [];
  await Promise.all(
    calendars.map(async (cal) => {
      try {
        const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime' });
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
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return fetchEventsInRange(timeMin, timeMax);
}

export async function getWeekEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString();
  return fetchEventsInRange(timeMin, timeMax);
}

/** Events for Mon–Sun of the current week (offset 0) or another week */
export async function getFullWeekEvents(weekOffset = 0): Promise<CalendarEvent[]> {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + weekOffset * 7);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  return fetchEventsInRange(monday.toISOString(), sunday.toISOString());
}

/** Events for an entire calendar month (month is 0-indexed) */
export async function getMonthEvents(year: number, month: number): Promise<CalendarEvent[]> {
  const timeMin = new Date(year, month, 1).toISOString();
  const timeMax = new Date(year, month + 1, 1).toISOString();
  return fetchEventsInRange(timeMin, timeMax);
}
