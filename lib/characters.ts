import fs from 'fs';
import path from 'path';

export type Character = {
  id: string;
  name: string;
  tier: 'core' | 'meta' | 'stationed';
  color: string;
  defaultModel?: string;
  systemPrompt?: string;
  skills?: string[];
  modifiers?: string[];
  sharedKnowledge?: string[];
  knowledgeFile?: string;
  memory: string;
};

const HOME = process.env.HOME || '/Users/keremozanbayraktar';
const CHARACTERS_DIR = path.join(HOME, '.claude', 'characters');

let _cache: Record<string, Character> | null = null;

export function getCharacters(): Record<string, Character> {
  if (_cache) return _cache;

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
          result[id] = { ...config, id, tier, memory };
        } catch {}
      }
    } catch {}
  }

  _cache = result;
  return result;
}

export function getCharacterList(): Character[] {
  return Object.values(getCharacters());
}
