"use client";
import { Loader2, ExternalLink, ListChecks, Trash2, MapPin } from "lucide-react";
import { iconForColor } from "@/lib/char-icons";
import { formatCalendarWhen } from "@/lib/date-format";
import type { CalEvent } from "@/types";
import { timeOfDayIcon, isPast, isCurrent } from "./helpers";

// ── Constants ────────────────────────────────────────────────────────────────

const itemActions = [
  { icon: ExternalLink, label: "Open",   colorClass: "item-action-btn-blue"  },
  { icon: ListChecks,   label: "Task",   colorClass: "item-action-btn-green" },
  { icon: Trash2,       label: "Delete", colorClass: "item-action-btn-red"   },
];

// ── Props ────────────────────────────────────────────────────────────────────

interface ListViewProps {
  todayEvents: CalEvent[];
  weekEvents: CalEvent[];
  loading: boolean;
  eventColor: (title: string) => string;
  onAction: (action: string, event: CalEvent) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ListView({
  todayEvents,
  weekEvents,
  loading,
  eventColor,
  onAction,
}: ListViewProps) {
  if (loading && todayEvents.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 20, gap: 8 }}>
        <Loader2 size={14} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>Loading calendar...</span>
      </div>
    );
  }

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
                    onAction(label.toLowerCase(), event);
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

  const renderCompact = (event: CalEvent, i: number, dimmed = false) => (
    <div key={event.id} style={{
      display: "flex", alignItems: "center", gap: 0, padding: "5px 10px 5px 16px",
      borderTop: i > 0 ? "1px solid var(--border)" : undefined,
      opacity: dimmed ? 0.45 : undefined,
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
  );

  return (
    <>
      {past.length > 0 && (
        <>
          {sectionLabel("Earlier")}
          {past.map((event, i) => renderCompact(event, i, true))}
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
          {weekEvents.map((event, i) => renderCompact(event, i, false))}
        </>
      )}

      {!loading && todayEvents.length === 0 && weekEvents.length === 0 && (
        <div style={{ padding: "16px", textAlign: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>No events</span>
        </div>
      )}
    </>
  );
}
