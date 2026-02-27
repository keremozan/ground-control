import fs from 'fs';
import path from 'path';
import { SHARED_DIR } from './config';

let _cache: Record<string, string> | null = null;

export function getSharedKnowledge(): Record<string, string> {
  if (_cache) return _cache;
  const result: Record<string, string> = {};
  try {
    for (const f of fs.readdirSync(SHARED_DIR)) {
      if (!f.endsWith('.md')) continue;
      const key = f.replace(/\.md$/, '');
      try { result[key] = fs.readFileSync(path.join(SHARED_DIR, f), 'utf-8'); } catch {}
    }
  } catch {}
  _cache = result;
  return result;
}

export function clearSharedCache() { _cache = null; }
