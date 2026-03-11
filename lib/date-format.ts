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

export type DateUrgency = {
  color: string;
  dot: boolean;
};

const URGENCY_OVERDUE = { color: "#dc2626", dot: true };
const URGENCY_TODAY = { color: "#2563eb", dot: true };
const URGENCY_SOON = { color: "#d97706", dot: true };
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
