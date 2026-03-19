export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { readFile, writeFile, access, rename } from 'fs/promises';
import { join } from 'path';
import { createTask } from '@/lib/tana';

const HOME = process.env.HOME || '/tmp';
const PROPOSALS_PATH = join(HOME, '.claude/characters/proposals.json');
const OLD_PATH = join(HOME, '.claude/characters/pending-edits.json');

// Dismiss memory: skip re-proposing similar items for 30 days
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ProposalType = 'skill-edit' | 'schedule' | 'rebalance' | 'pattern' | 'cleanup' | 'automation' | 'strategic';
export type ProposalSource = 'watcher' | 'kybernetes' | 'coach' | 'oracle';
export type ProposalPriority = 'low' | 'medium' | 'high';
export type ProposalStatus = 'pending' | 'approved' | 'dismissed' | 'implemented';

export type ProposalAction = {
  type: 'edit-file' | 'edit-config' | 'create-task' | 'toggle-schedule' | 'reassign-tasks' | 'remove-scan-target';
  spec: Record<string, unknown>;
};

export type Proposal = {
  id: string;
  type: ProposalType;
  source: ProposalSource;
  title: string;
  detail: string;
  action: ProposalAction;
  priority: ProposalPriority;
  createdAt: string;
  status: ProposalStatus;
};

type DismissedEntry = {
  title: string;
  type: ProposalType;
  dismissedAt: string;
};

type ProposalsFile = {
  proposals: Proposal[];
  dismissed: DismissedEntry[];
};

// --- Migration from old pending-edits.json ---

type OldProposal = {
  id: string;
  skill: string;
  description?: string;
  proposed_change?: string;
  diff?: { old: string; new: string };
  old_section?: string;
  new_section?: string;
  reason?: string;
  date?: string;
  createdAt?: string;
  needsReview?: boolean;
};

function migrateOld(old: OldProposal): Proposal {
  return {
    id: old.id,
    type: 'skill-edit',
    source: 'watcher',
    title: old.description || old.proposed_change || `Edit ${old.skill}`,
    detail: old.reason || '',
    action: {
      type: 'edit-file',
      spec: {
        file: old.skill,
        old: old.diff?.old ?? old.old_section ?? '',
        new: old.diff?.new ?? old.new_section ?? '',
      },
    },
    priority: 'medium',
    createdAt: old.createdAt ?? old.date ?? new Date().toISOString(),
    status: 'pending',
  };
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function loadProposals(): Promise<ProposalsFile> {
  // Try new file first
  if (await fileExists(PROPOSALS_PATH)) {
    try {
      const raw = await readFile(PROPOSALS_PATH, 'utf-8');
      const data = JSON.parse(raw);
      // Handle both formats: { proposals, dismissed } or bare array
      if (Array.isArray(data)) {
        return { proposals: data, dismissed: [] };
      }
      return {
        proposals: data.proposals || [],
        dismissed: data.dismissed || [],
      };
    } catch {
      return { proposals: [], dismissed: [] };
    }
  }

  // Migrate from old file
  if (await fileExists(OLD_PATH)) {
    try {
      const raw = await readFile(OLD_PATH, 'utf-8');
      const old: OldProposal[] = JSON.parse(raw);
      const migrated: ProposalsFile = {
        proposals: old.map(migrateOld),
        dismissed: [],
      };
      await saveProposals(migrated);
      await rename(OLD_PATH, OLD_PATH + '.bak');
      return migrated;
    } catch {
      return { proposals: [], dismissed: [] };
    }
  }

  return { proposals: [], dismissed: [] };
}

async function saveProposals(data: ProposalsFile): Promise<void> {
  await writeFile(PROPOSALS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function pruneDismissed(dismissed: DismissedEntry[]): DismissedEntry[] {
  const cutoff = Date.now() - DISMISS_TTL_MS;
  return dismissed.filter(d => new Date(d.dismissedAt).getTime() > cutoff);
}

// --- Routes ---

export async function GET() {
  try {
    const data = await loadProposals();
    // Prune expired dismissals on read
    data.dismissed = pruneDismissed(data.dismissed);
    // Only return pending proposals
    const pending = data.proposals.filter(p => p.status === 'pending');
    return Response.json({ proposals: pending });
  } catch {
    return Response.json({ proposals: [] });
  }
}

export async function POST(req: Request) {
  const body = await req.json() as { action: 'approve' | 'dismiss'; id: string };
  const { action, id } = body;

  try {
    const data = await loadProposals();
    const idx = data.proposals.findIndex(p => p.id === id);
    if (idx === -1) return Response.json({ error: 'not found' }, { status: 404 });

    const proposal = data.proposals[idx];

    if (action === 'dismiss') {
      proposal.status = 'dismissed';
      data.dismissed = pruneDismissed(data.dismissed);
      data.dismissed.push({
        title: proposal.title,
        type: proposal.type,
        dismissedAt: new Date().toISOString(),
      });
      // Remove from active proposals
      data.proposals.splice(idx, 1);
      await saveProposals(data);
      return Response.json({ ok: true });
    }

    // Approve: create a task for Engineer in Tana, mark approved
    proposal.status = 'approved';
    data.proposals.splice(idx, 1);
    await saveProposals(data);

    // Create implementation task for Engineer
    try {
      const actionSummary = proposal.action.type === 'edit-file'
        ? `File: ${proposal.action.spec.file || 'N/A'}`
        : `Action: ${proposal.action.type}`;
      await createTask({
        title: `[Proposal] ${proposal.title}`,
        assigned: 'engineer',
        priority: proposal.priority,
        body: `${proposal.detail}\n\nAction type: ${proposal.action.type}\n${actionSummary}\nSpec: ${JSON.stringify(proposal.action.spec, null, 2)}`,
      });
    } catch {
      // Task creation failure shouldn't block the approval
    }

    return Response.json({ ok: true, approved: true, title: proposal.title });
  } catch {
    return Response.json({ error: 'failed' }, { status: 500 });
  }
}
