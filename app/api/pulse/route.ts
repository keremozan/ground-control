import { apiOk, apiError } from '@/lib/api-helpers';
import { getTodayEvents, getFullWeekEvents, CalendarEvent } from '@/lib/google-calendar';
import { CALENDAR_SPHERE_MAPPING } from '@/lib/config';
import { JOB_RESULTS_PATH } from '@/lib/config';
import { charColor } from '@/lib/char-icons';
import fs from 'fs/promises';

// ── Types ─────────────────────────────────────────

type Sphere = 'research' | 'collegium' | 'practice' | 'life' | 'travel';

interface SphereHours {
  research: number;
  collegium: number;
  practice: number;
  life: number;
  travel: number;
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

// ── Helpers ───────────────────────────────────────

function eventHours(ev: CalendarEvent): number {
  if (ev.allDay) return 0;
  const ms = new Date(ev.end).getTime() - new Date(ev.start).getTime();
  return Math.max(0, ms / (1000 * 60 * 60));
}

function classifyEvent(ev: CalendarEvent): { label: string; sphere: Sphere } | null {
  if (ev.allDay) return null;
  const mapping = ev.colorId ? CALENDAR_SPHERE_MAPPING[ev.colorId] : null;
  if (!mapping) return null;
  return { label: mapping.label, sphere: mapping.sphere as Sphere };
}

function emptySphereHours(): SphereHours {
  return { research: 0, collegium: 0, practice: 0, life: 0, travel: 0 };
}

function computeSpheres(events: CalendarEvent[]): {
  hours: SphereHours;
  breakdown: Record<string, Record<string, number>>;
} {
  const hours = emptySphereHours();
  const breakdown: Record<string, Record<string, number>> = {};

  for (const ev of events) {
    const cls = classifyEvent(ev);
    if (!cls) continue;
    const h = eventHours(ev);
    hours[cls.sphere] += h;
    if (!breakdown[cls.sphere]) breakdown[cls.sphere] = {};
    breakdown[cls.sphere][cls.label] = (breakdown[cls.sphere][cls.label] || 0) + h;
  }

  // Round all values to 1 decimal
  for (const key of Object.keys(hours) as Sphere[]) {
    hours[key] = Math.round(hours[key] * 10) / 10;
  }
  for (const sphere of Object.values(breakdown)) {
    for (const label of Object.keys(sphere)) {
      sphere[label] = Math.round(sphere[label] * 10) / 10;
    }
  }

  return { hours, breakdown };
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
  let results: { charName: string; displayName: string; durationMs: number; timestamp: string }[] = [];
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
  weekSpheres: SphereHours,
  weekEvents: CalendarEvent[],
): Alert[] {
  const alerts: Alert[] = [];

  const now = new Date();
  const dow = now.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);

  // Build day-by-sphere presence map
  const dayPresence: Record<Sphere, boolean[]> = {
    research: [], collegium: [], practice: [], life: [], travel: [],
  };

  const daysElapsed = Math.min(7, Math.floor((now.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  for (let d = 0; d < daysElapsed; d++) {
    const dayStart = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + d);
    const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);

    for (const sphere of Object.keys(dayPresence) as Sphere[]) {
      const hasActivity = weekEvents.some(ev => {
        const cls = classifyEvent(ev);
        if (!cls || cls.sphere !== sphere) return false;
        const evStart = new Date(ev.start);
        return evStart >= dayStart && evStart < dayEnd;
      });
      dayPresence[sphere].push(hasActivity);
    }
  }

  // Streak alerts: 4+ consecutive days
  for (const [sphere, days] of Object.entries(dayPresence) as [Sphere, boolean[]][]) {
    let streak = 0;
    for (const active of days) {
      if (active) streak++;
      else streak = 0;
    }
    if (streak >= 4) {
      const sphereLabel = sphere.charAt(0).toUpperCase() + sphere.slice(1);
      const avgHours = weekSpheres[sphere] / daysElapsed;
      alerts.push({
        level: 'green',
        text: `${sphereLabel} streak: ${streak} consecutive days`,
        detail: `Averaging ${avgHours.toFixed(1)}h/day`,
      });
    }
  }

  // Gap alerts: sphere with 0 hours this week
  const mappedSpheres = new Set(
    Object.values(CALENDAR_SPHERE_MAPPING).map(m => m.sphere)
  );
  for (const sphere of ['research', 'collegium', 'practice'] as Sphere[]) {
    if (!mappedSpheres.has(sphere)) continue;
    if (weekSpheres[sphere] === 0 && daysElapsed >= 3) {
      const sphereLabel = sphere.charAt(0).toUpperCase() + sphere.slice(1);
      alerts.push({
        level: 'red',
        text: `No ${sphereLabel.toLowerCase()} sessions this week`,
        detail: `${daysElapsed} days into the week`,
      });
    }
  }

  // Drop alerts: active early but silent for 3+ days
  for (const [sphere, days] of Object.entries(dayPresence) as [Sphere, boolean[]][]) {
    if (days.length < 5) continue;
    const earlyActive = days.slice(0, 2).some(Boolean);
    const recentInactive = days.slice(-3).every(d => !d);
    if (earlyActive && recentInactive) {
      const sphereLabel = sphere.charAt(0).toUpperCase() + sphere.slice(1);
      alerts.push({
        level: 'orange',
        text: `${sphereLabel} dropped off mid-week`,
        detail: `Active early, nothing for 3+ days`,
      });
    }
  }

  return alerts;
}

// ── Route Handler ─────────────────────────────────

export async function GET() {
  try {
    const [todayEvents, weekEvents, crew] = await Promise.all([
      getTodayEvents(),
      getFullWeekEvents(0),
      getCrewThisWeek(),
    ]);

    const todaySpheres = computeSpheres(todayEvents);
    const weekSpheres = computeSpheres(weekEvents);
    const density = computeCalendarDensity(todayEvents);
    const alerts = computeAlerts(weekSpheres.hours, weekEvents);

    return apiOk({
      spheres: {
        today: todaySpheres.hours,
        week: weekSpheres.hours,
      },
      breakdown: weekSpheres.breakdown,
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
