import fs from 'fs';
import path from 'path';

export async function GET() {
  const file = path.join(process.cwd(), 'CHANGELOG.md');
  try {
    const content = fs.readFileSync(file, 'utf-8');
    return Response.json({ content });
  } catch {
    return Response.json({ content: 'No changelog found.' });
  }
}
