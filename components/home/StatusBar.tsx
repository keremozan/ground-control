"use client";
import Link from "next/link";
import { mockHealth, mockWeather } from "@/lib/mock-data";
import { Mail, Database, CalendarDays, MessageCircle, HardDrive, Cloud, Sun, CloudRain, Bug, type LucideIcon } from "lucide-react";

const serverIcon: Record<string, LucideIcon> = {
  Tana:     Database,
  Gmail:    Mail,
  Calendar: CalendarDays,
  WhatsApp: MessageCircle,
  Drive:    HardDrive,
};

const weatherIcon: Record<string, LucideIcon> = {
  cloud: Cloud,
  sun:   Sun,
  rain:  CloudRain,
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function StatusBar({ activePage = "home" }: { activePage?: "home" | "pipeline" }) {
  const d = new Date(2026, 1, 23);
  const dateStr = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  const WIcon = weatherIcon[mockWeather.icon] || Cloud;

  return (
    <div className="widget" style={{
      flexDirection: "row", alignItems: "center",
      padding: "0 16px", gap: 0, height: "100%",
    }}>

      {/* Brand */}
      <span style={{
        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13,
        color: "var(--text)", letterSpacing: "0.01em", marginRight: 16,
        whiteSpace: "nowrap", flexShrink: 0,
      }}>
        GROUND CONTROL
      </span>

      {/* Nav links */}
      <Link href="/" style={{
        fontFamily: "var(--font-body)", fontSize: 12, textDecoration: "none",
        color: activePage === "home" ? "var(--text-2)" : "var(--text-3)",
        cursor: "pointer", marginRight: 12, whiteSpace: "nowrap", flexShrink: 0,
      }}>
        Home
      </Link>
      <Link href="/pipeline" style={{
        fontFamily: "var(--font-body)", fontSize: 12, textDecoration: "none",
        color: activePage === "pipeline" ? "var(--text-2)" : "var(--text-3)",
        cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
      }}>
        Pipeline
      </Link>

      <div style={{ width: 1, height: 12, background: "var(--border)", margin: "0 16px" }} />

      {/* Date */}
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
        color: "var(--text)", letterSpacing: "0.01em", whiteSpace: "nowrap", flexShrink: 0,
      }}>
        {dateStr}
      </span>

      <div style={{ width: 1, height: 12, background: "var(--border)", margin: "0 12px" }} />

      {/* Weather */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <WIcon size={13} strokeWidth={1.5} style={{ color: "var(--text-2)" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)" }}>
          {mockWeather.temp}{mockWeather.unit}
        </span>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-3)" }}>
          {mockWeather.condition}
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Last cycle */}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", letterSpacing: "0.02em", whiteSpace: "nowrap", flexShrink: 0 }}>
        cycle {mockHealth.lastCycle}
      </span>

      <div style={{ width: 1, height: 12, background: "var(--border)", margin: "0 14px" }} />

      {/* MCP server health */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {mockHealth.mcpServers.map(s => {
          const SIcon = serverIcon[s.name] || Database;
          const ok = s.status === "connected";
          return (
            <div key={s.name} title={`${s.name}: ${s.status}`}
              style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <SIcon size={12} strokeWidth={1.5} style={{ color: ok ? "var(--text-2)" : "var(--text-3)" }} />
              <span style={{
                width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                background: ok ? "var(--led-green)" : "var(--led-red)",
                boxShadow: ok ? "0 0 4px var(--led-green)" : "none",
              }} />
            </div>
          );
        })}
      </div>

      <div style={{ width: 1, height: 12, background: "var(--border)", margin: "0 14px" }} />

      {/* Bug report */}
      <button title="Report a bug" style={{
        width: 24, height: 24,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "transparent", border: "none", color: "var(--text-3)",
        cursor: "pointer", borderRadius: 3,
      }}>
        <Bug size={12} strokeWidth={1.5} />
      </button>
    </div>
  );
}
