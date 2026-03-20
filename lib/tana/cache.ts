import fs from 'fs';
import path from 'path';

// --- Server-side exclusion tracking ---
// When tasks are trashed/done via dashboard, Tana's search index lags (sometimes >5 min).
// We record excluded IDs in a persistent file so getTanaTasks() filters them out immediately.
const EXCLUSION_PATH = path.join(process.cwd(), 'data', 'task-exclusions.json');
const EXCLUSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type ExclusionEntry = { action: 'done' | 'deleted'; ts: number };
export type ExclusionMap = Record<string, ExclusionEntry>;

function loadExclusions(): ExclusionMap {
  try { return JSON.parse(fs.readFileSync(EXCLUSION_PATH, 'utf-8')); } catch { return {}; }
}

function saveExclusions(map: ExclusionMap) {
  fs.mkdirSync(path.dirname(EXCLUSION_PATH), { recursive: true });
  fs.writeFileSync(EXCLUSION_PATH, JSON.stringify(map, null, 2));
}

export function excludeTask(nodeId: string, action: 'done' | 'deleted') {
  const map = loadExclusions();
  map[nodeId] = { action, ts: Date.now() };
  // Prune expired entries
  const cutoff = Date.now() - EXCLUSION_TTL_MS;
  for (const [id, entry] of Object.entries(map)) {
    if (entry.ts < cutoff) delete map[id];
  }
  saveExclusions(map);
}

export function getExcludedIds(): Set<string> {
  const map = loadExclusions();
  const cutoff = Date.now() - EXCLUSION_TTL_MS;
  const ids = new Set<string>();
  for (const [id, entry] of Object.entries(map)) {
    if (entry.ts >= cutoff) ids.add(id);
  }
  return ids;
}
