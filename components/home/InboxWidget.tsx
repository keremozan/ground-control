"use client";
import { useState } from "react";
import { mockInbox } from "@/lib/mock-data";
import { Reply, ClipboardList, Calendar, Archive, Trash2, CornerUpRight, User, GraduationCap, RefreshCw, X } from "lucide-react";

const accountStyle: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  personal: { color: "var(--blue)",  bg: "var(--blue-bg)",  icon: User           },
  school:   { color: "var(--amber)", bg: "var(--amber-bg)", icon: GraduationCap  },
};

const labelColor: Record<string, { color: string; bg: string }> = {
  gallery:    { color: "var(--c-curator)",   bg: "#fdf2f5" },
  exhibition: { color: "var(--c-curator)",   bg: "#fdf2f5" },
  course:     { color: "var(--c-proctor)",   bg: "#fdf4f9" },
  workshop:   { color: "var(--c-proctor)",   bg: "#fdf4f9" },
  admin:      { color: "var(--c-clerk)",     bg: "#fef9f0" },
  bagem:      { color: "var(--c-clerk)",     bg: "#fef9f0" },
  research:   { color: "var(--c-scholar)",   bg: "#f5f3ff" },
  thesis:     { color: "var(--c-scholar)",   bg: "#f5f3ff" },
};

const itemActions = [
  { icon: Reply,         label: "Reply",    colorClass: "item-action-btn-blue"  },
  { icon: ClipboardList, label: "Task",     colorClass: "item-action-btn-green" },
  { icon: Calendar,      label: "Schedule", colorClass: "item-action-btn-blue"  },
  { icon: Archive,       label: "Archive",  colorClass: "item-action-btn-amber" },
  { icon: Trash2,        label: "Delete",   colorClass: "item-action-btn-red"   },
];

export default function InboxWidget() {
  const [actionOutput, setActionOutput] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);

  const runAction = async (action: string, email: { from: string; subject: string; account: string }) => {
    if (isRunning) return;
    setIsRunning(true);
    setActionOutput("");

    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action.toLowerCase(), email }),
      });
      if (!res.body) throw new Error("no body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)/m);
          const dataMatch = part.match(/^data: (.+)/m);
          if (!eventMatch || !dataMatch) continue;
          try {
            const parsed = JSON.parse(dataMatch[1]);
            if (eventMatch[1] === "text") setActionOutput(prev => prev + parsed.text);
            if (eventMatch[1] === "done") setIsRunning(false);
          } catch {}
        }
      }
    } catch {
      setIsRunning(false);
    }
  };

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-header-label">Inbox</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {(["personal", "school"] as const).map((key) => {
            const s = accountStyle[key];
            const Icon = s.icon;
            const data = mockInbox[key];
            return (
              <span key={key} style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
                <Icon size={11} strokeWidth={1.5} style={{ color: s.color }} />
                <span style={{ color: s.color, fontWeight: 600 }}>{data.unread}</span>
              </span>
            );
          })}
          <button className="widget-toolbar-btn" title="Refresh"><RefreshCw size={12} strokeWidth={1.5} /></button>
        </div>
      </div>

      <div className="widget-body" style={{ padding: 0 }}>
        {mockInbox.recent.map((email, i) => {
          const s = accountStyle[email.account];
          const Icon = s.icon;
          return (
            <div
              className="item-row"
              key={i}
              style={{ borderBottom: i < mockInbox.recent.length - 1 ? "1px solid var(--border)" : "none" }}
            >
              <div style={{ padding: "9px 16px 6px", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500,
                    color: "var(--text)", flex: 1, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {email.from}
                  </span>
                  <Icon size={11} strokeWidth={1.5} style={{ color: s.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>
                    {email.time}
                  </span>
                </div>

                <div style={{
                  fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-2)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  marginBottom: email.labels?.length ? 5 : 0,
                }}>
                  {email.subject}
                </div>

                {email.labels?.length > 0 && (
                  <div style={{ display: "flex", gap: 4 }}>
                    {email.labels.map((lbl) => {
                      const lc = labelColor[lbl] ?? { color: "var(--text-3)", bg: "var(--bg)" };
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
              </div>

              <div className="item-actions" style={{ padding: "0 16px 6px" }}>
                {itemActions.map(({ icon: ActionIcon, label, colorClass }) => (
                  <button
                    key={label}
                    className={`item-action-btn ${colorClass}`}
                    title={label}
                    onClick={() => runAction(label, { from: email.from, subject: email.subject, account: email.account })}
                  >
                    <ActionIcon size={12} strokeWidth={1.5} />
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <button className="item-action-btn" title="Sent to Postman" style={{
                  display: "flex", alignItems: "center", gap: 3,
                  fontFamily: "var(--font-mono)", fontSize: 9,
                  width: "auto", padding: "0 5px",
                }}>
                  <CornerUpRight size={9} strokeWidth={1.5} />
                  Postman
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action output panel */}
      {(isRunning || actionOutput) && (
        <div style={{
          borderTop: "1px solid var(--border)",
          background: "var(--cmd-bg)", color: "var(--cmd-text)",
          fontFamily: "var(--font-mono)", fontSize: 10,
          padding: "8px 12px", maxHeight: 120, overflowY: "auto",
          whiteSpace: "pre-wrap", lineHeight: 1.5,
          position: "relative",
        }}>
          {!isRunning && (
            <button
              onClick={() => setActionOutput("")}
              style={{
                position: "absolute", top: 4, right: 4,
                background: "transparent", border: "none", color: "#666",
                cursor: "pointer", padding: 2,
              }}
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          )}
          {isRunning && <span className="led led-on led-pulse" style={{ marginRight: 6 }} />}
          {actionOutput || "Running..."}
        </div>
      )}
    </div>
  );
}
