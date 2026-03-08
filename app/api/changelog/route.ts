import fs from 'fs';
import path from 'path';

/** Merge private changelog sections into the public changelog by version heading. */
function mergeChangelogs(pub: string, priv: string): string {
  const privSections: Record<string, string[]> = {};
  let currentVersion = '';
  for (const line of priv.split('\n')) {
    if (line.startsWith('## ')) {
      currentVersion = line.replace(/^## /, '').trim();
      privSections[currentVersion] = [];
    } else if (currentVersion) {
      privSections[currentVersion].push(line);
    }
  }

  const result: string[] = [];
  for (const line of pub.split('\n')) {
    result.push(line);
    if (line.startsWith('## ')) {
      const version = line.replace(/^## /, '').trim();
      const extra = privSections[version];
      if (extra && extra.some(l => l.trim())) {
        result.push(...extra);
        delete privSections[version];
      }
    }
  }

  // Prepend orphaned private versions (not yet in public changelog)
  for (const [version, lines] of Object.entries(privSections)) {
    if (lines.some(l => l.trim())) {
      result.unshift('', ...lines, `## ${version}`);
    }
  }

  return result.join('\n');
}

export async function GET() {
  const pubFile = path.join(process.cwd(), 'CHANGELOG.md');
  const privFile = path.join(process.cwd(), 'CHANGELOG.private.md');
  try {
    const pub = fs.readFileSync(pubFile, 'utf-8');
    let content = pub;
    try {
      const priv = fs.readFileSync(privFile, 'utf-8');
      content = mergeChangelogs(pub, priv);
    } catch {
      // private changelog absent — use public only
    }
    return Response.json({ content });
  } catch {
    return Response.json({ content: 'No changelog found.' });
  }
}
