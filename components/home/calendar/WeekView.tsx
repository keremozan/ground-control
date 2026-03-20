"use client";
import { useEffect, useRef } from "react";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import type { CalEvent } from "@/types";
import { HOUR_HEIGHT, DAY_LABELS, MONTH_NAMES, sameDay, formatTime, layoutDayEvents } from "./helpers";

// ── Styles ───────────────────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 20, height: 20, borderRadius: 4, border: "1px solid var(--border)",
  background: "var(--surface)", cursor: "pointer", color: "var(--text-2)", flexShrink: 0,
};

// ── Props ────────────────────────────────────────────────────────────────────

interface WeekViewProps {
  events: CalEvent[];
  eventColor: (t: string) => string;
  weekOffset: number;
  onPrev: () => void;
  onNext: () => void;
  loading: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WeekView({
  events, eventColor, weekOffset, onPrev, onNext, loading,
}: WeekViewProps) {
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
