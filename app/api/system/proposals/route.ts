export const runtime = 'nodejs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const HOME = process.env.HOME || '/tmp';
const PROPOSALS_PATH = join(HOME, '.claude/characters/pending-edits.json');

type Proposal = {
  id: string;
  skill: string;
  description: string;
  diff: { old: string; new: string };
  reason: string;
  createdAt: string;
};

export async function GET() {
  try {
    const raw = await readFile(PROPOSALS_PATH, 'utf-8');
    const proposals: Proposal[] = JSON.parse(raw);
    return Response.json({ proposals });
  } catch {
    return Response.json({ proposals: [] });
  }
}

export async function POST(req: Request) {
  const { action, id } = await req.json() as { action: 'approve' | 'dismiss'; id: string };

  try {
    const raw = await readFile(PROPOSALS_PATH, 'utf-8');
    const proposals: Proposal[] = JSON.parse(raw);
    const idx = proposals.findIndex(p => p.id === id);
    if (idx === -1) return Response.json({ error: 'not found' }, { status: 404 });

    if (action === 'dismiss') {
      proposals.splice(idx, 1);
      await writeFile(PROPOSALS_PATH, JSON.stringify(proposals, null, 2), 'utf-8');
      return Response.json({ ok: true });
    }

    // Approve: return the proposal details for the frontend to trigger an architect session
    const proposal = proposals[idx];
    proposals.splice(idx, 1);
    await writeFile(PROPOSALS_PATH, JSON.stringify(proposals, null, 2), 'utf-8');
    return Response.json({ ok: true, applied: proposal });
  } catch (e) {
    return Response.json({ error: 'failed' }, { status: 500 });
  }
}
