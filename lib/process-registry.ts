import { ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

const PERSISTENCE_PATH = path.join(process.cwd(), 'data', 'active-processes.json');

export type ProcessEntry = {
  id: string;
  pid: number;
  charName: string;
  label: string;
  jobId?: string;
  startedAt: string;
};

type InternalEntry = ProcessEntry & { proc: ChildProcess };

// Module-level map — persists across requests within same Node.js process
const registry = new Map<string, InternalEntry>();

// --- Persistence (survives hot reloads) ---

type PersistedEntry = Omit<ProcessEntry, 'pid'> & { pid: number };

function persist() {
  const entries: PersistedEntry[] = [];
  for (const e of registry.values()) {
    entries.push({ id: e.id, pid: e.pid, charName: e.charName, label: e.label, jobId: e.jobId, startedAt: e.startedAt });
  }
  try {
    fs.mkdirSync(path.dirname(PERSISTENCE_PATH), { recursive: true });
    fs.writeFileSync(PERSISTENCE_PATH, JSON.stringify(entries, null, 2));
  } catch {}
}

function loadPersistedOrphans(): PersistedEntry[] {
  try {
    const entries: PersistedEntry[] = JSON.parse(fs.readFileSync(PERSISTENCE_PATH, 'utf-8'));
    // Filter to PIDs that are still alive but not in our in-memory registry
    return entries.filter(e => {
      if (registry.has(e.id)) return false;
      try { process.kill(e.pid, 0); return true; } catch { return false; }
    });
  } catch { return []; }
}

// --- Public API ---

let counter = 0;

export function registerProcess(proc: ChildProcess, meta: {
  charName: string;
  label: string;
  jobId?: string;
}): string {
  const id = `proc-${Date.now()}-${++counter}`;
  const pid = proc.pid!;
  const entry: InternalEntry = {
    id, pid,
    charName: meta.charName,
    label: meta.label,
    jobId: meta.jobId,
    startedAt: new Date().toISOString(),
    proc,
  };
  registry.set(id, entry);
  persist();

  // Auto-unregister when process exits
  const cleanup = () => {
    registry.delete(id);
    persist();
  };
  proc.on('close', cleanup);
  proc.on('error', cleanup);

  return id;
}

export function listProcesses(): ProcessEntry[] {
  // Merge in-memory + any orphaned PIDs from file (post hot-reload)
  const result: ProcessEntry[] = [];
  for (const e of registry.values()) {
    result.push({ id: e.id, pid: e.pid, charName: e.charName, label: e.label, jobId: e.jobId, startedAt: e.startedAt });
  }
  // Add orphans (processes from before a hot reload that are still running)
  for (const orphan of loadPersistedOrphans()) {
    result.push(orphan);
  }
  return result;
}

export function killProcess(id: string): boolean {
  const entry = registry.get(id);
  if (entry) {
    try { entry.proc.kill('SIGTERM'); } catch {}
    // Force kill after 5 seconds if still alive
    setTimeout(() => {
      try { entry.proc.kill('SIGKILL'); } catch {}
    }, 5000);
    registry.delete(id);
    persist();
    return true;
  }

  // Check orphaned processes from file
  const orphans = loadPersistedOrphans();
  const orphan = orphans.find(o => o.id === id);
  if (orphan) {
    try { process.kill(orphan.pid, 'SIGTERM'); } catch {}
    setTimeout(() => {
      try { process.kill(orphan.pid, 'SIGKILL'); } catch {}
    }, 5000);
    // Remove from persisted file
    try {
      const all: PersistedEntry[] = JSON.parse(fs.readFileSync(PERSISTENCE_PATH, 'utf-8'));
      fs.writeFileSync(PERSISTENCE_PATH, JSON.stringify(all.filter(e => e.id !== id), null, 2));
    } catch {}
    return true;
  }

  return false;
}
