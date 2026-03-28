import { apiOk, apiError } from '@/lib/api-helpers';
import { getTodayEvents, getFullWeekEvents, getMonthEvents, CalendarEvent } from '@/lib/google-calendar';
import { CALENDAR_CATEGORY_MAPPING } from '@/lib/config';
import { JOB_RESULTS_PATH } from '@/lib/config';
import { charColor } from '@/lib/char-icons';
import fs from 'fs/promises';

// ── Types ─────────────────────────────────────────

interface CategoryHours {
  [category: string]: number;
}

interface CrewEntry {
  name: string;
  color: string;
  totalMs: number;
  sessions: number;
}

interface Alert {
  level: 'red' | 'orange' | 'green';
  text: string;
  detail: string;
}

// Google Calendar event color palette (fixed by Google)
const GCAL_COLORS: Record<string, string> = {
  '1':  '#7986cb', // Lavender
  '2':  '#33b679', // Sage
  '3':  '#8e24aa', // Grape
  '4':  '#e67c73', // Flamingo
  '5':  '#f6bf26', // Banana
  '6':  '#f4511e', // Tangerine
  '7':  '#039be5', // Peacock
  '8':  '#616161', // Graphite
  '9':  '#3f51b5', // Blueberry
  '10': '#0b8043', // Basil
  '11': '#d50000', // Tomato
};

// ── Helpers ───────────────────────────────────────

function eventHours(ev: CalendarEvent, now: Date): number {
  if (ev.allDay) return 0;
  const start = new Date(ev.start).getTime();
  const end = Math.min(new Date(ev.end).getTime(), now.getTime());
  if (end <= start) return 0;
  return (end - start) / (1000 * 60 * 60);
}

function classifyEvent(ev: CalendarEvent): { category: string; color: string } | null {
  if (ev.allDay || !ev.colorId) return null;
  const label = CALENDAR_CATEGORY_MAPPING[ev.colorId];
  if (!label) return null;
  return { category: label, color: GCAL_COLORS[ev.colorId] || '#6b7280' };
}

function computeCategories(events: CalendarEvent[], now: Date): {
  hours: CategoryHours;
  colors: Record<string, string>;
} {
  const hours: CategoryHours = {};
  const colors: Record<string, string> = {};

  for (const ev of events) {
    const cls = classifyEvent(ev);
    if (!cls) continue;
    const h = eventHours(ev, now);
    if (h <= 0) continue;
    hours[cls.category] = (hours[cls.category] || 0) + h;
    colors[cls.category] = cls.color;
  }

  // Round to 1 decimal
  for (const key of Object.keys(hours)) {
    hours[key] = Math.round(hours[key] * 10) / 10;
  }

  return { hours, colors };
}

function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return [];
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    if (intervals[i][0] <= last[1]) {
      last[1] = Math.max(last[1], intervals[i][1]);
    } else {
      merged.push(intervals[i]);
    }
  }
  return merged;
}

function computeCalendarDensity(todayEvents: CalendarEvent[]): { bookedHours: number; freeHours: number } {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0);
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0);
  const totalHours = 12;

  const intervals: [number, number][] = [];
  for (const ev of todayEvents) {
    if (ev.allDay) continue;
    const start = Math.max(new Date(ev.start).getTime(), dayStart.getTime());
    const end = Math.min(new Date(ev.end).getTime(), dayEnd.getTime());
    if (end > start) intervals.push([start, end]);
  }

  const merged = mergeIntervals(intervals);
  const bookedMs = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
  const bookedHours = Math.round((bookedMs / (1000 * 60 * 60)) * 10) / 10;
  return { bookedHours, freeHours: Math.round((totalHours - bookedHours) * 10) / 10 };
}

async function getCrewThisWeek(): Promise<CrewEntry[]> {
  let results: { charName: string; durationMs: number; timestamp: string }[] = [];
  try {
    const raw = await fs.readFile(JOB_RESULTS_PATH, 'utf-8');
    results = JSON.parse(raw);
  } catch {
    return [];
  }

  const now = new Date();
  const dow = now.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);

  const weekResults = results.filter(r => {
    const t = new Date(r.timestamp);
    return t >= monday && t < sunday;
  });

  const byChar: Record<string, { totalMs: number; sessions: number }> = {};
  for (const r of weekResults) {
    const name = r.charName;
    if (!byChar[name]) byChar[name] = { totalMs: 0, sessions: 0 };
    byChar[name].totalMs += r.durationMs;
    byChar[name].sessions += 1;
  }

  return Object.entries(byChar)
    .map(([name, data]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      color: charColor[name] || '#6b7280',
      totalMs: data.totalMs,
      sessions: data.sessions,
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

function computeAlerts(
  weekHours: CategoryHours,
  weekEvents: CalendarEvent[],
): Alert[] {
  const alerts: Alert[] = [];

  const now = new Date();
  const dow = now.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);

  // All mapped categories
  const categories = [...new Set(Object.values(CALENDAR_CATEGORY_MAPPING))];
  const daysElapsed = Math.min(7, Math.floor((now.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  // Build day-by-category presence map
  const dayPresence: Record<string, boolean[]> = {};
  for (const cat of categories) dayPresence[cat] = [];

  for (let d = 0; d < daysElapsed; d++) {
    const dayStart = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + d);
    const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);

    for (const cat of categories) {
      const hasActivity = weekEvents.some(ev => {
        const cls = classifyEvent(ev);
        if (!cls || cls.category !== cat) return false;
        const evStart = new Date(ev.start);
        return evStart >= dayStart && evStart < dayEnd;
      });
      dayPresence[cat].push(hasActivity);
    }
  }

  // Streak alerts: 4+ consecutive days
  for (const [cat, days] of Object.entries(dayPresence)) {
    let streak = 0;
    for (const active of days) {
      if (active) streak++;
      else streak = 0;
    }
    if (streak >= 4) {
      const avgHours = (weekHours[cat] || 0) / daysElapsed;
      alerts.push({
        level: 'green',
        text: `${cat} streak: ${streak} consecutive days`,
        detail: `Averaging ${avgHours.toFixed(1)}h/day`,
      });
    }
  }

  // Gap alerts: category with 0 hours after 3+ days into the week
  for (const cat of categories) {
    if (cat === 'free time' || cat === 'chores' || cat === 'travel' || cat === 'social') continue;
    if ((weekHours[cat] || 0) === 0 && daysElapsed >= 3) {
      alerts.push({
        level: 'red',
        text: `No ${cat} sessions this week`,
        detail: `${daysElapsed} days into the week`,
      });
    }
  }

  // Drop alerts: active early but silent for 3+ days
  for (const [cat, days] of Object.entries(dayPresence)) {
    if (days.length < 5) continue;
    const earlyActive = days.slice(0, 2).some(Boolean);
    const recentInactive = days.slice(-3).every(d => !d);
    if (earlyActive && recentInactive) {
      alerts.push({
        level: 'orange',
        text: `${cat} dropped off mid-week`,
        detail: `Active early, nothing for 3+ days`,
      });
    }
  }

  return alerts;
}

// ── Route Handler ─────────────────────────────────

export async function GET() {
  try {
    const now = new Date();
    const [todayEvents, weekEvents, monthEvents, crew] = await Promise.all([
      getTodayEvents(),
      getFullWeekEvents(0),
      getMonthEvents(now.getFullYear(), now.getMonth()),
      getCrewThisWeek(),
    ]);

    const todayData = computeCategories(todayEvents, now);
    const weekData = computeCategories(weekEvents, now);
    const monthData = computeCategories(monthEvents, now);
    const density = computeCalendarDensity(todayEvents);
    const alerts = computeAlerts(weekData.hours, weekEvents);

    // Merge colors from all time ranges
    const colors = { ...monthData.colors, ...weekData.colors, ...todayData.colors };

    return apiOk({
      categories: {
        today: todayData.hours,
        week: weekData.hours,
        month: monthData.hours,
      },
      colors,
      crew,
      // TODO: wire to Kybernetes (plan completion) and Coach (energy) data via Tana
      dayPulse: {
        planTotal: null,
        planDone: null,
        energy: null,
      },
      density,
      alerts,
    });
  } catch (err) {
    return apiError(500, err instanceof Error ? err.message : 'Failed to compute pulse data');
  }
}
