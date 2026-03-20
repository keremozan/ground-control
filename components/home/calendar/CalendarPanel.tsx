"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSystemConfig } from "@/lib/shared-data";
import { buildColorMatcher } from "@/lib/colors";
import {
  RefreshCw, Plus, X,
  CalendarDays, AlignJustify, Columns, Grid3X3,
} from "lucide-react";
import type { CalEvent } from "@/types";
import ListView from "./ListView";
import WeekView from "./WeekView";
import MonthView from "./MonthView";

// ── Types ────────────────────────────────────────────────────────────────────

type CalView = "list" | "week" | "month";

const DEFAULT_EVENT_COLOR = (_title: string) => "var(--accent-muted)";

// ── Component ────────────────────────────────────────────────────────────────

export default function CalendarPanel() {
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

  const eventColor = useMemo<(title: string) => string>(() => {
    if (sharedConfig.calendarColorPatterns) {
      const matcher = buildColorMatcher(sharedConfig.calendarColorPatterns);
      return (title: string) => matcher(title) ?? "var(--accent-muted)";
    }
    return DEFAULT_EVENT_COLOR;
  }, [sharedConfig.calendarColorPatterns]);

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
        {/* Week view */}
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

        {/* Month view */}
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

        {/* List view */}
        {view === "list" && (
          <ListView
            todayEvents={todayEvents}
            weekEvents={weekEvents}
            loading={loading}
            eventColor={eventColor}
            onAction={runCalAction}
          />
        )}
      </div>
    </div>
  );
}
