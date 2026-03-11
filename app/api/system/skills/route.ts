export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { SKILLS_DIR } from '@/lib/config';

type SkillMeta = {
  name: string;
  description: string;
  character?: string;
};

function parseFrontmatter(content: string): Record<string, string> {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const result: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      result[key] = val;
    }
  }
  return result;
}

export async function GET() {
  try {
    const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();

    const skills: SkillMeta[] = [];
    for (const dir of dirs) {
      const fp = path.join(SKILLS_DIR, dir, 'SKILL.md');
      try {
        const content = fs.readFileSync(fp, 'utf-8');
        const fm = parseFrontmatter(content);
        skills.push({
          name: fm.name || dir,
          description: fm.description || '',
          character: fm.character,
        });
      } catch { /* skip unreadable */ }
    }

    return Response.json({ skills });
  } catch {
    return Response.json({ skills: [] });
  }
}
