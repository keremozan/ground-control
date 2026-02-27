export type ActionLogEntry = {
  timestamp: string;
  widget: "inbox" | "tasks" | "chat" | "crew" | "calendar" | "scheduler" | "bug";
  action: string;
  target: string;
  character?: string;
  detail?: string;
  jobId?: string;
};

const STORAGE_KEY = "gc-action-log";
const MAX_ENTRIES = 200;

// Client-side log buffer (shown in pipeline page)
let logBuffer: ActionLogEntry[] = [];
const listeners: Set<() => void> = new Set();

// Hydrate from localStorage on module load
if (typeof window !== "undefined") {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) logBuffer = JSON.parse(saved);
  } catch {}
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logBuffer));
  } catch {}
}

export function logAction(entry: Omit<ActionLogEntry, "timestamp">) {
  const full: ActionLogEntry = { ...entry, timestamp: new Date().toISOString() };
  logBuffer = [full, ...logBuffer].slice(0, MAX_ENTRIES);

  // Persist to localStorage
  persist();

  // Notify subscribers
  listeners.forEach(fn => fn());

  // Fire-and-forget to server
  fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(full),
  }).catch(() => {});
}

export function getLog(): ActionLogEntry[] {
  return logBuffer;
}

export function clearLog() {
  logBuffer = [];
  persist();
  listeners.forEach(fn => fn());
}

export function subscribeLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
