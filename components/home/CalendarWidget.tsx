"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSystemConfig } from "@/lib/shared-data";
import {
  ListChecks, Trash2, MapPin, RefreshCw, Loader2, ExternalLink, Plus, X,
  CalendarDays, Sun, Moon, Sunrise, Sunset,
  AlignJustify, Columns, Grid3X3, ChevronLeft, ChevronRight,
} from "lucide-react";
import { iconForColor } from "@/lib/char-icons";
import { formatDisplayDateWithDay, formatTime as fmtTime, formatCalendarWhen } from "@/lib/date-format";

type CalView = "list" | "week" | "month";

function timeOfDayIcon(iso: string, allDay: boolean) {
  if (allDay) return { Icon: Sun, color: "#f59e0b" };
  const h = new Date(iso).getHours();
  if (h < 7) return { Icon: Moon, color: "#6366f1" };
  if (h < 10) return { Icon: Sunrise, color: "#f97316" };
  if (h < 17) return { Icon: Sun, color: "#eab308" };
  if (h < 20) return { Icon: Sunset, color: "#f97316" };
  return { Icon: Moon, color: "#6366f1" };
}

type CalEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  allDay: boolean;
  calendarId: string;
  htmlLink?: string;
};

function buildEventColor(patterns: Record<string, string>): (title: string) => string {
  const compiled = Object.entries(patterns).map(([color, pattern]) => ({
    regex: new RegExp(pattern, 'i'),
    color,
  }));
  return (title: string) => {
    for (const { regex, color } of compiled) {
      if (regex.test(title)) return color;
    }
    return "#94a3b8";
  };
}

const defaultEventColor = (_title: string) => "#94a3b8";

function formatTime(iso: string, allDay: boolean): string {
  if (allDay) return "all day";
  try { return fmtTime(iso); } catch { return ""; }
}

function formatDate(iso: string): string {
  try { return formatDisplayDateWithDay(iso); } catch { return ""; }
}

function isPast(event: CalEvent): boolean {
  if (event.allDay) return false;
  try { return new Date(event.end) < new Date(); } catch { return false; }
}

function isCurrent(event: CalEvent): boolean {
  if (event.allDay) return false;
  try {
    const now = new Date();
    return new Date(event.start) <= now && new Date(event.end) > now;
  } catch { return false; }
}

function sameDay(iso: string, date: Date): boolean {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.getFullYear() === date.getFullYear() &&
    d.getMonth() === date.getMonth() &&
    d.getDate() === date.getDate();
}

const itemActions = [
  { icon: ExternalLink, label: "Open",   colorClass: "item-action-btn-blue"  },
  { icon: ListChecks,   label: "Task",   colorClass: "item-action-btn-green" },
  { icon: Trash2,       label: "Delete", colorClass: "item-action-btn-red"   },
];

// ── Week view (time grid) ───────────────────────────────────────────────────

const HOUR_HEIGHT = 36;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type PositionedEvent = CalEvent & {
  col: number;
  totalCols: number;
  topPx: number;
  heightPx: number;
};

function layoutDayEvents(dayEvents: CalEvent[], minHour: number): PositionedEvent[] {
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

  // Column assignment for overlapping events
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

const navBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 20, height: 20, borderRadius: 4, border: "1px solid var(--border)",
  background: "var(--surface)", cursor: "pointer", color: "var(--text-2)", flexShrink: 0,
};

function WeekView({
  events, eventColor, weekOffset, onPrev, onNext, loading,
}: {
  events: CalEvent[];
  eventColor: (t: string) => string;
  weekOffset: number;
  onPrev: () => void;
  onNext: () => void;
  loading: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date();

  // Week boundaries
  const dow = today.getDay();
  const mondayOff = dow === 0 ? -6 : 1 - dow;
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOff + weekOffset * 7 + i)
  );

  // Hour range from events (adaptive)
  let minH = 8, maxH = 20;
  for (const e of events) {
    if (e.allDay) continue;
    const sh = new Date(e.start).getHours();
    const eh = new Date(e.end).getHours() + (new Date(e.end).getMinutes() > 0 ? 1 : 0);
    if (sh < minH) minH = sh;
    if (eh > maxH) maxH = Math.min(eh, 24);
  }
  minH = Math.max(minH - 1, 0);
  maxH = Math.min(maxH + 1, 24);
  const hourCount = maxH - minH;
  const gridH = hourCount * HOUR_HEIGHT;

  // "Now" position
  const isThisWeek = weekOffset === 0;
  const nowMin = isThisWeek ? (today.getHours() - minH) * 60 + today.getMinutes() : -1;
  const nowPx = nowMin >= 0 && nowMin <= hourCount * 60 ? (nowMin / 60) * HOUR_HEIGHT : -1;
  const todayIdx = isThisWeek ? days.findIndex(d => sameDay(d.toISOString(), today)) : -1;

  // Auto-scroll to current time or first event
  useEffect(() => {
    if (!scrollRef.current) return;
    if (nowPx > 0) {
      scrollRef.current.scrollTop = Math.max(nowPx - 80, 0);
    } else if (events.length > 0) {
      const first = events.find(e => !e.allDay);
      if (first) {
        const h = new Date(first.start).getHours();
        scrollRef.current.scrollTop = Math.max(((h - minH) / hourCount) * gridH - 40, 0);
      }
    }
  }, [events.length, weekOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekLabel = `${days[0].getDate()} ${MONTH_NAMES[days[0].getMonth()]} – ${days[6].getDate()} ${MONTH_NAMES[days[6].getMonth()]}`;
  const allDayByDay = days.map(d => events.filter(e => e.allDay && sameDay(e.start, d)));
  const hasAllDay = allDayByDay.some(a => a.length > 0);

  if (loading && events.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Loader2 size={14} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Week navigation */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 10px 4px", flexShrink: 0,
      }}>
        <button onClick={onPrev} style={navBtnStyle}><ChevronLeft size={10} strokeWidth={2} /></button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, color: "var(--text-2)" }}>{weekLabel}</span>
        <button onClick={onNext} style={navBtnStyle}><ChevronRight size={10} strokeWidth={2} /></button>
      </div>

      {/* Day headers */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ width: 36, flexShrink: 0 }} />
        {days.map((day, i) => {
          const isTd = todayIdx === i;
          return (
            <div key={i} style={{ flex: 1, textAlign: "center", padding: "2px 0 3px" }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 500,
                color: isTd ? "var(--blue)" : "var(--text-3)",
                textTransform: "uppercase", letterSpacing: "0.04em", display: "block",
              }}>{DAY_LABELS[i]}</span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 11,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 20, height: 20, borderRadius: "50%",
                background: isTd ? "var(--blue)" : undefined,
                color: isTd ? "#fff" : "var(--text)",
                fontWeight: isTd ? 600 : 400,
              }}>{day.getDate()}</span>
            </div>
          );
        })}
      </div>

      {/* All-day events */}
      {hasAllDay && (
        <div style={{
          display: "flex", borderBottom: "1px solid var(--border)",
          padding: "2px 0", flexShrink: 0,
        }}>
          <div style={{
            width: 36, flexShrink: 0, display: "flex", alignItems: "center",
            justifyContent: "flex-end", paddingRight: 4,
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-3)" }}>ALL</span>
          </div>
          {days.map((_, i) => (
            <div key={i} style={{ flex: 1, padding: "0 1px" }}>
              {allDayByDay[i].map(e => (
                <div key={e.id} title={e.summary} style={{
                  fontSize: 8, fontFamily: "var(--font-mono)", padding: "1px 3px", borderRadius: 2,
                  background: eventColor(e.summary) + "20",
                  borderLeft: `2px solid ${eventColor(e.summary)}`,
                  color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap", marginBottom: 1,
                }}>{e.summary}</div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <div style={{ display: "flex", position: "relative", height: gridH }}>
          {/* Hour labels */}
          <div style={{ width: 36, flexShrink: 0, position: "relative" }}>
            {Array.from({ length: hourCount }, (_, i) => (
              <div key={i} style={{
                position: "absolute", top: i * HOUR_HEIGHT - 5, right: 4,
                fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-3)", lineHeight: 1,
              }}>{String(minH + i).padStart(2, "0")}:00</div>
            ))}
          </div>

          {/* Day columns */}
          <div style={{ flex: 1, display: "flex", position: "relative" }}>
            {/* Grid lines */}
            {Array.from({ length: hourCount + 1 }, (_, i) => (
              <div key={`gl-${i}`} style={{
                position: "absolute", left: 0, right: 0, top: i * HOUR_HEIGHT,
                borderTop: "1px solid var(--border)", opacity: 0.5,
              }} />
            ))}
            {/* Half-hour lines */}
            {Array.from({ length: hourCount }, (_, i) => (
              <div key={`hl-${i}`} style={{
                position: "absolute", left: 0, right: 0, top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2,
                borderTop: "1px dashed var(--border)", opacity: 0.25,
              }} />
            ))}

            {/* Now line */}
            {nowPx >= 0 && (
              <div style={{
                position: "absolute", left: -3, right: 0, top: nowPx, zIndex: 10,
                display: "flex", alignItems: "center", pointerEvents: "none",
              }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />
                <div style={{ flex: 1, height: 1.5, background: "var(--red)" }} />
              </div>
            )}

            {/* Day columns with events */}
            {days.map((day, di) => {
              const dayEv = events.filter(e => !e.allDay && sameDay(e.start, day));
              const laid = layoutDayEvents(dayEv, minH);
              const isTd = todayIdx === di;
              return (
                <div key={di} style={{
                  flex: 1, position: "relative", height: gridH,
                  borderLeft: "1px solid var(--border)",
                  background: isTd ? "rgba(59,130,246,0.03)" : undefined,
                }}>
                  {laid.map(e => {
                    const c = eventColor(e.summary);
                    return (
                      <div
                        key={e.id}
                        title={`${formatTime(e.start, false)} – ${formatTime(e.end, false)}\n${e.summary}${e.location ? '\n' + e.location : ''}`}
                        onClick={() => e.htmlLink && window.open(e.htmlLink, "_blank")}
                        style={{
                          position: "absolute",
                          top: e.topPx + 1,
                          left: `calc(${(e.col / e.totalCols) * 100}% + 1px)`,
                          width: `calc(${100 / e.totalCols}% - 3px)`,
                          height: Math.max(e.heightPx - 2, 14),
                          padding: "1px 2px 1px 4px",
                          borderLeft: `2px solid ${c}`,
                          background: c + "18",
                          borderRadius: "0 2px 2px 0",
                          overflow: "hidden",
                          cursor: e.htmlLink ? "pointer" : "default",
                          zIndex: 5,
                        }}
                      >
                        <div style={{
                          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 500,
                          color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis",
                          whiteSpace: "nowrap", lineHeight: 1.3,
                        }}>{e.summary}</div>
                        {e.heightPx > 26 && (
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-3)" }}>
                            {formatTime(e.start, false)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Month view ──────────────────────────────────────────────────────────────

function MonthView({
  events, eventColor, year, month, onPrev, onNext, loading,
}: {
  events: CalEvent[];
  eventColor: (t: string) => string;
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  loading: boolean;
}) {
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month;

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Break into week rows
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const eventsForDate = (date: number) => events.filter(e => {
    const d = new Date(e.start.length === 10 ? e.start + "T00:00:00" : e.start);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === date;
  });

  // Reset expanded day when month changes
  useEffect(() => { setExpandedDay(null); }, [year, month]);

  const MAX_BARS = 2;

  return (
    <div style={{ padding: "8px 10px 10px" }}>
      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={onPrev} style={navBtnStyle}><ChevronLeft size={11} strokeWidth={2} /></button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, color: "var(--text-2)" }}>
          {MONTH_NAMES[month]} {year}
        </span>
        <button onClick={onNext} style={navBtnStyle}><ChevronRight size={11} strokeWidth={2} /></button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
          <Loader2 size={14} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
        </div>
      ) : (
        <>
          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div key={i} style={{
                textAlign: "center",
                fontFamily: "var(--font-mono)", fontSize: 8,
                color: "var(--text-3)",
                padding: "1px 0 3px",
                opacity: i >= 5 ? 0.6 : 1,
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* Week rows */}
          {weeks.map((week, wi) => {
            const expandedInRow = expandedDay !== null && week.includes(expandedDay);
            return (
              <div key={wi}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                  {week.map((date, di) => {
                    if (date === null) return <div key={di} style={{ minHeight: 44 }} />;
                    const isToday = isThisMonth && date === today.getDate();
                    const isExp = expandedDay === date;
                    const dayEvents = eventsForDate(date);
                    const isWeekend = di >= 5;
                    return (
                      <div
                        key={di}
                        onClick={() => dayEvents.length > 0 && setExpandedDay(isExp ? null : date)}
                        style={{
                          display: "flex", flexDirection: "column",
                          padding: "2px 1px", borderRadius: 4, minHeight: 44,
                          cursor: dayEvents.length > 0 ? "pointer" : "default",
                          background: isExp ? "rgba(59,130,246,0.08)" : isToday ? "rgba(59,130,246,0.04)" : undefined,
                          outline: isExp ? "1px solid var(--blue)" : undefined,
                        }}
                      >
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 9,
                          width: 18, height: 18,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          borderRadius: "50%",
                          background: isToday ? "var(--blue)" : undefined,
                          color: isToday ? "#fff" : isWeekend ? "var(--text-3)" : "var(--text)",
                          fontWeight: isToday ? 600 : 400,
                          alignSelf: "center",
                        }}>
                          {date}
                        </span>
                        {dayEvents.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 1, paddingTop: 1 }}>
                            {dayEvents.slice(0, MAX_BARS).map(e => (
                              <div key={e.id} title={`${formatTime(e.start, e.allDay)} ${e.summary}`} style={{
                                fontSize: 8, fontFamily: "var(--font-mono)", lineHeight: 1.4,
                                padding: "0 2px",
                                borderLeft: `2px solid ${eventColor(e.summary)}`,
                                borderRadius: "0 1px 1px 0",
                                background: eventColor(e.summary) + "15",
                                color: "var(--text-2)",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>
                                {e.summary}
                              </div>
                            ))}
                            {dayEvents.length > MAX_BARS && (
                              <span style={{
                                fontFamily: "var(--font-mono)", fontSize: 8,
                                color: "var(--text-3)", textAlign: "center",
                              }}>
                                +{dayEvents.length - MAX_BARS}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Expanded day detail */}
                {expandedInRow && expandedDay !== null && (
                  <div style={{
                    margin: "2px 0 4px", padding: "6px 8px",
                    background: "var(--surface-2)", borderRadius: 4,
                    border: "1px solid var(--border)",
                  }}>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 500,
                      color: "var(--text-3)", marginBottom: 4,
                      textTransform: "uppercase", letterSpacing: "0.04em",
                    }}>
                      {DAY_LABELS[week.indexOf(expandedDay) % 7]} {expandedDay} {MONTH_NAMES[month]}
                    </div>
                    {eventsForDate(expandedDay).map((e, ei) => (
                      <div
                        key={e.id}
                        onClick={(ev) => { ev.stopPropagation(); if (e.htmlLink) window.open(e.htmlLink, "_blank"); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 4, padding: "3px 0",
                          borderTop: ei > 0 ? "1px solid var(--border)" : undefined,
                          cursor: e.htmlLink ? "pointer" : "default",
                        }}
                      >
                        <div style={{
                          width: 4, height: 4, borderRadius: "50%",
                          background: eventColor(e.summary), flexShrink: 0,
                        }} />
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)",
                          flexShrink: 0, width: 42,
                        }}>
                          {formatTime(e.start, e.allDay)}
                        </span>
                        <span style={{
                          fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {e.summary}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Main widget ──────────────────────────────────────────────────────────────

export default function CalendarWidget() {
  const sharedConfig = useSystemConfig();
  const [todayEvents, setTodayEvents] = useState<CalEvent[]>([]);
  const [weekEvents, setWeekEvents] = useState<CalEvent[]>([]);
  const [fullWeekEvents, setFullWeekEvents] = useState<CalEvent[]>([]);
  const [monthEvents, setMonthEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [view, setView] = useState<CalView>("list");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventStart, setNewEventStart] = useState("");
  const [newEventEnd, setNewEventEnd] = useState("");
  const [creatingEvent, setCreatingEvent] = useState(false);
  const newEventRef = useRef<HTMLInputElement>(null);
  const [eventColor, setEventColor] = useState<(title: string) => string>(() => defaultEventColor);

  useEffect(() => {
    if (sharedConfig.calendarColorPatterns) setEventColor(() => buildEventColor(sharedConfig.calendarColorPatterns!));
  }, [sharedConfig]);

  // Base fetch for list view (today + upcoming week)
  const fetchListEvents = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/calendar").then(r => r.json()),
      fetch("/api/calendar?range=week").then(r => r.json()),
    ])
      .then(([today, week]) => {
        setTodayEvents(today.events || []);
        const todayIds = new Set((today.events || []).map((e: CalEvent) => e.id));
        setWeekEvents((week.events || []).filter((e: CalEvent) => !todayIds.has(e.id)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Week view fetch (supports offset)
  const fetchFullWeek = useCallback((offset: number) => {
    setLoadingWeek(true);
    fetch(`/api/calendar?range=full-week&offset=${offset}`)
      .then(r => r.json())
      .then(d => { setFullWeekEvents(d.events || []); setLoadingWeek(false); })
      .catch(() => setLoadingWeek(false));
  }, []);

  // Month view fetch
  const fetchMonthEvents = useCallback((year: number, month: number) => {
    setLoadingMonth(true);
    fetch(`/api/calendar?range=month&year=${year}&month=${month}`)
      .then(r => r.json())
      .then(d => { setMonthEvents(d.events || []); setLoadingMonth(false); })
      .catch(() => setLoadingMonth(false));
  }, []);

  const targetMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  const handleRefresh = useCallback(() => {
    fetchListEvents();
    if (view === "week") fetchFullWeek(weekOffset);
    if (view === "month") fetchMonthEvents(targetMonth.getFullYear(), targetMonth.getMonth());
  }, [fetchListEvents, view, weekOffset, fetchFullWeek, targetMonth, fetchMonthEvents]);

  useEffect(() => {
    fetchListEvents();
    const interval = setInterval(handleRefresh, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchListEvents, handleRefresh]);

  useEffect(() => {
    if (view === "week") fetchFullWeek(weekOffset);
  }, [view, weekOffset, fetchFullWeek]);

  useEffect(() => {
    if (view === "month") {
      fetchMonthEvents(targetMonth.getFullYear(), targetMonth.getMonth());
    }
  }, [view, targetMonth, fetchMonthEvents]);

  const openNewEvent = () => {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    const endHour = new Date(nextHour);
    endHour.setHours(endHour.getHours() + 1);
    setNewEventDate(now.toISOString().split("T")[0]);
    setNewEventStart(nextHour.toTimeString().slice(0, 5));
    setNewEventEnd(endHour.toTimeString().slice(0, 5));
    setNewEventTitle("");
    setShowNewEvent(true);
    setTimeout(() => newEventRef.current?.focus(), 50);
  };

  const submitNewEvent = async () => {
    if (!newEventTitle.trim() || !newEventDate || !newEventStart || !newEventEnd || creatingEvent) return;
    setCreatingEvent(true);
    try {
      await fetch("/api/calendar/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          summary: newEventTitle.trim(),
          start: `${newEventDate}T${newEventStart}:00`,
          end: `${newEventDate}T${newEventEnd}:00`,
        }),
      });
      setShowNewEvent(false);
      setNewEventTitle("");
      handleRefresh();
    } finally { setCreatingEvent(false); }
  };

  const runCalAction = async (action: string, event: CalEvent) => {
    try {
      const res = await fetch("/api/calendar/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          eventId: event.id,
          calendarId: event.calendarId,
          summary: event.summary,
          start: event.start,
        }),
      });
      const data = await res.json();
      if (data.ok && action === "delete") {
        setTodayEvents(prev => prev.filter(e => e.id !== event.id));
        setWeekEvents(prev => prev.filter(e => e.id !== event.id));
      }
    } catch {}
  };


  const viewBtnStyle = (v: CalView): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 20, height: 20, borderRadius: 4,
    border: view === v ? "1px solid var(--blue)" : "1px solid transparent",
    background: view === v ? "rgba(59,130,246,0.12)" : undefined,
    color: view === v ? "var(--blue)" : "var(--text-3)",
    cursor: "pointer", flexShrink: 0,
  });

  return (
    <div className="widget" style={view === "week" ? { display: "flex", flexDirection: "column" } : undefined}>
      <div className="widget-header">
        <span className="widget-header-label"><CalendarDays size={13} strokeWidth={1.5} /> Calendar</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
            {loading ? "..." : `${todayEvents.length} today`}
          </span>
          {/* View toggle */}
          <div style={{ display: "flex", gap: 1, marginLeft: 2 }}>
            <button style={viewBtnStyle("list")} onClick={() => setView("list")} data-tip="List">
              <AlignJustify size={10} strokeWidth={1.5} />
            </button>
            <button style={viewBtnStyle("week")} onClick={() => { setView("week"); setWeekOffset(0); }} data-tip="Week">
              <Columns size={10} strokeWidth={1.5} />
            </button>
            <button style={viewBtnStyle("month")} onClick={() => { setView("month"); setMonthOffset(0); }} data-tip="Month">
              <Grid3X3 size={10} strokeWidth={1.5} />
            </button>
          </div>
          <button className="widget-toolbar-btn" data-tip="Add event" onClick={openNewEvent}>
            <Plus size={12} strokeWidth={1.5} />
          </button>
          <button className="widget-toolbar-btn" data-tip="Refresh" onClick={handleRefresh}>
            <RefreshCw size={12} strokeWidth={1.5} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          </button>
        </div>
      </div>

      {/* Inline new event form */}
      {showNewEvent && (
        <div style={{ padding: "6px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 4 }}>
          <input
            ref={newEventRef}
            value={newEventTitle}
            onChange={e => setNewEventTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") { setShowNewEvent(false); setNewEventTitle(""); } }}
            placeholder="Event title..."
            disabled={creatingEvent}
            style={{
              fontFamily: "var(--font-body)", fontSize: 11,
              padding: "4px 8px", borderRadius: 4,
              background: "var(--surface)", border: "1px solid var(--border)",
              color: "var(--text)", outline: "none", width: "100%",
            }}
          />
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "3px 6px", borderRadius: 4, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", outline: "none", flex: 1 }} />
            <input type="time" value={newEventStart} onChange={e => setNewEventStart(e.target.value)}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "3px 6px", borderRadius: 4, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", outline: "none", width: 70 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>–</span>
            <input type="time" value={newEventEnd} onChange={e => setNewEventEnd(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitNewEvent(); if (e.key === "Escape") { setShowNewEvent(false); } }}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "3px 6px", borderRadius: 4, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", outline: "none", width: 70 }} />
            <button onClick={submitNewEvent} disabled={creatingEvent || !newEventTitle.trim()}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
                padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)",
                background: newEventTitle.trim() ? "var(--blue)" : "var(--surface)",
                color: newEventTitle.trim() ? "#fff" : "var(--text-3)",
                cursor: newEventTitle.trim() ? "pointer" : "default", flexShrink: 0,
              }}>
              {creatingEvent ? "..." : "Add"}
            </button>
            <button onClick={() => { setShowNewEvent(false); setNewEventTitle(""); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 20, height: 20, borderRadius: 4, border: "1px solid var(--border)",
                background: "var(--surface)", cursor: "pointer", color: "var(--text-3)", flexShrink: 0,
              }}>
              <X size={10} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      <div className="widget-body" style={{
        padding: 0,
        ...(view === "week" ? { overflow: "hidden", display: "flex", flexDirection: "column" } : {}),
      }}>
        {/* ── Week view ── */}
        {view === "week" && (
          <WeekView
            events={fullWeekEvents}
            eventColor={eventColor}
            weekOffset={weekOffset}
            loading={loadingWeek}
            onPrev={() => setWeekOffset(o => o - 1)}
            onNext={() => setWeekOffset(o => o + 1)}
          />
        )}

        {/* ── Month view ── */}
        {view === "month" && (
          <MonthView
            events={monthEvents}
            eventColor={eventColor}
            year={targetMonth.getFullYear()}
            month={targetMonth.getMonth()}
            loading={loadingMonth}
            onPrev={() => setMonthOffset(o => o - 1)}
            onNext={() => setMonthOffset(o => o + 1)}
          />
        )}

        {/* ── List view ── */}
        {view === "list" && (
          <>
            {loading && todayEvents.length === 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 20, gap: 8 }}>
                <Loader2 size={14} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>Loading calendar...</span>
              </div>
            )}

            {(() => {
              const past = todayEvents.filter(isPast);
              const remaining = todayEvents.filter(e => !isPast(e));
              const now = remaining.filter(isCurrent);
              const later = remaining.filter(e => !isCurrent(e));

              let sectionIndex = 0;

              const sectionLabel = (text: string, variant?: "now") => {
                const isFirst = sectionIndex === 0;
                sectionIndex++;
                return (
                  <div style={{
                    padding: "6px 14px 4px",
                    ...(isFirst ? {} : { borderTop: "1px solid var(--border)" }),
                  }}>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 9,
                      fontWeight: variant === "now" ? 600 : 500,
                      color: variant === "now" ? "var(--blue)" : "var(--text-3)",
                      textTransform: "uppercase", letterSpacing: "0.05em",
                    }}>
                      {text}
                    </span>
                  </div>
                );
              };

              const renderEvent = (event: CalEvent, isNowSection: boolean, isFirst: boolean) => (
                <div key={event.id} className="item-row" style={{
                  borderTop: isFirst ? undefined : "1px solid var(--border)",
                  background: isNowSection ? "var(--blue-bg, rgba(59,130,246,0.06))" : undefined,
                  padding: "8px 14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 3 }}>
                      {(() => { const td = timeOfDayIcon(event.start, event.allDay); return <td.Icon size={10} strokeWidth={1.5} style={{ color: td.color }} />; })()}
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 10,
                        color: isNowSection ? "var(--blue)" : "var(--text-3)",
                        whiteSpace: "nowrap",
                      }}>
                        {formatCalendarWhen(event.start, event.allDay)}
                      </span>
                    </span>
                    {(() => { const c = iconForColor(eventColor(event.summary)); return c ? <c.Icon size={12} strokeWidth={1.5} style={{ color: c.color, flexShrink: 0 }} /> : null; })()}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ cursor: "pointer" }}>
                        <span style={{
                          fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: "var(--text)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
                        }}>
                          {event.summary}
                        </span>
                      </div>
                      {event.location && (
                        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <MapPin size={9} strokeWidth={1.5} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                          <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-3)" }}>
                            {event.location}
                          </span>
                        </div>
                      )}
                      <div className="item-actions" style={{ padding: "4px 0 0 0" }}>
                        {itemActions.map(({ icon: ActionIcon, label, colorClass }) => (
                          <button
                            key={label}
                            className={`item-action-btn ${colorClass}`}
                            data-tip={label}
                            onClick={() => {
                              if (label === "Open" && event.htmlLink) {
                                window.open(event.htmlLink, "_blank");
                              } else if (label !== "Open") {
                                runCalAction(label.toLowerCase(), event);
                              }
                            }}
                          >
                            <ActionIcon size={12} strokeWidth={1.5} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );

              return (
                <>
                  {past.length > 0 && (
                    <>
                      {sectionLabel("Earlier")}
                      {past.map((event, i) => (
                        <div key={event.id} style={{
                          display: "flex", alignItems: "center", gap: 0, padding: "5px 10px 5px 16px",
                          borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                          opacity: 0.45,
                        }}>
                          <span style={{ width: 72, flexShrink: 0, display: "flex", alignItems: "center", gap: 3 }}>
                            {(() => { const td = timeOfDayIcon(event.start, event.allDay); return <td.Icon size={10} strokeWidth={1.5} style={{ color: td.color }} />; })()}
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                              {formatCalendarWhen(event.start, event.allDay)}
                            </span>
                          </span>
                          {(() => { const c = iconForColor(eventColor(event.summary)); return c ? <c.Icon size={12} strokeWidth={1.5} style={{ color: c.color, flexShrink: 0, marginRight: 6 }} /> : null; })()}
                          <span style={{
                            fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: "var(--text)",
                            flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {event.summary}
                          </span>
                        </div>
                      ))}
                    </>
                  )}

                  {now.length > 0 && (
                    <>
                      {sectionLabel("Now", "now")}
                      {now.map((event, i) => renderEvent(event, true, i === 0))}
                    </>
                  )}

                  {later.length > 0 && (
                    <>
                      {sectionLabel("Today")}
                      {later.map((event, i) => renderEvent(event, false, i === 0))}
                    </>
                  )}

                  {weekEvents.length > 0 && (
                    <>
                      {sectionLabel("Upcoming")}
                      {weekEvents.map((event, i) => (
                        <div key={event.id} style={{
                          display: "flex", alignItems: "center", gap: 0, padding: "5px 10px 5px 16px",
                          borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                        }}>
                          <span style={{ width: 72, flexShrink: 0, display: "flex", alignItems: "center", gap: 3 }}>
                            {(() => { const td = timeOfDayIcon(event.start, event.allDay); return <td.Icon size={10} strokeWidth={1.5} style={{ color: td.color }} />; })()}
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                              {formatCalendarWhen(event.start, event.allDay)}
                            </span>
                          </span>
                          {(() => { const c = iconForColor(eventColor(event.summary)); return c ? <c.Icon size={12} strokeWidth={1.5} style={{ color: c.color, flexShrink: 0, marginRight: 6 }} /> : null; })()}
                          <span style={{
                            fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: "var(--text)",
                            flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {event.summary}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </>
              );
            })()}

            {!loading && todayEvents.length === 0 && weekEvents.length === 0 && (
              <div style={{ padding: "16px", textAlign: "center" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>No events</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
