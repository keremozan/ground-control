import fs from 'fs';
import path from 'path';
import { SKILLS_DIR } from './config';

export function readSkill(name: string): string | null {
  const p = path.join(SKILLS_DIR, name, 'SKILL.md');
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

export function writeSkill(name: string, content: string): void {
  const dir = path.join(SKILLS_DIR, name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8');
}

export function skillExists(name: string): boolean {
  return fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md'));
}
