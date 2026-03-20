"use client";
import { useRef } from "react";
import { Mail, CalendarDays, Monitor, RefreshCw, RotateCw, LayoutDashboard } from "lucide-react";
import TanaIcon from "@/components/icons/TanaIcon";
import { useClickOutside } from "@/hooks";

/* ── Types ───────────────────────────────────────────────────── */

export type Status = {
  tana: boolean;
  gmail: { personal: boolean; school: boolean };
  calendar: boolean;
  playwright: boolean;
  miro: boolean;
  lastCycle: string | null;
};

/* ── ServiceDot ──────────────────────────────────────────────── */

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

/* ── Props ───────────────────────────────────────────────────── */

interface HealthDropdownProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  status: Status | null;
  onRetry: () => void;
  onRestart: () => void;
  retrying: boolean;
  restarting: boolean;
}

/* ── Component ───────────────────────────────────────────────── */

export default function HealthDropdown({
  open,
  onToggle,
  onClose,
  status,
  onRetry,
  onRestart,
  retrying,
  restarting,
}: HealthDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, onClose);

  const gmailOk = status ? (status.gmail.personal && status.gmail.school) : null;
  const gmailPartial = status ? (status.gmail.personal || status.gmail.school) && !gmailOk : false;
  const allOk = status ? (status.tana && gmailOk && status.calendar && status.playwright && status.miro) : null;

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        onClick={onToggle}
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
      </button>

      {/* Health detail dropdown */}
      {open && (
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
              onClick={onRetry}
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
              onClick={onRestart}
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
  );
}
