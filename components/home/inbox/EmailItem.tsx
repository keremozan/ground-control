"use client";
import { memo } from "react";
import {
  ExternalLink, FileText, Reply, ListChecks, Calendar,
  Archive, Trash2, CornerUpRight, User, GraduationCap,
} from "lucide-react";
import { iconForColor } from "@/lib/char-icons";
import { formatWhen, getDateUrgency } from "@/lib/date-format";
import type { Email } from "@/types";

const accountStyle: Record<string, { color: string; icon: React.ElementType }> = {
  personal: { color: "var(--blue)",  icon: User          },
  school:   { color: "var(--amber)", icon: GraduationCap },
};

const itemActions = [
  { icon: ExternalLink, label: "Open",      colorClass: "item-action-btn-blue"  },
  { icon: FileText,     label: "Summarize", colorClass: "item-action-btn-blue"  },
  { icon: Reply,        label: "Reply",     colorClass: "item-action-btn-blue"  },
  { icon: ListChecks,   label: "Task",      colorClass: "item-action-btn-green" },
  { icon: Calendar,     label: "Schedule",  colorClass: "item-action-btn-blue"  },
  { icon: Archive,      label: "Archive",   colorClass: "item-action-btn-amber" },
  { icon: Trash2,       label: "Delete",    colorClass: "item-action-btn-red"   },
];

interface EmailItemProps {
  email: Email;
  isLast: boolean;
  isBusy: boolean;
  emailColor: (from: string, subject: string) => string | null;
  labelStyle: (lbl: string) => { color: string; bg: string };
  onAction: (label: string, email: Email) => void;
  onPostman: (email: Email) => void;
  summarySlot?: React.ReactNode;
  replySlot?: React.ReactNode;
  taskSlot?: React.ReactNode;
}

const EmailItem = memo(function EmailItem({
  email,
  isLast,
  isBusy,
  emailColor,
  labelStyle,
  onAction,
  onPostman,
  summarySlot,
  replySlot,
  taskSlot,
}: EmailItemProps) {
  const accts = email.accounts || [email.account];
  const patternColor = emailColor(email.from, email.subject);
  const crew = patternColor ? iconForColor(patternColor) : null;
  const urgency = getDateUrgency(email.date, "past");

  return (
    <div
      className="item-row"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        opacity: isBusy ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", padding: "8px 14px", gap: 8, cursor: "pointer", alignItems: "flex-start" }}>
        {/* When column */}
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            width: 4, height: 4, borderRadius: "50%",
            background: urgency.dot ? urgency.color : "transparent",
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10,
            color: urgency.color, whiteSpace: "nowrap",
          }}>
            {formatWhen(email.date, true)}
          </span>
        </span>

        {/* Crew icon (from pattern color) or account icon fallback */}
        {crew ? (
          <span style={{ display: "flex", flexShrink: 0, marginTop: 1 }}>
            <crew.Icon size={12} strokeWidth={1.5} style={{ color: crew.color }} />
          </span>
        ) : (() => {
          const acc = accts[0] || email.account;
          const s = accountStyle[acc];
          if (!s) return null;
          const AccIcon = s.icon;
          return (
            <span style={{ display: "flex", flexShrink: 0, position: "relative", top: 1 }}>
              <AccIcon size={12} strokeWidth={1.5} style={{ color: s.color }} />
            </span>
          );
        })()}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Sender row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{
              fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
              color: "var(--text)", flex: 1, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {email.from}
            </span>
            {(email.threadCount ?? 1) > 1 && (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                color: "var(--text-3)", background: "var(--bg-2)",
                padding: "0 4px", borderRadius: 3, lineHeight: "16px",
              }}>
                {email.threadCount}
              </span>
            )}
            {accts.length > 1 && accts.slice(1).map((acc) => {
              const s = accountStyle[acc];
              if (!s) return null;
              const AccIcon = s.icon;
              return <AccIcon key={acc} size={11} strokeWidth={1.5} style={{ color: s.color, flexShrink: 0 }} />;
            })}
          </div>

          {/* Subject */}
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-2)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            marginBottom: email.labels.length > 0 ? 5 : 0,
          }}>
            {email.subject}
          </div>

          {/* Labels */}
          {email.labels.length > 0 && (
            <div style={{ display: "flex", gap: 4 }}>
              {email.labels.map((lbl) => {
                const lc = labelStyle(lbl);
                return (
                  <span key={lbl} style={{
                    fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 500,
                    color: lc.color, background: lc.bg,
                    padding: "1px 5px", borderRadius: 2,
                    textTransform: "uppercase", letterSpacing: "0.04em",
                  }}>
                    {lbl}
                  </span>
                );
              })}
            </div>
          )}

          {/* Action bar */}
          <div className="item-actions" style={{ padding: "4px 0 0 0" }}>
            {itemActions.map(({ icon: ActionIcon, label, colorClass }) => (
              <button
                key={label}
                className={`item-action-btn ${colorClass}`}
                data-tip={label}
                disabled={isBusy}
                onClick={() => onAction(label, email)}
                style={{ cursor: isBusy ? "not-allowed" : "pointer" }}
              >
                <ActionIcon size={12} strokeWidth={1.5} />
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              className="item-action-btn"
              data-tip="Send to Postman"
              disabled={isBusy}
              onClick={() => onPostman(email)}
              style={{
                display: "flex", alignItems: "center", gap: 3,
                fontFamily: "var(--font-mono)", fontSize: 9,
                width: "auto", padding: "0 5px",
                cursor: isBusy ? "not-allowed" : "pointer",
              }}
            >
              <CornerUpRight size={9} strokeWidth={1.5} />
              Postman
            </button>
          </div>
        </div>
      </div>

      {summarySlot}
      {replySlot}
      {taskSlot}
    </div>
  );
});

export default EmailItem;
