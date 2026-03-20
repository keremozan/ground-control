"use client";
import { useState } from "react";
import { resolveIcon } from "@/lib/icon-map";
import { type ActionLogEntry } from "@/lib/action-log";
import { type JobResult } from "@/lib/scheduler";
import { Loader2 } from "lucide-react";
import FocusPanel from "./FocusPanel";

type ActionInfo = {
  label: string; icon: string; description: string;
  autonomous?: boolean; autonomousInput?: boolean;
  inputPlaceholder?: string; endpoint?: string;
};

type CharacterInfo = {
  id: string; name: string; tier: string; icon: string; color: string;
  domain?: string; groups?: string[];
  actions?: ActionInfo[]; seeds?: Record<string, string>;
  skills?: string[]; routingKeywords?: string[]; sharedKnowledge?: string[];
};

const CREW_FILTERS: { label: string; ids: string[] }[] = [
  { label: "Research", ids: ["scholar", "scribe", "prober", "auditor", "curator"] },
  { label: "Teaching", ids: ["proctor", "scribe"] },
  { label: "Admin", ids: ["clerk", "steward", "archivist", "postman"] },
  { label: "Personal", ids: ["coach", "doctor", "tutor"] },
  { label: "System", ids: ["architect", "engineer", "watcher", "kybernetes", "oracle"] },
];

export default function CharacterGrid({
  characters, runningActions, recentLogs, lastRuns, runningJobs,
  onDrawerOpen, onTabSwitch, runEndpoint, runAutonomous, handleCharTasks, handleDoNow,
}: {
  characters: CharacterInfo[];
  runningActions: Set<string>;
  recentLogs: ActionLogEntry[];
  lastRuns: Record<string, JobResult>;
  runningJobs: Set<string>;
  onDrawerOpen: (char: CharacterInfo) => void;
  onTabSwitch: (tab: string) => void;
  runEndpoint: (charName: string, action: string, endpoint: string, body?: Record<string, unknown>) => void;
  runAutonomous: (charName: string, action: string, seedPrompt: string) => void;
  handleCharTasks: (char: CharacterInfo) => void;
  handleDoNow: (jobId: string) => void;
}) {
  const [selectedCharId, setSelectedCharId] = useState<string>(() => {
    try { return localStorage.getItem("crew-selected-char") || ""; } catch { return ""; }
  });
  const [crewFilter, setCrewFilter] = useState<string | null>(null);

  const selectChar = (id: string) => {
    setSelectedCharId(id);
    try { localStorage.setItem("crew-selected-char", id); } catch {}
  };

  const selectedChar = characters.find(c => c.id === selectedCharId) || characters[0] || null;
  const activeFilter = CREW_FILTERS.find(f => f.label === crewFilter);
  const filtered = activeFilter ? characters.filter(c => activeFilter.ids.includes(c.id)) : characters;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Filter pills */}
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        <button onClick={() => setCrewFilter(null)} style={{
          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 500,
          color: crewFilter === null ? "var(--text)" : "var(--text-3)",
          background: crewFilter === null ? "var(--bg-2)" : "transparent",
          border: `1px solid ${crewFilter === null ? "var(--border)" : "transparent"}`,
          borderRadius: 3, padding: "1px 6px", cursor: "pointer",
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>All</button>
        {CREW_FILTERS.map(f => (
          <button key={f.label} onClick={() => setCrewFilter(crewFilter === f.label ? null : f.label)} style={{
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 500,
            color: crewFilter === f.label ? "var(--text)" : "var(--text-3)",
            background: crewFilter === f.label ? "var(--bg-2)" : "transparent",
            border: `1px solid ${crewFilter === f.label ? "var(--border)" : "transparent"}`,
            borderRadius: 3, padding: "1px 6px", cursor: "pointer",
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>{f.label}</button>
        ))}
      </div>

      {/* Roster grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 2 }}>
        {filtered.map(char => {
          const Icon = resolveIcon(char.icon);
          const isSelected = selectedChar?.id === char.id;
          const charBusy = [...runningActions].some(k => k.startsWith(`${char.name}:`));
          const hasRecentLog = recentLogs.some(e => e.character?.toLowerCase() === char.name.toLowerCase());
          return (
            <button key={char.id} onClick={() => selectChar(char.id)} style={{
              display: "flex", alignItems: "center", gap: 4, padding: "3px 5px",
              border: `1px solid ${isSelected ? char.color + "55" : "var(--border)"}`,
              borderRadius: 4, background: isSelected ? char.color + "0e" : "transparent",
              cursor: "pointer", transition: "all 0.12s", overflow: "hidden",
            }}>
              {charBusy
                ? <Loader2 size={9} strokeWidth={2} style={{ color: char.color, animation: "spin 1s linear infinite", flexShrink: 0 }} />
                : <Icon size={9} strokeWidth={1.5} style={{ color: char.color, flexShrink: 0, opacity: (charBusy || hasRecentLog) ? 1 : 0.5 }} />
              }
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                color: isSelected ? char.color : "var(--text-2)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{char.name}</span>
            </button>
          );
        })}
      </div>

      {/* Selected character focus panel */}
      {selectedChar && (
        <FocusPanel
          selectedChar={selectedChar}
          runningActions={runningActions}
          recentLogs={recentLogs}
          lastRuns={lastRuns}
          runningJobs={runningJobs}
          onDrawerOpen={onDrawerOpen}
          onTabSwitch={onTabSwitch}
          runEndpoint={runEndpoint}
          runAutonomous={runAutonomous}
          handleCharTasks={handleCharTasks}
          handleDoNow={handleDoNow}
        />
      )}
    </div>
  );
}
