import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { listDraftIds, getSentMessageByThread } from './gmail';
import { recordOutcome } from './outcome-tracker';
import { GMAIL_ACCOUNTS } from './config';

const MAX_AGE_DAYS = 90;
const STALE_HOURS = 48;

function draftsPath() {
  const dir = process.env.__TEST_DATA_DIR || path.join(process.cwd(), 'data');
  return path.join(dir, 'draft-outcomes.json');
}

export type DraftStatus = 'pending' | 'sent-clean' | 'sent-light-edit' | 'sent-heavy-edit' | 'deleted' | 'stale';

export type DraftOutcome = {
  draftId: string;
  account: string;
  character: string;
  recipient: string;
  threadId: string;
  subject: string;
  originalBody: string;
  bodyHash: string;
  status: DraftStatus;
  editDistance?: number;
  createdAt: string;
  resolvedAt?: string;
};

function readDrafts(): DraftOutcome[] {
  try { return JSON.parse(fs.readFileSync(draftsPath(), 'utf-8')); }
  catch { return []; }
}

function writeDrafts(drafts: DraftOutcome[]) {
  const p = draftsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(drafts, null, 2));
}

export function hashBody(body: string): string {
  return crypto.createHash('sha256').update(body.trim().toLowerCase()).digest('hex').slice(0, 16);
}

/** Levenshtein edit distance ratio (0 = identical, 1 = completely different) */
export function editDistanceRatio(a: string, b: string): number {
  const an = a.trim().toLowerCase();
  const bn = b.trim().toLowerCase();
  if (an === bn) return 0;
  const maxLen = Math.max(an.length, bn.length);
  if (maxLen === 0) return 0;

  const m = an.length;
  const n = bn.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = an[i - 1] === bn[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n] / maxLen;
}

export function classifyDraftOutcome(editRatio: number): 'sent-clean' | 'sent-light-edit' | 'sent-heavy-edit' {
  if (editRatio < 0.05) return 'sent-clean';
  if (editRatio <= 0.2) return 'sent-light-edit';
  return 'sent-heavy-edit';
}

/** Register a new draft for tracking. Called from gmail-pipeline when creating drafts. */
export function trackDraft(opts: Omit<DraftOutcome, 'status' | 'createdAt'>) {
  const drafts = readDrafts();
  if (drafts.some(d => d.draftId === opts.draftId)) return;
  drafts.unshift({ ...opts, status: 'pending', createdAt: new Date().toISOString() });
  writeDrafts(drafts);
}

export function getPendingDrafts(): DraftOutcome[] {
  return readDrafts().filter(d => d.status === 'pending');
}

/** Check all pending drafts against Gmail. Called by cron every 2 hours. */
export async function checkDraftOutcomes(): Promise<{ checked: number; resolved: number }> {
  const drafts = readDrafts();
  const pending = drafts.filter(d => d.status === 'pending');
  if (pending.length === 0) return { checked: 0, resolved: 0 };

  let resolved = 0;
  const accounts = Array.isArray(GMAIL_ACCOUNTS) ? GMAIL_ACCOUNTS : [GMAIL_ACCOUNTS];

  const draftIdsByAccount = new Map<string, Set<string>>();
  for (const account of accounts) {
    try {
      const ids = await listDraftIds(account);
      draftIdsByAccount.set(account, new Set(ids));
    } catch {
      draftIdsByAccount.set(account, new Set());
    }
  }

  for (const draft of pending) {
    const accountDrafts = draftIdsByAccount.get(draft.account);
    if (!accountDrafts) continue;

    const draftStillExists = accountDrafts.has(draft.draftId);

    if (!draftStillExists) {
      try {
        const sent = await getSentMessageByThread(draft.account, draft.threadId);
        if (sent) {
          const sentHash = hashBody(sent.body);
          if (sentHash === draft.bodyHash) {
            draft.status = 'sent-clean';
            draft.editDistance = 0;
          } else {
            const ratio = editDistanceRatio(draft.originalBody, sent.body);
            draft.status = classifyDraftOutcome(ratio);
            draft.editDistance = Math.round(ratio * 100) / 100;
          }
        } else {
          draft.status = 'deleted';
        }
      } catch {
        draft.status = 'deleted';
      }
      draft.resolvedAt = new Date().toISOString();
      resolved++;

      const outcomeLabel =
        draft.status === 'sent-clean' ? 'positive' :
        draft.status === 'sent-light-edit' ? 'positive' :
        draft.status === 'sent-heavy-edit' ? 'negative' :
        'strong-negative';

      recordOutcome({
        character: draft.character,
        signalType: 'draft-outcome',
        outcome: outcomeLabel,
        details: {
          status: draft.status,
          recipient: draft.recipient,
          subject: draft.subject,
          editDistance: draft.editDistance,
        },
      });
    } else {
      const ageHours = (Date.now() - new Date(draft.createdAt).getTime()) / (1000 * 60 * 60);
      if (ageHours > STALE_HOURS) {
        draft.status = 'stale';
        draft.resolvedAt = new Date().toISOString();
        resolved++;
        recordOutcome({
          character: draft.character,
          signalType: 'draft-outcome',
          outcome: 'weak-negative',
          details: { status: 'stale', recipient: draft.recipient, subject: draft.subject },
        });
      }
    }
  }

  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const pruned = drafts.filter(d => d.createdAt > cutoff);
  writeDrafts(pruned);

  return { checked: pending.length, resolved };
}
