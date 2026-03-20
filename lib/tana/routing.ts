// Note: depends on lib/characters.ts for dynamic character lookups
import fs from 'fs';
import path from 'path';
import { SHARED_DIR } from '../config';
import { getCharacters } from '../characters';

function buildTrackPatterns(): Record<string, RegExp> {
  const chars = getCharacters();
  const patterns: Record<string, RegExp> = {};
  for (const [id, char] of Object.entries(chars)) {
    const tp = (char as any).trackPatterns as string[] | undefined;
    if (tp && tp.length > 0) {
      patterns[id] = new RegExp(tp.join('|'), 'i');
    }
  }
  return patterns;
}

function buildKeywordPatterns(): [RegExp, string][] {
  const chars = getCharacters();
  const overrides: [RegExp, string][] = [];
  for (const [id, char] of Object.entries(chars)) {
    const kw = (char as any).routingKeywords as string[] | undefined;
    if (kw && kw.length > 0) {
      // Word boundaries prevent partial matches (e.g. "art" matching "start")
      const pattern = kw.map(k => `\\b${k}\\b`).join('|');
      overrides.push([new RegExp(pattern, 'i'), id]);
    }
  }
  return overrides;
}

let _trackCache: Record<string, RegExp> | null = null;
let _keywordCache: [RegExp, string][] | null = null;
let _overrideCache: [RegExp, string][] | null = null;

const isDev = process.env.NODE_ENV === 'development';

function getRoutingOverrides(): [RegExp, string][] {
  if (_overrideCache && !isDev) return _overrideCache;
  try {
    const content = fs.readFileSync(path.join(SHARED_DIR, 'routing-overrides.md'), 'utf-8');
    const overrides: [RegExp, string][] = [];
    for (const line of content.split('\n')) {
      const m = line.match(/^- (.+?) → (\w+)/);
      if (m) overrides.push([new RegExp(m[1], 'i'), m[2]]);
    }
    _overrideCache = overrides;
    return overrides;
  } catch { return []; }
}

function getTrackPatterns() {
  if (!_trackCache || isDev) _trackCache = buildTrackPatterns();
  return _trackCache;
}

function getKeywordPatterns() {
  if (!_keywordCache || isDev) _keywordCache = buildKeywordPatterns();
  return _keywordCache;
}

export function clearRoutingCache() {
  _trackCache = null;
  _keywordCache = null;
  _overrideCache = null;
}

export function characterForTrack(track: string, taskName?: string): string {
  if (taskName) {
    for (const [pattern, char] of getKeywordPatterns()) {
      if (pattern.test(taskName)) return char;
    }
  }
  for (const [char, pattern] of Object.entries(getTrackPatterns())) {
    if (pattern.test(track)) return char;
  }
  return 'postman';
}

/**
 * Resolve final character assignment for a task.
 * Explicit Tana assignment always wins. Keywords and track patterns are fallbacks
 * for unassigned tasks only.
 */
export function resolveCharacter(assigned: string | null, track: string, taskName: string): string {
  // 1. Explicit Tana assignment always wins (manual reassignment respected)
  if (assigned) return assigned;
  // 2. Learned overrides (from routing-overrides.md)
  for (const [pattern, char] of getRoutingOverrides()) {
    if (pattern.test(taskName)) return char;
  }
  // 3. Character keyword patterns (from JSON configs)
  for (const [pattern, char] of getKeywordPatterns()) {
    if (pattern.test(taskName)) return char;
  }
  // 4. Track patterns
  for (const [char, pattern] of Object.entries(getTrackPatterns())) {
    if (pattern.test(track)) return char;
  }
  return 'postman';
}
