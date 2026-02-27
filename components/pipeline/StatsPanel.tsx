"use client";
import { useState, useEffect } from "react";
import { Activity, Target, AlertTriangle, Zap, BarChart3, Users } from "lucide-react";

const F = "var(--font-mono)";
const mono = (size: number, color: string, weight = 400): React.CSSProperties => ({
  fontFamily: F, fontSize: size, fontWeight: weight, color, lineHeight: 1.4,
});
const T = { section: 11, body: 10, small: 9 } as const;

type Stats = {
  skillCounts: Record<string, number>;
  charActions: Record<string, number>;
  routingAccuracy: number;
  stops: number;
  sendToPostman: number;
  totalActions: number;
};

type TaskStats = {
  total: number;
  overdue: number;
};

function StatCard({ icon: Icon, label, value, color, sub }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}) {
  return (
    <div style={{
      padding: "8px 10px", borderRadius: 5,
      background: color + "06",
      border: `1px solid ${color}15`,
      display: "flex", flexDirection: "column", gap: 3,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Icon size={9} strokeWidth={1.5} style={{ color, flexShrink: 0 }} />
        <span style={mono(8, "var(--text-3)")}>{label}</span>
      </div>
      <span style={mono(16, color, 700)}>{value}</span>
      {sub && <span style={mono(8, "var(--text-3)")}>{sub}</span>}
    </div>
  );
}

export default function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null);

  useEffect(() => {
    fetch("/api/stats").then(r => r.json()).then(d => {
      if (!d.error) setStats(d);
    }).catch(() => {});

    fetch("/api/tana-tasks").then(r => r.json()).then(data => {
      const all = Object.values(data.tasks || {}).flat() as { dueDate?: string }[];
      const today = new Date().toISOString().split("T")[0];
      setTaskStats({
        total: all.length,
        overdue: all.filter(t => t.dueDate && t.dueDate < today).length,
      });
    }).catch(() => {});
  }, []);

  if (!stats && !taskStats) return null;

  const accuracyColor = (stats?.routingAccuracy ?? 100) >= 90
    ? "#10b981" : (stats?.routingAccuracy ?? 100) >= 70 ? "#f59e0b" : "#ef4444";

  // Top 3 skills by invocation count
  const topSkills = stats
    ? Object.entries(stats.skillCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
    : [];

  // Top characters by activity
  const topChars = stats
    ? Object.entries(stats.charActions)
        .filter(([k]) => k !== "system")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : [];

  const maxCharActions = topChars.length > 0 ? topChars[0][1] : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ ...mono(8, "var(--text-3)"), textTransform: "uppercase", letterSpacing: "0.06em" }}>
        System Stats (7d)
      </span>

      {/* Stat cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 6 }}>
        <StatCard icon={Target} label="Routing" value={`${stats?.routingAccuracy ?? 100}%`} color={accuracyColor} />
        <StatCard icon={Activity} label="Actions" value={stats?.totalActions ?? 0} color="#2563eb" />
        <StatCard icon={Zap} label="Tasks" value={taskStats?.total ?? 0} color="#7c3aed"
          sub={taskStats && taskStats.overdue > 0 ? `${taskStats.overdue} overdue` : undefined} />
        <StatCard icon={AlertTriangle} label="Stops" value={stats?.stops ?? 0}
          color={(stats?.stops ?? 0) > 5 ? "#ef4444" : "#64748b"} />
      </div>

      {/* Top skills */}
      {topSkills.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <BarChart3 size={9} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
            <span style={mono(8, "var(--text-3)")}>TOP SKILLS</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {topSkills.map(([name, count]) => (
              <span key={name} style={{
                ...mono(T.small, "var(--text-2)"),
                padding: "1px 5px", borderRadius: 3,
                background: "var(--surface)", border: "1px solid var(--border)",
              }}>
                {name} <span style={{ color: "var(--text-3)" }}>{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Character activity */}
      {topChars.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Users size={9} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />
            <span style={mono(8, "var(--text-3)")}>CHARACTER ACTIVITY</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {topChars.map(([name, count]) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ ...mono(T.small, "var(--text-2)"), width: 60, flexShrink: 0 }}>{name}</span>
                <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--border)" }}>
                  <div style={{
                    width: `${(count / maxCharActions) * 100}%`,
                    height: "100%", borderRadius: 2,
                    background: "var(--text-3)",
                  }} />
                </div>
                <span style={mono(8, "var(--text-3)")}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
