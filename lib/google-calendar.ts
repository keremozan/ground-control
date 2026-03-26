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

export async function fetchEventsInRange(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
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

// ── Conflict Detection & Free Time ───────────────

/** Check if two time ranges overlap */
export function timeOverlaps(
  aStart: string, aEnd: string,
  bStart: string, bEnd: string,
): boolean {
  const a0 = new Date(aStart).getTime();
  const a1 = new Date(aEnd).getTime();
  const b0 = new Date(bStart).getTime();
  const b1 = new Date(bEnd).getTime();
  return a0 < b1 && b0 < a1;
}

/** Find calendar events that conflict with a proposed time range */
export async function findConflicts(
  start: string,
  end: string,
): Promise<CalendarEvent[]> {
  // Fetch events spanning the proposed range (with 1-day buffer on each side)
  const bufferMs = 24 * 60 * 60 * 1000;
  const rangeMin = new Date(new Date(start).getTime() - bufferMs).toISOString();
  const rangeMax = new Date(new Date(end).getTime() + bufferMs).toISOString();
  const events = await fetchEventsInRange(rangeMin, rangeMax);
  return events.filter(e => !e.allDay && timeOverlaps(e.start, e.end, start, end));
}

/** Find free slots on a given date (ISO date string YYYY-MM-DD) */
export async function findFreeSlots(
  date: string,
  minDurationMinutes = 60,
  dayStartHour = 9,
  dayEndHour = 20,
): Promise<{ start: string; end: string }[]> {
  const tz = '+03:00'; // Istanbul
  const dayStart = new Date(`${date}T${String(dayStartHour).padStart(2, '0')}:00:00${tz}`);
  const dayEnd = new Date(`${date}T${String(dayEndHour).padStart(2, '0')}:00:00${tz}`);

  const timeMin = new Date(dayStart.getTime() - 60 * 60 * 1000).toISOString();
  const timeMax = new Date(dayEnd.getTime() + 60 * 60 * 1000).toISOString();
  const events = await fetchEventsInRange(timeMin, timeMax);

  const sorted = events
    .filter(e => !e.allDay && e.start && e.end)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const slots: { start: string; end: string }[] = [];
  let cursor = dayStart.getTime();
  const minMs = minDurationMinutes * 60 * 1000;

  for (const event of sorted) {
    const eventStart = new Date(event.start).getTime();
    const eventEnd = new Date(event.end).getTime();

    if (eventStart > cursor && eventStart - cursor >= minMs) {
      slots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(eventStart).toISOString(),
      });
    }
    cursor = Math.max(cursor, eventEnd);
  }

  if (dayEnd.getTime() - cursor >= minMs) {
    slots.push({
      start: new Date(cursor).toISOString(),
      end: dayEnd.toISOString(),
    });
  }

  return slots;
}

/** Events for an entire calendar month (month is 0-indexed) */
export async function getMonthEvents(year: number, month: number): Promise<CalendarEvent[]> {
  const timeMin = new Date(year, month, 1).toISOString();
  const timeMax = new Date(year, month + 1, 1).toISOString();
  return fetchEventsInRange(timeMin, timeMax);
}
