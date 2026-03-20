"use client";
import { useState, useCallback } from "react";
import { Bug } from "lucide-react";
import { useFetchAPI, useInterval } from "@/hooks";
import HealthDropdown, { type Status } from "./HealthDropdown";
import ChangelogModal, { parseChangelog, type CLVersion } from "./ChangelogModal";
import BugReportModal from "./BugReportModal";

/* ── Constants ───────────────────────────────────────────────── */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ── Component ───────────────────────────────────────────────── */

export default function StatusBar() {
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelog, setChangelog] = useState<CLVersion[] | null>(null);
  const [showBug, setShowBug] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [time, setTime] = useState<Date | null>(null);
  const [version, setVersion] = useState("");

  // Live clock
  useInterval(() => setTime(new Date()), 60_000);

  // Fetch version from changelog (single source of truth)
  useFetchAPI<{ content?: string }>("/api/changelog", {
    transform: (data) => {
      const match = (data.content || "").match(/^## v([\d.]+)/m);
      if (match) setVersion(match[1]);
      return data;
    },
  });

  // Fetch real status with polling
  const { data: status, refetch: refetchStatus } = useFetchAPI<Status>("/api/status", {
    pollInterval: 900_000,
  });

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    await refetchStatus();
    setRetrying(false);
  }, [refetchStatus]);

  const handleRestart = useCallback(async () => {
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
  }, []);

  const openChangelog = useCallback(async () => {
    if (!changelog) {
      const res = await fetch("/api/changelog");
      const data = await res.json();
      const pub = parseChangelog(data.content || "");
      const priv = parseChangelog(data.privateContent || "");
      // Merge: for matching versions (same heading), combine sections.
      const pubMap = new Map(pub.map(v => [v.heading, v]));
      const merged: CLVersion[] = [];
      const usedPub = new Set<string>();
      // Process private versions first (they tend to be newer)
      for (const pr of priv) {
        const match = pubMap.get(pr.heading);
        if (match) {
          merged.push({ heading: pr.heading, sections: [...match.sections, ...pr.sections] });
          usedPub.add(pr.heading);
        } else {
          merged.push(pr);
        }
      }
      // Add remaining public versions
      for (const pv of pub) {
        if (!usedPub.has(pv.heading)) merged.push(pv);
      }
      setChangelog(merged);
    }
    setShowChangelog(true);
  }, [changelog]);

  const dateStr = time ? `${DAY_NAMES[time.getDay()]}  ${time.getDate()} ${MONTH_NAMES[time.getMonth()]}` : "";
  const timeStr = time ? time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

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
          borderRadius: 3, padding: "1px 5px", cursor: "pointer", margin: "0 0 0 8px",
          letterSpacing: "0.02em", whiteSpace: "nowrap", flexShrink: 0,
        }}
      >
        {version ? `v${version}` : "..."}
      </button>

      <div style={{ width: 1, height: 12, background: "var(--border)", margin: "0 10px" }} />

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

      {/* Service health indicators + dropdown */}
      <HealthDropdown
        open={showHealth}
        onToggle={() => setShowHealth(v => !v)}
        onClose={() => setShowHealth(false)}
        status={status}
        onRetry={handleRetry}
        onRestart={handleRestart}
        retrying={retrying}
        restarting={restarting}
      />

      <div style={{ width: 1, height: 12, background: "var(--border)", margin: "0 12px" }} />

      {/* Bug report button */}
      <button
        data-tip="Report a bug"
        onClick={() => setShowBug(true)}
        className="widget-toolbar-btn"
      >
        <Bug size={11} strokeWidth={1.5} />
      </button>

      {/* Changelog modal */}
      <ChangelogModal
        open={showChangelog}
        onClose={() => setShowChangelog(false)}
        changelog={changelog}
      />

      {/* Bug report modal */}
      <BugReportModal
        open={showBug}
        onClose={() => setShowBug(false)}
      />
    </div>
  );
}
