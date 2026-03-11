const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mar 15" format */
export function formatDisplayDate(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Thu Mar 15" format (for Calendar) */
export function formatDisplayDateWithDay(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "10:43" 24h format */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function isToday(iso: string): boolean {
  const now = new Date();
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** Day diff from today (negative = past, positive = future) */
function dayDiff(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Relative date label: Today, Tmrw, day name within 6 days, or "Mar 15" */
function relativeDate(iso: string): string {
  const diff = dayDiff(iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomw";
  if (diff === -1) return "Yest";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (diff >= -6 && diff <= 6) return DAYS[d.getDay()];
  return formatDisplayDate(iso);
}

/**
 * Unified temporal label for the left "when" column.
 * Today + time: "21:56"
 * Today + no time: "Today"
 * Tomorrow + time: "Tmrw 07:15"
 * Within 6 days + time: "Thu 07:15"
 * Other + time: "Mar 15 07:15"
 * Other + no time: "Mar 10" / "Thu" / "Tmrw"
 */
export function formatWhen(iso: string, hasTime = true): string {
  if (isToday(iso)) {
    return hasTime ? formatTime(iso) : "Today";
  }
  const base = relativeDate(iso);
  if (hasTime && iso.length > 10) {
    return `${base} ${formatTime(iso)}`;
  }
  return base;
}

/**
 * Calendar-specific: always shows "Today HH:MM" for today, relative date otherwise.
 * For all-day events: "Today" or relative day label.
 */
export function formatCalendarWhen(iso: string, allDay: boolean): string {
  if (isToday(iso)) {
    return allDay ? "Today" : `Today ${formatTime(iso)}`;
  }
  const base = relativeDate(iso);
  return allDay ? base : `${base} ${formatTime(iso)}`;
}

export type DateUrgency = {
  color: string;
  dot: boolean;
};

const URGENCY_OVERDUE = { color: "#dc2626", dot: true };
const URGENCY_TODAY = { color: "#d97706", dot: true };
const URGENCY_SOON = { color: "#0d9488", dot: true };
const URGENCY_NONE: DateUrgency = { color: "var(--text-3)", dot: false };

/**
 * Get urgency styling for a date.
 * direction "future": tasks, classes, calendar (overdue = past due date)
 * direction "past": inbox (no urgency except today)
 * soonDays: how many days count as "soon" (default 2)
 */
export function getDateUrgency(
  iso: string,
  direction: "future" | "past" = "future",
  soonDays = 2,
): DateUrgency {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diff === 0) return URGENCY_TODAY;

  if (direction === "future") {
    if (diff < 0) return URGENCY_OVERDUE;
    if (diff <= soonDays) return URGENCY_SOON;
  }

  return URGENCY_NONE;
}
