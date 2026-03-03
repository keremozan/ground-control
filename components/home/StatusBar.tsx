"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Bug, X, Mail, CalendarDays, Monitor, RefreshCw, RotateCw, LayoutDashboard, ListChecks } from "lucide-react";
import { logAction } from "@/lib/action-log";
import TanaIcon from "@/components/icons/TanaIcon";
import pkg from "@/package.json";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Status = {
  tana: boolean;
  gmail: { personal: boolean; school: boolean };
  calendar: boolean;
  playwright: boolean;
  miro: boolean;
  tasks: boolean;
  lastCycle: string | null;
};

/* ── Structured changelog types + parser ────────────────────── */

type CLItem = {
  type: "new" | "improved" | "fixed" | "other";
  text: string;
};

type CLSection = {
  area: string;
  items: CLItem[];
};

type CLVersion = {
  heading: string;
  sections: CLSection[];
};

const TYPE_MAP: Record<string, CLItem["type"]> = {
  new: "new", fix: "fixed", fixed: "fixed", improved: "improved",
};

function parseChangelog(raw: string): CLVersion[] {
  const versions: CLVersion[] = [];
  let cur: CLVersion | null = null;
  let section: CLSection | null = null;

  for (const line of raw.split("\n")) {
    if (line.startsWith("## ")) {
      if (section && cur) cur.sections.push(section);
      if (cur) versions.push(cur);
      cur = { heading: line.replace("## ", ""), sections: [] };
      section = null;
      continue;
    }
    if (line.startsWith("### ") && cur) {
      if (section) cur.sections.push(section);
      section = { area: line.replace("### ", ""), items: [] };
      continue;
    }
    if (line.startsWith("- ") && section) {
      const text = line.slice(2).trim();
      const tag = text.match(/^\[(new|fix|fixed|improved)\]\s*/i);
      if (tag) {
        section.items.push({ type: TYPE_MAP[tag[1].toLowerCase()] || "other", text: text.slice(tag[0].length) });
      } else {
        section.items.push({ type: "other", text });
      }
    }
  }
  if (section && cur) cur.sections.push(section);
  if (cur) versions.push(cur);
  return versions;
}

const TYPE_DOT: Record<string, string> = {
  new: "#22c55e",
  improved: "#3b82f6",
  fixed: "#f59e0b",
  other: "#94a3b8",
};

/* ── ServiceDot ─────────────────────────────────────────────── */

function ServiceDot({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <span
      data-tip={label}
      style={{
        width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
        background: ok === null
          ? "var(--led-amber)"
          : ok ? "var(--led-green)" : "var(--led-red)",
        boxShadow: ok ? "0 0 4px var(--led-green)" : "none",
      }}
    />
  );
}

/* ── StatusBar ──────────────────────────────────────────────── */

export default function StatusBar({ activePage = "home" }: { activePage?: "home" | "pipeline" }) {
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelog, setChangelog] = useState<CLVersion[] | null>(null);
  const [showBug, setShowBug] = useState(false);
  const [bugText, setBugText] = useState("");
  const [bugSent, setBugSent] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [time, setTime] = useState(() => new Date());
  const [showHealth, setShowHealth] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const bugRef = useRef<HTMLTextAreaElement>(null);
  const healthRef = useRef<HTMLDivElement>(null);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Fetch real status
  const fetchStatus = useCallback(() => {
    fetch("/api/status").then(r => r.json()).then(setStatus).catch(() => {});
  }, []);
  useEffect(() => { fetchStatus(); const t = setInterval(fetchStatus, 900_000); return () => clearInterval(t); }, [fetchStatus]);

  // Close health dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (healthRef.current && !healthRef.current.contains(e.target as Node)) setShowHealth(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    await fetch("/api/status").then(r => r.json()).then(setStatus).catch(() => {});
    setRetrying(false);
  };

  const handleRestart = async () => {
    setRestarting(true);
    try { await fetch("/api/restart", { method: "POST" }); } catch {}
    // Poll until server is back
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        const r = await fetch("/api/status");
        if (r.ok) { window.location.reload(); return; }
      } catch {}
    }
    setRestarting(false);
  };

  const openChangelog = async () => {
    if (!changelog) {
      const res = await fetch("/api/changelog");
      const data = await res.json();
      setChangelog(parseChangelog(data.content || ""));
    }
    setShowChangelog(true);
  };

  const submitBug = async () => {
    if (!bugText.trim()) return;
    logAction({
      widget: "bug",
      action: "report",
      target: bugText.trim().slice(0, 200),
      detail: bugText.trim(),
    });
    setBugSent(true);
    setTimeout(() => { setShowBug(false); setBugText(""); setBugSent(false); }, 1200);
  };

  const d = time;
  const dateStr = `${DAY_NAMES[d.getDay()]}  ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  const timeStr = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  // Derived health states
  const gmailOk = status ? (status.gmail.personal && status.gmail.school) : null;
  const gmailPartial = status ? (status.gmail.personal || status.gmail.school) && !gmailOk : false;
  const allOk = status ? (status.tana && gmailOk && status.calendar && status.playwright && status.miro && status.tasks) : null;

  const navStyle = (page: string) => ({
    fontFamily: "var(--font-body)" as const,
    fontSize: 11,
    fontWeight: activePage === page ? 600 : 400,
    textDecoration: "none" as const,
    color: activePage === page ? "var(--text)" : "var(--text-3)",
    cursor: "pointer" as const,
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
    padding: "2px 8px",
    borderRadius: 3,
    background: activePage === page ? "var(--bg)" : "transparent",
    transition: "all 0.12s",
  });

  return (
    <div className="widget" style={{
      flexDirection: "row", alignItems: "center",
      padding: "0 14px", gap: 0, height: "100%",
      overflow: "visible",
    }}>

      {/* Brand + version */}
      <span style={{
        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12,
        color: "var(--text)", letterSpacing: "0.02em",
        whiteSpace: "nowrap", flexShrink: 0,
      }}>
        GROUND CONTROL
      </span>
      <button
        onClick={openChangelog}
        style={{
          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 500,
          color: "var(--text-3)", background: "transparent", border: "1px solid var(--border)",
          borderRadius: 3, padding: "1px 5px", cursor: "pointer", margin: "0 14px 0 8px",
          letterSpacing: "0.02em", whiteSpace: "nowrap", flexShrink: 0,
        }}
      >
        v{pkg.version}
      </button>

      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Link href="/" style={navStyle("home")}>Home</Link>
      </div>

      <div style={{ width: 1, height: 12, background: "var(--border)", margin: "0 14px" }} />

      {/* Date + time */}
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
        color: "var(--text)", whiteSpace: "nowrap", flexShrink: 0,
      }}>
        {dateStr}
      </span>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 11,
        color: "var(--text-3)", marginLeft: 8, whiteSpace: "nowrap", flexShrink: 0,
      }}>
        {timeStr}
      </span>

      <div style={{ flex: 1 }} />

      {/* Last cycle */}
      {status?.lastCycle && (
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: "var(--text-3)", letterSpacing: "0.02em",
          whiteSpace: "nowrap", flexShrink: 0,
        }}>
          cycle {status.lastCycle}
        </span>
      )}

      <div style={{ width: 1, height: 12, background: "var(--border)", margin: "0 12px" }} />

      {/* Service health indicators */}
      <div ref={healthRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <button
          onClick={() => setShowHealth(v => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px",
          }}
        >
          {/* Tana */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }} data-tip="Tana MCP">
            <TanaIcon size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
            <ServiceDot ok={status?.tana ?? null} label="Tana" />
          </div>
          {/* Gmail */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }} data-tip="Gmail">
            <Mail size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
            <span style={{
              width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
              background: status === null
                ? "var(--led-amber)"
                : gmailOk ? "var(--led-green)" : gmailPartial ? "var(--led-amber)" : "var(--led-red)",
              boxShadow: gmailOk ? "0 0 4px var(--led-green)" : "none",
            }} />
          </div>
          {/* Calendar */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }} data-tip="Google Calendar">
            <CalendarDays size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
            <ServiceDot ok={status?.calendar ?? null} label="Calendar" />
          </div>
          {/* Playwright */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }} data-tip="Playwright">
            <Monitor size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
            <ServiceDot ok={status?.playwright ?? null} label="Playwright" />
          </div>
          {/* Miro */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }} data-tip="Miro">
            <LayoutDashboard size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
            <ServiceDot ok={status?.miro ?? null} label="Miro" />
          </div>
          {/* Google Tasks */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }} data-tip="Google Tasks">
            <ListChecks size={10} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
            <ServiceDot ok={status?.tasks ?? null} label="Google Tasks" />
          </div>
        </button>

        {/* Health detail dropdown */}
        {showHealth && (
          <div style={{
            position: "absolute", top: 28, right: 0, zIndex: 200,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            padding: "10px 14px", minWidth: 200,
          }}>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 600,
              color: "var(--text)", marginBottom: 8, textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}>
              Service Health
            </div>
            {[
              { name: "Tana MCP", ok: status?.tana ?? null },
              { name: "Gmail (personal)", ok: status?.gmail.personal ?? null },
              { name: "Gmail (school)", ok: status?.gmail.school ?? null },
              { name: "Google Calendar", ok: status?.calendar ?? null },
              { name: "Playwright", ok: status?.playwright ?? null },
              { name: "Miro", ok: status?.miro ?? null },
              { name: "Google Tasks", ok: status?.tasks ?? null },
            ].map(svc => (
              <div key={svc.name} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "4px 0",
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)" }}>
                  {svc.name}
                </span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
                  color: svc.ok === null ? "var(--text-3)" : svc.ok ? "var(--led-green)" : "var(--led-red)",
                }}>
                  {svc.ok === null ? "..." : svc.ok ? "OK" : "DOWN"}
                </span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6, display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={handleRetry}
                disabled={retrying}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--blue)",
                  background: "transparent", border: "none", cursor: retrying ? "default" : "pointer",
                  padding: 0, opacity: retrying ? 0.5 : 1,
                }}
              >
                <RefreshCw size={9} strokeWidth={1.5} style={{
                  animation: retrying ? "spin 1s linear infinite" : "none",
                }} />
                {retrying ? "Checking..." : "Retry all"}
              </button>
              <button
                onClick={handleRestart}
                disabled={restarting}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)",
                  background: "transparent", border: "none", cursor: restarting ? "default" : "pointer",
                  padding: 0, opacity: restarting ? 0.5 : 1,
                }}
              >
                <RotateCw size={9} strokeWidth={1.5} style={{
                  animation: restarting ? "spin 1s linear infinite" : "none",
                }} />
                {restarting ? "Restarting..." : "Restart server"}
              </button>
            </div>
            {allOk === false && !restarting && (
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-3)",
                marginTop: 6, lineHeight: 1.4,
              }}>
                Down services may need token refresh or server restart.
              </div>
            )}
            {restarting && (
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--blue)",
                marginTop: 6, lineHeight: 1.4,
              }}>
                Server restarting. Page will reload automatically...
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 12, background: "var(--border)", margin: "0 12px" }} />

      {/* Bug report */}
      <button
        data-tip="Report a bug"
        onClick={() => { setShowBug(true); setTimeout(() => bugRef.current?.focus(), 50); }}
        className="widget-toolbar-btn"
      >
        <Bug size={11} strokeWidth={1.5} />
      </button>

      {/* Changelog modal */}
      {showChangelog && (
        <div
          onClick={() => setShowChangelog(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.4)", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--surface)", borderRadius: 10,
              border: "1px solid var(--border)",
              width: 480, maxHeight: "75vh", overflow: "auto",
              padding: "20px 24px",
            }}
          >
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
              color: "var(--text-3)", letterSpacing: "0.5px", textTransform: "uppercase",
              marginBottom: 16,
            }}>
              Changelog
            </div>
            {changelog ? changelog.map((ver, vi) => (
              <div key={vi} style={{ marginBottom: vi < changelog.length - 1 ? 20 : 0 }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
                  color: "var(--text)", marginBottom: 10,
                  paddingBottom: 5, borderBottom: "1px solid var(--border)",
                }}>
                  {ver.heading}
                </div>
                {ver.sections.map((sec, si) => (
                  <div key={si} style={{ marginBottom: 10 }}>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600,
                      color: "var(--text-2)", marginBottom: 3,
                    }}>
                      {sec.area}
                    </div>
                    {sec.items.map((item, ii) => (
                      <div key={ii} style={{
                        display: "flex", alignItems: "baseline", gap: 6,
                        fontFamily: "var(--font-mono)", fontSize: 10.5,
                        color: "var(--text-3)", lineHeight: 1.7,
                        paddingLeft: 2,
                      }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                          background: TYPE_DOT[item.type] || TYPE_DOT.other,
                          display: "inline-block", position: "relative", top: -1,
                        }} />
                        {item.text}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )) : (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
                Loading...
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bug report modal */}
      {showBug && (
        <div
          onClick={() => { setShowBug(false); setBugText(""); }}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.4)", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--surface)", borderRadius: 8,
              border: "1px solid var(--border)",
              width: 420, padding: "20px 24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                Report a bug
              </span>
              <button
                onClick={() => { setShowBug(false); setBugText(""); }}
                style={{
                  background: "transparent", border: "none", color: "var(--text-3)",
                  cursor: "pointer", padding: 2,
                }}
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
            <textarea
              ref={bugRef}
              value={bugText}
              onChange={e => setBugText(e.target.value)}
              placeholder="What went wrong?"
              rows={4}
              style={{
                width: "100%", resize: "vertical",
                fontFamily: "var(--font-body)", fontSize: 12,
                color: "var(--text)", background: "var(--bg)",
                border: "1px solid var(--border)", borderRadius: 4,
                padding: "8px 10px", outline: "none", lineHeight: 1.5,
              }}
              onKeyDown={e => { if (e.key === "Enter" && e.metaKey) submitBug(); }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)" }}>
                Logged to Architect watcher
              </span>
              <button
                className="calc-btn calc-btn-sm"
                onClick={submitBug}
                disabled={!bugText.trim() || bugSent}
                style={{ opacity: bugText.trim() && !bugSent ? 1 : 0.5 }}
              >
                {bugSent ? "Sent" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
