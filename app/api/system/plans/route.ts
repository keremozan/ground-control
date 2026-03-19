export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import fs from 'fs';
import path from 'path';

type PlanFile = {
  name: string;
  path: string;
  type: 'plan' | 'spec';
  title: string;
  goal: string;
  modifiedAt: string;
};

const DOCS_DIR = path.join(process.cwd(), 'docs', 'superpowers');

function readPlans(subdir: string, type: 'plan' | 'spec'): PlanFile[] {
  const dir = path.join(DOCS_DIR, subdir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const filePath = path.join(dir, f);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const titleLine = lines.find(l => l.startsWith('# '));
      const goalLine = lines.find(l => l.startsWith('**Goal:**'));
      const stat = fs.statSync(filePath);
      return {
        name: f,
        path: filePath,
        type,
        title: titleLine?.replace(/^#\s*/, '') || f.replace('.md', ''),
        goal: goalLine?.replace(/^\*\*Goal:\*\*\s*/, '') || '',
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export async function GET(req: Request) {
  const withContent = new URL(req.url).searchParams.get('content');
  const plans = [...readPlans('plans', 'plan'), ...readPlans('specs', 'spec')];

  if (withContent) {
    const file = plans.find(p => p.name === withContent);
    if (!file) return Response.json({ error: 'Not found' }, { status: 404 });
    const content = fs.readFileSync(file.path, 'utf-8');
    return Response.json({ file, content });
  }

  return Response.json({ plans });
}
