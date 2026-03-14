import fs from 'fs';
import path from 'path';
import { CHARACTERS_DIR } from './config';

export type Character = {
  id: string;
  name: string;
  tier: 'core' | 'meta' | 'stationed';
  color: string;
  domain?: string;
  defaultModel?: string;
  systemPrompt?: string;
  skills?: string[];
  modifiers?: string[];
  sharedKnowledge?: string[];
  knowledgeFile?: string;
  memory: string;
  icon?: string;
  actions?: { label: string; icon: string; description: string; autonomous?: boolean }[];
  outputs?: string[];
  gates?: string[];
  seeds?: Record<string, string>;
  suggestions?: string[];
  canSpawn?: string[];
  trackPatterns?: string[];
  routingKeywords?: string[];
  schedules?: { id: string; displayName: string; seedPrompt: string; cron: string; label: string; enabled: boolean }[];
};

export function validateSpawn(
  callerId: string | undefined,
  targetId: string,
  depth: number
): { ok: boolean; error?: string } {
  if (depth >= 3) return { ok: false, error: 'Max spawn depth (3) exceeded' };
  const characters = getCharacters();
  if (!characters[targetId]) return { ok: false, error: `Character "${targetId}" not found` };
  if (callerId) {
    const caller = characters[callerId];
    if (!caller) return { ok: false, error: `Caller "${callerId}" not found` };
    if (!caller.canSpawn?.includes(targetId))
      return { ok: false, error: `"${callerId}" cannot spawn "${targetId}"` };
  }
  return { ok: true };
}

// Character colors — matches CSS vars in globals.css
export const CHARACTER_COLORS: Record<string, string> = {
  postman:   '#4f46e5',
  scholar:   '#7c3aed',
  clerk:     '#b45309',
  coach:     '#047857',
  architect: '#475569',
  oracle:    '#9333ea',
  scribe:    '#d97706',
  watcher:   '#64748b',
  engineer:  '#374151',
  archivist: '#92400e',
  steward:   '#0d9488',
};

let _cache: Record<string, Character> | null = null;

export function getCharacters(): Record<string, Character> {
  if (_cache && process.env.NODE_ENV !== 'development') return _cache;

  const result: Record<string, Character> = {};

  for (const tier of ['core', 'meta', 'stationed'] as const) {
    const dir = path.join(CHARACTERS_DIR, tier);
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.json')) continue;
        const id = f.replace(/\.json$/, '');
        if (id === 'TEMPLATE') continue;
        try {
          const config = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
          if (!config.name) continue;
          const memPath = path.join(dir, config.memoryFile || `${id}.memory.md`);
          let memory = '';
          try { memory = fs.readFileSync(memPath, 'utf-8'); } catch {}
          const color = config.color || CHARACTER_COLORS[id] || '#6b7280';
          result[id] = { ...config, id, tier, color, memory };
        } catch {}
      }
    } catch {}
  }

  _cache = result;
  return result;
}

export function clearCharacterCache() { _cache = null; }

export function getCharacterList(): Character[] {
  return Object.values(getCharacters());
}
