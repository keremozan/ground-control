"use client";
import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────

interface SphereHours {
  research: number;
  collegium: number;
  practice: number;
  life: number;
  travel: number;
}

interface CrewEntry {
  name: string;
  color: string;
  totalMs: number;
  sessions: number;
}

interface Alert {
  level: "red" | "orange" | "green";
  text: string;
  detail: string;
}

interface PulseData {
  spheres: { today: SphereHours; week: SphereHours };
  breakdown: Record<string, Record<string, number>>;
  crew: CrewEntry[];
  dayPulse: { planTotal: number | null; planDone: number | null; energy: number | null };
  density: { bookedHours: number; freeHours: number };
  alerts: Alert[];
}

// ── Constants ─────────────────────────────────────

const SPHERE_COLORS: Record<string, string> = {
  practice: "#7c3aed",
  research: "#2563eb",
  collegium: "#f97316",
  life: "#059669",
  travel: "#94a3b8",
};

const SPHERE_ORDER: (keyof SphereHours)[] = ["research", "collegium", "practice", "life", "travel"];

const ALERT_DOT: Record<string, string> = {
  red: "var(--red)",
  orange: "var(--amber)",
  green: "var(--green)",
};

// ── Helpers ───────────────────────────────────────

function formatMs(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatHours(h: number): string {
  if (h === 0) return "0h";
  if (h < 0.1) return "<0.1h";
  return `${h}h`;
}

// ── Sub-components ────────────────────────────────

function SphereBar({ data, label }: { data: SphereHours; label: string }) {
  const total = SPHERE_ORDER.reduce((sum, s) => sum + data[s], 0);
  if (total === 0) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span className="section-label" style={{ width: 40, textTransform: "none", fontSize: 10 }}>{label}</span>
      <div style={{ flex: 1, height: 14, background: "var(--surface-2)", borderRadius: 3 }} />
      <span style={{ fontSize: 10, color: "var(--text-3)", width: 28, textAlign: "right" }}>0h</span>
    </div>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span className="section-label" style={{ width: 40, textTransform: "none", fontSize: 10 }}>{label}</span>
      <div style={{ flex: 1, height: 14, display: "flex", borderRadius: 3, overflow: "hidden" }}>
        {SPHERE_ORDER.filter(s => data[s] > 0).map(s => (
          <div
            key={s}
            style={{
              width: `${(data[s] / total) * 100}%`,
              background: SPHERE_COLORS[s],
              minWidth: 4,
            }}
            title={`${s}: ${formatHours(data[s])}`}
          />
        ))}
      </div>
      <span style={{ fontSize: 10, color: "var(--text-3)", width: 28, textAlign: "right" }}>{formatHours(total)}</span>
    </div>
  );
}

function SphereBreakdown({ breakdown, weekHours }: { breakdown: Record<string, Record<string, number>>; weekHours: SphereHours }) {
  return (
    <div style={{ marginTop: 8 }}>
      {SPHERE_ORDER.filter(s => weekHours[s] > 0).map(sphere => (
        <div key={sphere} style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3 }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%",
            background: SPHERE_COLORS[sphere], flexShrink: 0, marginTop: 2,
          }} />
          <span style={{ fontSize: 11, color: "var(--text)", fontWeight: 500 }}>
            {sphere.charAt(0).toUpperCase() + sphere.slice(1)} {formatHours(weekHours[sphere])}
          </span>
          {breakdown[sphere] && (
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>
              {Object.entries(breakdown[sphere]).map(([label, h], i) => (
                <span key={label}>{i > 0 ? " · " : ""}{label} {formatHours(h)}</span>
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function CrewBars({ crew }: { crew: CrewEntry[] }) {
  if (crew.length === 0) return <div style={{ fontSize: 11, color: "var(--text-3)" }}>No sessions this week</div>;
  const maxMs = crew[0]?.totalMs || 1;

  return (
    <div>
      {crew.map(c => (
        <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%",
            background: c.color, flexShrink: 0,
          }} />
          <span style={{ fontSize: 11, width: 64, flexShrink: 0, color: "var(--text)" }}>{c.name}</span>
          <div style={{ flex: 1, height: 10, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${(c.totalMs / maxMs) * 100}%`, height: "100%", background: c.color, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 10, color: "var(--text-2)", width: 44, textAlign: "right", flexShrink: 0 }}>{formatMs(c.totalMs)}</span>
          <span style={{ fontSize: 9, color: "var(--text-3)", width: 24, textAlign: "right", flexShrink: 0 }}>{c.sessions}x</span>
        </div>
      ))}
    </div>
  );
}

function DayPulseSection({ dayPulse }: { dayPulse: PulseData["dayPulse"] }) {
  const planLabel = dayPulse.planTotal != null && dayPulse.planDone != null
    ? `${dayPulse.planDone}/${dayPulse.planTotal}`
    : "--";
  const planPct = dayPulse.planTotal != null && dayPulse.planDone != null && dayPulse.planTotal > 0
    ? (dayPulse.planDone / dayPulse.planTotal) * 100
    : 0;
  const energyLabel = dayPulse.energy != null ? `${dayPulse.energy}` : "--";

  return (
    <div style={{ display: "flex", gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 4 }}>Plan</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>{planLabel}</div>
        <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${planPct}%`, height: "100%", background: "var(--green)", borderRadius: 2 }} />
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 4 }}>Energy</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", fontFamily: "var(--font-mono)" }}>{energyLabel}</span>
          <span style={{ fontSize: 10, color: "var(--text-3)" }}>/10</span>
        </div>
      </div>
    </div>
  );
}

function DensityBar({ density }: { density: PulseData["density"] }) {
  const total = density.bookedHours + density.freeHours;
  if (total === 0) return null;

  return (
    <div>
      <div style={{ display: "flex", height: 14, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ width: `${(density.bookedHours / total) * 100}%`, background: "var(--text-3)", minWidth: density.bookedHours > 0 ? 4 : 0 }}
          title={`${density.bookedHours}h booked`} />
        <div style={{ width: `${(density.freeHours / total) * 100}%`, background: "var(--green)", opacity: 0.6, minWidth: density.freeHours > 0 ? 4 : 0 }}
          title={`${density.freeHours}h free`} />
      </div>
      <div style={{ fontSize: 10, color: "var(--text-3)" }}>
        {formatHours(density.bookedHours)} booked, <span style={{ color: "var(--green)" }}>{formatHours(density.freeHours)} free</span>
      </div>
    </div>
  );
}

function AlertsList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return <div style={{ fontSize: 11, color: "var(--text-3)" }}>No alerts</div>;

  return (
    <div>
      {alerts.map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%",
            background: ALERT_DOT[a.level], flexShrink: 0, marginTop: 4,
          }} />
          <div>
            <div style={{ fontSize: 11, color: "var(--text)" }}>{a.text}</div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{a.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="section-label" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

// ── Main Component ────────────────────────────────

export default function PulsePanel() {
  const [data, setData] = useState<PulseData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPulse = useCallback(async () => {
    try {
      const res = await fetch("/api/pulse");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to fetch pulse data");
      setData(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  useEffect(() => {
    fetchPulse();
    const interval = setInterval(fetchPulse, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchPulse]);

  if (error) return <div style={{ padding: 12, fontSize: 11, color: "var(--red)" }}>{error}</div>;
  if (!data) return <div style={{ padding: 12, fontSize: 11, color: "var(--text-3)" }}>Loading...</div>;

  return (
    <div style={{ padding: "8px 12px", overflowY: "auto", flex: 1 }}>
      <Section label="Time by Sphere">
        <SphereBar data={data.spheres.today} label="Today" />
        <SphereBar data={data.spheres.week} label="Week" />
        <SphereBreakdown breakdown={data.breakdown} weekHours={data.spheres.week} />
      </Section>

      <Section label="Crew This Week">
        <CrewBars crew={data.crew} />
      </Section>

      <Section label="Day Pulse">
        <DayPulseSection dayPulse={data.dayPulse} />
      </Section>

      <Section label="Calendar Density">
        <DensityBar density={data.density} />
      </Section>

      <Section label="Alerts">
        <AlertsList alerts={data.alerts} />
      </Section>
    </div>
  );
}
