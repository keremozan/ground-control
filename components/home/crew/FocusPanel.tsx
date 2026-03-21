"use client";
import { useState, useRef } from "react";
import { resolveIcon } from "@/lib/icon-map";
import { useChatTrigger } from "@/lib/chat-store";
import { SCHEDULE_JOBS, type JobResult } from "@/lib/scheduler";
import { type ActionLogEntry } from "@/lib/action-log";
import { Loader2, Play, X, SlidersHorizontal, Bot, MessageSquare, ListChecks } from "lucide-react";

type ActionInfo = {
  label: string; icon: string; description: string;
  autonomous?: boolean; autonomousInput?: boolean;
  inputPlaceholder?: string; endpoint?: string;
};

type CharacterInfo = {
  id: string; name: string; tier: string; icon: string; color: string;
  domain?: string; actions?: ActionInfo[]; seeds?: Record<string, string>;
  internal?: boolean; parentChar?: string;
};

function groupActionsByPrefix(actions: ActionInfo[]): ActionInfo[][] {
  const auto = actions.filter(a => a.autonomous);
  const interactive = actions.filter(a => !a.autonomous);
  const groups: ActionInfo[][] = [];
  if (interactive.length > 0) groups.push(interactive);
  if (auto.length > 0) groups.push(auto);
  return groups.length > 0 ? groups : [actions];
}

export default function FocusPanel({
  selectedChar, allCharacters, runningActions, recentLogs, lastRuns, runningJobs,
  onDrawerOpen, onTabSwitch, runEndpoint, runAutonomous, handleCharTasks, handleDoNow,
}: {
  selectedChar: CharacterInfo;
  allCharacters?: CharacterInfo[];
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
  const { setTrigger } = useChatTrigger();
  const [contextOn, setContextOn] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem("crew-context-on"); return s ? new Set(JSON.parse(s)) : new Set(); } catch { return new Set(); }
  });
  const [promptAction, setPromptAction] = useState<{
    charName: string; label: string; seed: string;
    type: "chat" | "autonomous" | "endpoint"; placeholder?: string; endpoint?: string;
  } | null>(null);
  const [promptInput, setPromptInput] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const isSelectedBusy = [...runningActions].some(k => k.startsWith(`${selectedChar.name}:`));
  const SelectedIcon = resolveIcon(selectedChar.icon);
  const seeds = selectedChar.seeds || {};
  const actions = selectedChar.actions || [];
  const enabledJobs = SCHEDULE_JOBS.filter(j => j.enabled);
  const charJobs = enabledJobs.filter(j => j.charName === selectedChar.id);
  const charLogs = recentLogs
    .filter(e => e.character?.toLowerCase() === selectedChar.name.toLowerCase())
    .filter((e, i, arr) => i === 0 || e.target !== arr[i - 1].target)
    .slice(0, 4);

  const toggleContext = (charName: string, label: string) => {
    const key = `${charName}:${label}`;
    setContextOn(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem("crew-context-on", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const fireAction = (charName: string, action: ActionInfo, seedPrompt: string) => {
    const key = `${charName}:${action.label}`;
    if (action.autonomousInput || contextOn.has(key)) {
      setPromptAction({
        charName, label: action.label, seed: seedPrompt,
        type: action.endpoint ? "endpoint" : action.autonomousInput ? "autonomous" : "chat",
        placeholder: action.inputPlaceholder, endpoint: action.endpoint,
      });
      setPromptInput("");
      setTimeout(() => promptRef.current?.focus(), 50);
    } else {
      setTrigger({ charName, seedPrompt, action: action.label });
    }
  };

  const submitPrompt = () => {
    if (!promptAction) return;
    const ctx = promptInput.trim();
    const seed = ctx ? `${promptAction.seed}\n\nContext: ${ctx}` : promptAction.seed;
    const { charName, label, type, endpoint } = promptAction;
    setPromptAction(null); setPromptInput("");
    if (type === "endpoint" && endpoint) runEndpoint(charName, label, endpoint, { query: ctx, requestedBy: charName.toLowerCase() });
    else if (type === "autonomous") runAutonomous(charName, label, seed);
    else setTrigger({ charName, seedPrompt: seed, action: label });
  };

  const formatLastRun = (result: JobResult) => {
    const d = new Date(result.timestamp);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${days[d.getDay()]} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  };

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return hrs < 24 ? `${hrs}h` : `${Math.floor(hrs / 24)}d`;
  };

  return (
    <div style={{ border: `1px solid ${selectedChar.color}30`, borderRadius: 7, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: selectedChar.color + "06", borderBottom: actions.length > 0 ? `1px solid ${selectedChar.color}15` : "none" }}>
        <SelectedIcon size={13} strokeWidth={1.5} style={{ color: selectedChar.color, flexShrink: 0, animation: isSelectedBusy ? "pulse-crew 1.5s ease-in-out infinite" : undefined }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--text)" }}>{selectedChar.name}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", marginLeft: 6 }}>{selectedChar.domain || selectedChar.tier}</span>
          {allCharacters && (() => {
            const children = allCharacters.filter(c => c.internal && c.parentChar === selectedChar.id);
            if (children.length === 0) return null;
            return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 10 }}>
                {children.map(child => {
                  const ChildIcon = resolveIcon(child.icon);
                  return (
                    <span key={child.id} title={child.name} style={{
                      display: "inline-flex", alignItems: "center", gap: 3,
                      padding: "1px 5px", borderRadius: 3,
                      border: `1px solid ${child.color}30`,
                      background: child.color + "08",
                    }}>
                      <ChildIcon size={10} strokeWidth={1.5} style={{ color: child.color }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 500, color: child.color, opacity: 0.8 }}>{child.name}</span>
                    </span>
                  );
                })}
              </span>
            );
          })()}
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button onClick={() => setTrigger({ charName: selectedChar.name, seedPrompt: '', action: 'chat', openOnly: true })} data-tip="Open chat" style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 10, color: selectedChar.color, background: selectedChar.color + "12", border: `1px solid ${selectedChar.color}30`, borderRadius: 4, padding: "4px 8px", cursor: "pointer", transition: "all 0.12s" }}>
            <MessageSquare size={10} strokeWidth={1.5} /> Chat
          </button>
          <button onClick={() => handleCharTasks(selectedChar)} disabled={runningActions.has(`${selectedChar.name}:tasks`)} data-tip="Run assigned tasks" style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 10, color: selectedChar.color, background: selectedChar.color + "12", border: `1px solid ${selectedChar.color}30`, borderRadius: 4, padding: "4px 8px", cursor: runningActions.has(`${selectedChar.name}:tasks`) ? "default" : "pointer", opacity: runningActions.has(`${selectedChar.name}:tasks`) ? 0.5 : 1, transition: "all 0.12s" }}>
            {runningActions.has(`${selectedChar.name}:tasks`) ? <Loader2 size={10} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} /> : <ListChecks size={10} strokeWidth={1.5} />} Tasks
          </button>
          <button onClick={() => onDrawerOpen(selectedChar)} data-tip="Details" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 4, background: "transparent", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-3)", transition: "all 0.12s" }} onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")} onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}>
            <SlidersHorizontal size={11} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div style={{ padding: "6px 10px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {groupActionsByPrefix(actions).map((group, gi) => (
              <div key={gi}>
                {gi > 0 && <div style={{ height: 1, background: "var(--border)", margin: "1px 0 3px", opacity: 0.5 }} />}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {group.map((action) => {
                    const seedPrompt = seeds[action.label];
                    const AIcon = resolveIcon(action.icon);
                    const isAuto = action.autonomous === true;
                    const isAutoInput = action.autonomousInput === true;
                    const isDirect = !!action.endpoint;
                    const isRunning = runningActions.has(`${selectedChar.name}:${action.label}`);
                    const ctxKey = `${selectedChar.name}:${action.label}`;
                    const isCtxOn = !isAuto && !(isDirect && !isAutoInput) && contextOn.has(ctxKey);
                    const showCtx = !isAuto && !(isDirect && !isAutoInput);
                    return (
                      <button key={action.label} className="item-action-btn" data-tip={action.description || action.label} disabled={isRunning}
                        onClick={isDirect && !isAutoInput ? () => runEndpoint(selectedChar.name, action.label, action.endpoint!) : seedPrompt || (isDirect && isAutoInput) ? isAuto ? () => runAutonomous(selectedChar.name, action.label, seedPrompt) : () => fireAction(selectedChar.name, action, seedPrompt || '') : undefined}
                        style={{ width: "auto", height: 22, gap: 4, padding: "0 7px 0 5px", opacity: isRunning ? 0.5 : 1, color: selectedChar.color, borderRadius: 3, fontSize: 9, border: `1px solid ${selectedChar.color}22`, background: selectedChar.color + "06" }}>
                        {isRunning ? <Loader2 size={10} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} /> : <AIcon size={10} strokeWidth={1.5} />}
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>{action.label}</span>
                        {showCtx && <span onClick={(e) => { e.stopPropagation(); toggleContext(selectedChar.name, action.label); }} style={{ width: 4, height: 4, borderRadius: "50%", flexShrink: 0, marginLeft: 1, background: isCtxOn ? selectedChar.color : "var(--text-3)", opacity: isCtxOn ? 1 : 0.2, transition: "all 0.15s" }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {promptAction?.charName === selectedChar.name && (
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <textarea ref={promptRef} value={promptInput} onChange={e => setPromptInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitPrompt(); } if (e.key === "Escape") { setPromptAction(null); setPromptInput(""); } }}
                  placeholder={promptAction?.placeholder || "context"} rows={1}
                  style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 8px", color: "var(--text)", outline: "none", resize: "vertical", minHeight: 24, maxHeight: 120, lineHeight: 1.5 }} />
                <button className="item-action-btn item-action-btn-blue" onClick={submitPrompt} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 2, width: "auto", padding: "0 5px", fontFamily: "var(--font-mono)", fontSize: 9, height: 18 }}>
                  <Play size={9} strokeWidth={1.5} /> Go
                </button>
                <button className="item-action-btn" onClick={() => { setPromptAction(null); setPromptInput(""); }} style={{ cursor: "pointer", height: 18 }}>
                  <X size={10} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Jobs & Recent */}
      {(charJobs.length > 0 || charLogs.length > 0) && (
        <div style={{ borderTop: `1px solid ${selectedChar.color}12`, display: "flex", flexDirection: "column", padding: "6px 10px", gap: 4 }}>
          {charJobs.length > 0 && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", marginBottom: 5, letterSpacing: "0.02em" }}>Jobs</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {charJobs.map(job => {
                  const lastResult = lastRuns[job.id];
                  const isRunning = runningJobs.has(job.id);
                  return (
                    <div key={job.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.label}</span>
                      {lastResult && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", flexShrink: 0 }}>{formatLastRun(lastResult)}</span>}
                      <button onClick={() => handleDoNow(job.id)} disabled={isRunning} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, flexShrink: 0, background: "transparent", border: `1px solid ${selectedChar.color}30`, borderRadius: 4, cursor: isRunning ? "default" : "pointer", color: isRunning ? "var(--text-3)" : selectedChar.color }}>
                        {isRunning ? <Loader2 size={9} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={8} strokeWidth={2} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {charLogs.length > 0 && (
            <div style={{ borderTop: charJobs.length > 0 ? "1px solid var(--border)" : "none", paddingTop: charJobs.length > 0 ? 6 : 0 }}>
              <div onClick={() => onTabSwitch("logs")} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", marginBottom: 5, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, letterSpacing: "0.02em" }}>
                Recent <span style={{ opacity: 0.5, fontSize: 10 }}>&#8599;</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {charLogs.map((entry, i) => (
                  <div key={i} onClick={() => onTabSwitch("logs")} style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}>
                    <span style={{ flex: 1, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.target}
                      {entry.detail && entry.detail !== entry.target && <span style={{ marginLeft: 4, color: "var(--text-3)", opacity: 0.7 }}>{entry.detail}</span>}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 9, color: "var(--text-3)" }}>{relativeTime(entry.timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
