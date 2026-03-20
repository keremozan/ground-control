"use client";
import { useState, useEffect } from "react";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import type { CalEvent } from "@/types";
import { DAY_LABELS, MONTH_NAMES, formatTime } from "./helpers";

// ── Styles ───────────────────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 20, height: 20, borderRadius: 4, border: "1px solid var(--border)",
  background: "var(--surface)", cursor: "pointer", color: "var(--text-2)", flexShrink: 0,
};

// ── Props ────────────────────────────────────────────────────────────────────

interface MonthViewProps {
  events: CalEvent[];
  eventColor: (t: string) => string;
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  loading: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MonthView({
  events, eventColor, year, month, onPrev, onNext, loading,
}: MonthViewProps) {
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
