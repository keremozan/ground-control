import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatDisplayDate,
  formatTime,
  getDateUrgency,
} from "@/lib/date-format";

// ---------------------------------------------------------------------------
// formatDisplayDate
// ---------------------------------------------------------------------------

describe("formatDisplayDate", () => {
  it("formats a date-only ISO string to 'Mon DD' style", () => {
    // 2024-03-15 -> "Mar 15"
    expect(formatDisplayDate("2024-03-15")).toBe("Mar 15");
  });

  it("formats a datetime ISO string", () => {
    expect(formatDisplayDate("2024-01-01T00:00:00")).toBe("Jan 1");
  });

  it("handles end-of-year dates", () => {
    expect(formatDisplayDate("2024-12-31")).toBe("Dec 31");
  });

  it("handles single-digit days without zero-padding", () => {
    expect(formatDisplayDate("2024-06-05")).toBe("Jun 5");
  });

  it("formats all months correctly (spot check)", () => {
    expect(formatDisplayDate("2024-07-04")).toBe("Jul 4");
    expect(formatDisplayDate("2024-11-11")).toBe("Nov 11");
  });
});

// ---------------------------------------------------------------------------
// formatTime
// ---------------------------------------------------------------------------

describe("formatTime", () => {
  it("formats a full datetime string to 24h HH:MM", () => {
    // Use a datetime with explicit offset-naive local interpretation
    const result = formatTime("2024-03-15T10:43:00");
    expect(result).toBe("10:43");
  });

  it("formats midnight as 00:00", () => {
    expect(formatTime("2024-03-15T00:00:00")).toBe("00:00");
  });

  it("formats noon as 12:00", () => {
    expect(formatTime("2024-03-15T12:00:00")).toBe("12:00");
  });

  it("formats end-of-day time", () => {
    expect(formatTime("2024-03-15T23:59:00")).toBe("23:59");
  });
});

// ---------------------------------------------------------------------------
// getDateUrgency
// ---------------------------------------------------------------------------

describe("getDateUrgency", () => {
  const FIXED_NOW = new Date("2024-03-15T12:00:00");

  afterEach(() => {
    vi.useRealTimers();
  });

  function freeze() {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  }

  it("returns 'today' urgency for today's date", () => {
    freeze();
    const result = getDateUrgency("2024-03-15");
    expect(result.level).toBe("today");
    expect(result.dot).toBe(true);
  });

  it("returns 'overdue' urgency for a past date (future direction)", () => {
    freeze();
    const result = getDateUrgency("2024-03-10", "future");
    expect(result.level).toBe("overdue");
    expect(result.dot).toBe(true);
  });

  it("returns 'soon' for a date within soonDays in the future", () => {
    freeze();
    const result = getDateUrgency("2024-03-16", "future", 2); // tomorrow
    expect(result.level).toBe("soon");
    expect(result.dot).toBe(true);
  });

  it("returns 'none' for a date beyond soonDays in the future", () => {
    freeze();
    const result = getDateUrgency("2024-03-20", "future", 2);
    expect(result.level).toBe("none");
    expect(result.dot).toBe(false);
  });

  it("returns 'none' for a past date in 'past' direction", () => {
    freeze();
    const result = getDateUrgency("2024-03-10", "past");
    expect(result.level).toBe("none");
  });

  it("returns 'none' for a future date in 'past' direction", () => {
    freeze();
    const result = getDateUrgency("2024-03-20", "past");
    expect(result.level).toBe("none");
  });

  it("respects custom soonDays threshold", () => {
    freeze();
    // 5 days out — not soon with default soonDays=2, but soon with soonDays=7
    const notSoon = getDateUrgency("2024-03-20", "future", 2);
    const soon = getDateUrgency("2024-03-20", "future", 7);
    expect(notSoon.level).toBe("none");
    expect(soon.level).toBe("soon");
  });

  it("returns correct CSS color variables", () => {
    freeze();
    expect(getDateUrgency("2024-03-10", "future").color).toBe("var(--red)");
    expect(getDateUrgency("2024-03-15").color).toBe("var(--amber)");
    expect(getDateUrgency("2024-03-16", "future").color).toBe("var(--teal)");
    expect(getDateUrgency("2024-03-20", "future").color).toBe("var(--text-3)");
  });
});
