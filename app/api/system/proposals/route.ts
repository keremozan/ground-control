export const runtime = 'nodejs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { readSkill, writeSkill, skillExists } from '@/lib/skills';

const HOME = process.env.HOME || '/tmp';
const PROPOSALS_PATH = join(HOME, '.claude/characters/pending-edits.json');

type Proposal = {
  id: string;
  skill: string;
  description: string;
  diff: { old: string; new: string };
  reason: string;
  createdAt: string;
  needsReview?: boolean;
};

// Raw shape written by watcher
type RawProposal = {
  id: string;
  skill: string;
  date?: string;
  createdAt?: string;
  reason?: string;
  description?: string;
  proposed_change?: string;
  old_section?: string;
  new_section?: string;
  diff?: { old: string; new: string };
  needsReview?: boolean;
};

function normalize(p: RawProposal): Proposal {
  return {
    id: p.id,
    skill: p.skill,
    createdAt: p.createdAt ?? p.date ?? '',
    description: p.description ?? p.proposed_change ?? '',
    reason: p.reason ?? '',
    diff: p.diff ?? { old: p.old_section ?? '', new: p.new_section ?? '' },
    needsReview: p.needsReview,
  };
}

/** Apply a proposal's diff to its skill file. Returns true on success. */
function applyProposal(p: Proposal): { ok: boolean; error?: string } {
  if (!skillExists(p.skill)) return { ok: false, error: `skill "${p.skill}" not found` };
  const content = readSkill(p.skill);
  if (content === null) return { ok: false, error: `could not read skill "${p.skill}"` };
  if (!p.diff?.old || !p.diff?.new) return { ok: false, error: 'missing diff' };
  if (!content.includes(p.diff.old)) return { ok: false, error: 'old section not found in skill file (may have changed)' };
  const updated = content.replace(p.diff.old, p.diff.new);
  writeSkill(p.skill, updated);
  return { ok: true };
}

export async function GET() {
  try {
    const raw = await readFile(PROPOSALS_PATH, 'utf-8');
    const all: RawProposal[] = JSON.parse(raw);
    const normalized = all.map(normalize);

    // Auto-apply proposals that don't need review
    const needsReview: Proposal[] = [];
    const autoApplied: { id: string; skill: string; ok: boolean; error?: string }[] = [];
    let changed = false;

    for (const p of normalized) {
      if (p.needsReview) {
        needsReview.push(p);
      } else {
        // Auto-apply
        const result = applyProposal(p);
        autoApplied.push({ id: p.id, skill: p.skill, ok: result.ok, error: result.error });
        changed = true;
      }
    }

    // Write back only proposals that need review
    if (changed) {
      await writeFile(PROPOSALS_PATH, JSON.stringify(needsReview, null, 2), 'utf-8');
    }

    return Response.json({ proposals: needsReview, autoApplied });
  } catch {
    return Response.json({ proposals: [], autoApplied: [] });
  }
}

export async function POST(req: Request) {
  const { action, id } = await req.json() as { action: 'approve' | 'dismiss'; id: string };

  try {
    const raw = await readFile(PROPOSALS_PATH, 'utf-8');
    const proposals: Proposal[] = JSON.parse(raw).map(normalize);
    const idx = proposals.findIndex(p => p.id === id);
    if (idx === -1) return Response.json({ error: 'not found' }, { status: 404 });

    const proposal = proposals[idx];

    if (action === 'dismiss') {
      proposals.splice(idx, 1);
      await writeFile(PROPOSALS_PATH, JSON.stringify(proposals, null, 2), 'utf-8');
      return Response.json({ ok: true });
    }

    // Approve: apply the diff to the skill file
    const result = applyProposal(proposal);
    proposals.splice(idx, 1);
    await writeFile(PROPOSALS_PATH, JSON.stringify(proposals, null, 2), 'utf-8');

    if (!result.ok) {
      return Response.json({ error: result.error, applied: false }, { status: 422 });
    }

    return Response.json({ ok: true, applied: true, skill: proposal.skill });
  } catch {
    return Response.json({ error: 'failed' }, { status: 500 });
  }
}
