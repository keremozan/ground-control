import { Sun, Moon, Sunrise, Sunset } from "lucide-react";
import { formatDisplayDateWithDay, formatTime as fmtTime } from "@/lib/date-format";
import type { CalEvent } from "@/types";

// ── Constants ────────────────────────────────────────────────────────────────

export const HOUR_HEIGHT = 36;
export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Types ────────────────────────────────────────────────────────────────────

export type PositionedEvent = CalEvent & {
  col: number;
  totalCols: number;
  topPx: number;
  heightPx: number;
};

// ── Pure functions ───────────────────────────────────────────────────────────

export function timeOfDayIcon(iso: string, allDay: boolean) {
  if (allDay) return { Icon: Sun, color: "var(--amber)" };
  const h = new Date(iso).getHours();
  if (h < 7) return { Icon: Moon, color: "var(--indigo)" };
  if (h < 10) return { Icon: Sunrise, color: "var(--orange)" };
  if (h < 17) return { Icon: Sun, color: "var(--amber)" };
  if (h < 20) return { Icon: Sunset, color: "var(--orange)" };
  return { Icon: Moon, color: "var(--indigo)" };
}

export function formatTime(iso: string, allDay: boolean): string {
  if (allDay) return "all day";
  try { return fmtTime(iso); } catch { return ""; }
}

export function formatDate(iso: string): string {
  try { return formatDisplayDateWithDay(iso); } catch { return ""; }
}

export function isPast(event: CalEvent): boolean {
  if (event.allDay) return false;
  try { return new Date(event.end) < new Date(); } catch { return false; }
}

export function isCurrent(event: CalEvent): boolean {
  if (event.allDay) return false;
  try {
    const now = new Date();
    return new Date(event.start) <= now && new Date(event.end) > now;
  } catch { return false; }
}

export function sameDay(iso: string, date: Date): boolean {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.getFullYear() === date.getFullYear() &&
    d.getMonth() === date.getMonth() &&
    d.getDate() === date.getDate();
}

export function layoutDayEvents(dayEvents: CalEvent[], minHour: number): PositionedEvent[] {
  const timed = dayEvents
    .filter(e => !e.allDay)
    .map(e => {
      const s = new Date(e.start);
      const en = new Date(e.end);
      const startMin = (s.getHours() - minHour) * 60 + s.getMinutes();
      const endMin = (en.getHours() - minHour) * 60 + en.getMinutes();
      const cStart = Math.max(startMin, 0);
      const cEnd = Math.max(endMin, cStart + 15);
      return {
        ...e,
        _startMin: cStart,
        _endMin: cEnd,
        col: 0,
        totalCols: 1,
        topPx: (cStart / 60) * HOUR_HEIGHT,
        heightPx: Math.max(((cEnd - cStart) / 60) * HOUR_HEIGHT, 16),
      };
    })
    .sort((a, b) => a._startMin - b._startMin || a._endMin - b._endMin);

  const cols: number[] = [];
  for (const ev of timed) {
    let placed = false;
    for (let c = 0; c < cols.length; c++) {
      if (ev._startMin >= cols[c]) {
        ev.col = c;
        cols[c] = ev._endMin;
        placed = true;
        break;
      }
    }
    if (!placed) {
      ev.col = cols.length;
      cols.push(ev._endMin);
    }
  }
  const maxCols = cols.length || 1;
  for (const ev of timed) ev.totalCols = maxCols;

  return timed as unknown as PositionedEvent[];
}
