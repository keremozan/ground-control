import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME || '/Users/keremozanbayraktar';
const SKILLS_DIR = path.join(HOME, '.claude', 'skills');

export function readSkill(name: string): string | null {
  const p = path.join(SKILLS_DIR, name, 'SKILL.md');
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}
