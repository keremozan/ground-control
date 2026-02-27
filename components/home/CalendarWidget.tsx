"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { ListChecks, Trash2, MapPin, RefreshCw, Loader2, ExternalLink, Plus, X } from "lucide-react";
import { charColor } from "@/lib/char-icons";

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
  const compiled = Object.entries(patterns).map(([char, pattern]) => ({
    regex: new RegExp(pattern, 'i'),
    color: charColor[char] || "#94a3b8",
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
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${days[d.getDay()]} ${d.getDate()}`;
  } catch { return ""; }
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

const itemActions = [
  { icon: ExternalLink,  label: "Open",   colorClass: "item-action-btn-blue"  },
  { icon: ListChecks, label: "Task",   colorClass: "item-action-btn-green" },
  { icon: Trash2,        label: "Delete", colorClass: "item-action-btn-red"   },
];

export default function CalendarWidget() {
  const [todayEvents, setTodayEvents] = useState<CalEvent[]>([]);
  const [weekEvents, setWeekEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventStart, setNewEventStart] = useState("");
  const [newEventEnd, setNewEventEnd] = useState("");
  const [creatingEvent, setCreatingEvent] = useState(false);
  const newEventRef = useRef<HTMLInputElement>(null);
  const [eventColor, setEventColor] = useState<(title: string) => string>(() => defaultEventColor);

  useEffect(() => {
    fetch("/api/system/config").then(r => r.json())
      .then(d => {
        if (d.calendarColorPatterns) setEventColor(() => buildEventColor(d.calendarColorPatterns));
      })
      .catch(() => {});
  }, []);

  const fetchEvents = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/calendar").then(r => r.json()),
      fetch("/api/calendar?range=week").then(r => r.json()),
    ])
      .then(([today, week]) => {
        setTodayEvents(today.events || []);
        // Upcoming = week events excluding today's
        const todayIds = new Set((today.events || []).map((e: CalEvent) => e.id));
        setWeekEvents((week.events || []).filter((e: CalEvent) => !todayIds.has(e.id)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

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
      fetchEvents();
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
      if (data.ok) {
        if (action === "delete") {
          setTodayEvents(prev => prev.filter(e => e.id !== event.id));
          setWeekEvents(prev => prev.filter(e => e.id !== event.id));
        }
      }
    } catch {}
  };

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-header-label">Calendar</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
            {loading ? "..." : `${todayEvents.length} today`}
          </span>
          <button className="widget-toolbar-btn" data-tip="Add event" onClick={openNewEvent}>
            <Plus size={12} strokeWidth={1.5} />
          </button>
          <button className="widget-toolbar-btn" data-tip="Refresh" onClick={fetchEvents}>
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

      <div className="widget-body" style={{ padding: 0 }}>
        {loading && todayEvents.length === 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 20, gap: 8 }}>
            <Loader2 size={14} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>Loading calendar...</span>
          </div>
        )}

        {/* All sections rendered with a single sectionIndex counter */}
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
                padding: "6px 16px 4px",
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
              borderLeft: `3px solid ${eventColor(event.summary)}`,
              background: isNowSection ? "var(--blue-bg, rgba(59,130,246,0.06))" : undefined,
            }}>
              <div style={{ padding: "9px 16px 6px", cursor: "pointer" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isNowSection ? "var(--blue)" : "var(--text-3)", display: "block", marginBottom: 2 }}>
                  {formatTime(event.start, event.allDay)}
                  {!event.allDay && ` – ${formatTime(event.end, false)}`}
                </span>
                <div style={{
                  fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: "var(--text)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2,
                }}>
                  {event.summary}
                </div>
                {event.location && (
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <MapPin size={9} strokeWidth={1.5} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-3)" }}>
                      {event.location}
                    </span>
                  </div>
                )}
              </div>
              <div className="item-actions" style={{ padding: "0 16px 6px" }}>
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
          );

          return (
            <>
              {/* Past events — compact, greyed out */}
              {past.length > 0 && (
                <>
                  {sectionLabel("Earlier")}
                  {past.map((event, i) => (
                    <div key={event.id} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "5px 16px",
                      borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                      borderLeft: `3px solid ${eventColor(event.summary)}`,
                      opacity: 0.45,
                    }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", width: 54, flexShrink: 0 }}>
                        {formatTime(event.start, event.allDay)}
                      </span>
                      <span style={{
                        fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 500, color: "var(--text)",
                        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {event.summary}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>
                        {formatTime(event.end, false)}
                      </span>
                    </div>
                  ))}
                </>
              )}

              {/* NOW events */}
              {now.length > 0 && (
                <>
                  {sectionLabel("Now", "now")}
                  {now.map((event, i) => renderEvent(event, true, i === 0))}
                </>
              )}

              {/* TODAY events */}
              {later.length > 0 && (
                <>
                  {sectionLabel("Today")}
                  {later.map((event, i) => renderEvent(event, false, i === 0))}
                </>
              )}

              {/* Upcoming section */}
              {weekEvents.length > 0 && (
                <>
                  {sectionLabel("Upcoming")}
                  {weekEvents.map((event, i) => (
                    <div key={event.id} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "5px 16px",
                      borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                      borderLeft: `3px solid ${eventColor(event.summary)}`,
                    }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", width: 54, flexShrink: 0 }}>
                        {formatDate(event.start)}
                      </span>
                      <span style={{
                        fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 500, color: "var(--text)",
                        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {event.summary}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>
                        {formatTime(event.start, event.allDay)}
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
      </div>
    </div>
  );
}
