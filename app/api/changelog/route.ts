export const dynamic = 'force-dynamic';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);


function insertUnderCurrentVersion(content: string, entry: string): string {
  const lines = content.split('\n');
  const vIdx = lines.findIndex(l => l.startsWith('## v'));
  if (vIdx === -1) return content + '\n' + entry;
  // Insert right after the version line (and its trailing blank line if present)
  const insertAt = lines[vIdx + 1]?.trim() === '' ? vIdx + 2 : vIdx + 1;
  lines.splice(insertAt, 0, entry, '');
  return lines.join('\n');
}

export async function POST(req: Request) {
  const { entry, isPrivate } = await req.json() as { entry: string; isPrivate?: boolean };
  if (!entry?.trim()) {
    return Response.json({ error: 'entry required' }, { status: 400 });
  }
  const cwd = process.cwd();
  const filename = isPrivate ? 'CHANGELOG.private.md' : 'CHANGELOG.md';
  const file = path.join(cwd, filename);
  try {
    const content = fs.readFileSync(file, 'utf-8');
    const updated = insertUnderCurrentVersion(content, entry.trim());
    fs.writeFileSync(file, updated, 'utf-8');
    const vLine = content.match(/^## v([\d.]+)/m);
    const version = vLine?.[1] ?? '?';
    await execAsync(`git add ${filename} && git commit -m "docs: update changelog v${version}"`, { cwd });
    return Response.json({ ok: true, version });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  const cwd = process.cwd();
  const pubFile = path.join(cwd, 'CHANGELOG.md');
  const privFile = path.join(cwd, 'CHANGELOG.private.md');
  try {
    const pubContent = fs.existsSync(pubFile) ? fs.readFileSync(pubFile, 'utf-8') : '';
    const privContent = fs.existsSync(privFile) ? fs.readFileSync(privFile, 'utf-8') : '';
    return Response.json({ content: pubContent, privateContent: privContent });
  } catch {
    return Response.json({ content: 'No changelog found.', privateContent: '' });
  }
}
