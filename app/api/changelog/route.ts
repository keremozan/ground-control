export const dynamic = 'force-dynamic';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { apiOk, apiError, requireFields } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

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
  try {
    const body = await req.json() as { entry: string; isPrivate?: boolean };
    const missing = requireFields(body, ['entry']);
    if (missing) return apiError(400, missing);

    if (!body.entry.trim()) return apiError(400, 'entry is required');

    const cwd = process.cwd();
    const filename = body.isPrivate ? 'CHANGELOG.private.md' : 'CHANGELOG.md';
    const file = path.join(cwd, filename);
    const content = fs.readFileSync(file, 'utf-8');
    const updated = insertUnderCurrentVersion(content, body.entry.trim());
    fs.writeFileSync(file, updated, 'utf-8');
    const vLine = content.match(/^## v([\d.]+)/m);
    const version = vLine?.[1] ?? '?';
    await execAsync(`git add ${filename} && git commit -m "docs: update changelog v${version}"`, { cwd });
    return apiOk({ version });
  } catch (err) {
    captureError('changelog/POST', err);
    return apiError(500, String(err));
  }
}

export async function GET() {
  try {
    const cwd = process.cwd();
    const pubFile = path.join(cwd, 'CHANGELOG.md');
    const privFile = path.join(cwd, 'CHANGELOG.private.md');
    const pubContent = fs.existsSync(pubFile) ? fs.readFileSync(pubFile, 'utf-8') : '';
    const privContent = fs.existsSync(privFile) ? fs.readFileSync(privFile, 'utf-8') : '';
    return apiOk({ content: pubContent, privateContent: privContent });
  } catch {
    return apiOk({ content: 'No changelog found.', privateContent: '' });
  }
}
