"use client";
import { mockCalendar } from "@/lib/mock-data";
import { Edit2, ClipboardList, Trash2, MapPin, RefreshCw } from "lucide-react";

function eventColor(title: string): string {
  if (/^VA\s/i.test(title)) return "var(--c-proctor)";
  if (/thesis|jury/i.test(title)) return "var(--c-scholar)";
  if (/pilates|yoga|gym/i.test(title)) return "var(--c-coach)";
  if (/meeting|faculty/i.test(title)) return "var(--c-clerk)";
  return "var(--border-2)";
}

const itemActions = [
  { icon: Edit2,         label: "Edit",   colorClass: "item-action-btn-blue"  },
  { icon: ClipboardList, label: "Task",   colorClass: "item-action-btn-green" },
  { icon: Trash2,        label: "Delete", colorClass: "item-action-btn-red"   },
];

export default function CalendarWidget() {
  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-header-label">Calendar</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
            {mockCalendar.today.length} today
          </span>
          <button className="widget-toolbar-btn" title="Refresh"><RefreshCw size={12} strokeWidth={1.5} /></button>
        </div>
      </div>

      <div className="widget-body" style={{ padding: 0 }}>
        {/* Today's events */}
        {mockCalendar.today.map((event, i) => (
          <div
            className="item-row"
            key={i}
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div style={{ display: "flex", alignItems: "stretch", gap: 10, padding: "9px 16px 6px", cursor: "pointer" }}>
              <div style={{ width: 2, background: eventColor(event.title), borderRadius: 1, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", display: "block", marginBottom: 2 }}>
                  {event.time}
                </span>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "var(--text)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2,
                }}>
                  {event.title}
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
            </div>
            <div className="item-actions" style={{ padding: "0 16px 6px" }}>
              {itemActions.map(({ icon: ActionIcon, label, colorClass }) => (
                <button key={label} className={`item-action-btn ${colorClass}`} title={label}>
                  <ActionIcon size={12} strokeWidth={1.5} />
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Upcoming section */}
        <div style={{ padding: "8px 16px 4px" }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
            color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            Upcoming
          </span>
        </div>
        {mockCalendar.upcoming.map((event, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "5px 16px",
            borderTop: "1px solid var(--border)",
          }}>
            <div style={{ width: 2, height: 16, background: eventColor(event.title), borderRadius: 1, flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", width: 54, flexShrink: 0 }}>
              {event.date}
            </span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text)",
              flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {event.title}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>
              {event.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
