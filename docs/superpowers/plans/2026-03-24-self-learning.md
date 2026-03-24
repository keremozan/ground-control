# Self-Learning System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a feedback loop where the system observes outcomes of its outputs (draft fates, chat corrections, usage patterns), extracts behavioral lessons, and writes them to character memory for future improvement.

**Architecture:** Five data files track outcomes across four signal sources. A shared `outcome-tracker.ts` handles storage and rolling retention. `draft-checker.ts` polls Gmail for draft fates (pure API, no LLM). `lesson-extractor.ts` uses Sonnet to synthesize patterns into memory-ready lessons. Each signal source feeds into the same outcome schema, enabling unified weekly analysis.

**Tech Stack:** Next.js 16 API routes, Gmail REST API (via existing `lib/gmail.ts`), Levenshtein edit distance (local computation), existing `spawnOnce` for Sonnet lesson synthesis.

**Spec:** `docs/superpowers/specs/2026-03-24-self-learning-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `lib/outcome-tracker.ts` | Outcome event storage, rolling retention (90 days), read/write for `data/outcomes.json` |
| `lib/draft-checker.ts` | Gmail API polling for draft fates, edit distance computation, stores to `data/draft-outcomes.json` |
| `lib/lesson-extractor.ts` | Groups outcomes by character, detects patterns, synthesizes lessons via Sonnet, writes to memory |
| `lib/usage-analytics.ts` | Lightweight event logging for dashboard interactions, stores to `data/usage-analytics.json` |
| `app/api/outcomes/route.ts` | GET: return outcome summary. POST: record a usage-analytics event |
| `app/api/outcomes/check-drafts/route.ts` | GET: cron endpoint that runs draft fate checking (every 2 hours) |
| `app/api/outcomes/extract-lessons/route.ts` | POST: trigger lesson extraction for one or all characters |
| `tests/lib/outcome-tracker.test.ts` | Tests for outcome storage and retention |
| `tests/lib/draft-checker.test.ts` | Tests for edit distance, outcome classification, stateful tracking |
| `tests/lib/lesson-extractor.test.ts` | Tests for pattern grouping and lesson formatting |

### Modified files

| File | Change |
|------|--------|
| `lib/gmail-pipeline.ts:439-445` | Store draft metadata (draftId, account, recipient, threadId, original body hash + full body) in draft-outcomes when creating a draft |
| `lib/gmail.ts` | Add `listDraftIds()` and `getSentMessageByThread()` inside the file (needs access to private `gmailFetch`) |
| `app/api/chat/route.ts` | Detect correction patterns in conversation history and log outcome events |
| `app/api/schedule/run/route.ts` | Log outcome event when a job completes (character, duration, success/error) |

### Data files (auto-created by lib code)

| File | Schema | Retention |
|------|--------|-----------|
| `data/outcomes.json` | `OutcomeEvent[]` | Rolling 90 days |
| `data/draft-outcomes.json` | `DraftOutcome[]` | Rolling 90 days |
| `data/usage-analytics.json` | `UsageEvent[]` | Rolling 30 days |

---

## Task 1: Outcome Event Storage (`lib/outcome-tracker.ts`)

**Files:**
- Create: `lib/outcome-tracker.ts`
- Create: `tests/lib/outcome-tracker.test.ts`

- [ ] **Step 1: Write failing tests for outcome storage**

Tests use a temp directory to avoid touching real data files.

```typescript
// tests/lib/outcome-tracker.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock the data path to use a temp dir
const tmpDir = path.join(os.tmpdir(), `gc-test-outcomes-${Date.now()}`);
vi.mock('@/lib/outcome-tracker', async () => {
  // We need to set env before importing
  process.env.__TEST_DATA_DIR = tmpDir;
  return await vi.importActual('@/lib/outcome-tracker');
});

describe('outcome-tracker', () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const outcomesPath = path.join(tmpDir, 'outcomes.json');
    if (fs.existsSync(outcomesPath)) fs.unlinkSync(outcomesPath);
  });

  it('records an outcome event and reads it back', async () => {
    const { recordOutcome, getOutcomes } = await import('@/lib/outcome-tracker');
    recordOutcome({
      character: 'scholar',
      signalType: 'chat-correction',
      outcome: 'negative',
      details: { before: 'wrote 400 words', after: 'user wanted 150' },
    });
    const events = getOutcomes();
    expect(events.length).toBeGreaterThanOrEqual(1);
    const last = events[0];
    expect(last.character).toBe('scholar');
    expect(last.signalType).toBe('chat-correction');
  });

  it('filters by character and signal type', async () => {
    const { recordOutcome, getOutcomes } = await import('@/lib/outcome-tracker');
    recordOutcome({ character: 'scholar', signalType: 'chat-correction', outcome: 'negative', details: {} });
    recordOutcome({ character: 'clerk', signalType: 'draft-outcome', outcome: 'positive', details: {} });
    expect(getOutcomes({ character: 'scholar' }).every(e => e.character === 'scholar')).toBe(true);
    expect(getOutcomes({ signalType: 'draft-outcome' }).every(e => e.signalType === 'draft-outcome')).toBe(true);
  });

  it('enforces 90-day rolling retention', async () => {
    const { pruneOutcomes, getOutcomes } = await import('@/lib/outcome-tracker');
    const outcomesPath = path.join(tmpDir, 'outcomes.json');
    const old = {
      timestamp: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(),
      character: 'clerk',
      signalType: 'draft-outcome',
      outcome: 'deleted',
      details: {},
    };
    const recent = {
      timestamp: new Date().toISOString(),
      character: 'clerk',
      signalType: 'draft-outcome',
      outcome: 'positive',
      details: {},
    };
    fs.writeFileSync(outcomesPath, JSON.stringify([recent, old], null, 2));
    pruneOutcomes();
    const after = getOutcomes();
    expect(after.find(e => e.timestamp === old.timestamp)).toBeUndefined();
    expect(after.find(e => e.timestamp === recent.timestamp)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npx vitest run tests/lib/outcome-tracker.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement outcome-tracker.ts**

The module reads `__TEST_DATA_DIR` env var for test isolation.

```typescript
// lib/outcome-tracker.ts
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.__TEST_DATA_DIR || path.join(process.cwd(), 'data');
const OUTCOMES_PATH = path.join(DATA_DIR, 'outcomes.json');
const MAX_AGE_DAYS = 90;

export type SignalType = 'chat-correction' | 'draft-outcome' | 'tana-outcome' | 'usage';

export type OutcomeEvent = {
  timestamp: string;
  character: string;
  signalType: SignalType;
  outcome: string;
  details: Record<string, unknown>;
};

function readOutcomes(): OutcomeEvent[] {
  try { return JSON.parse(fs.readFileSync(OUTCOMES_PATH, 'utf-8')); }
  catch { return []; }
}

function writeOutcomes(events: OutcomeEvent[]) {
  fs.mkdirSync(path.dirname(OUTCOMES_PATH), { recursive: true });
  fs.writeFileSync(OUTCOMES_PATH, JSON.stringify(events, null, 2));
}

export function recordOutcome(event: Omit<OutcomeEvent, 'timestamp'>) {
  const existing = readOutcomes();
  const entry: OutcomeEvent = { timestamp: new Date().toISOString(), ...event };
  writeOutcomes([entry, ...existing]);
}

export function getOutcomes(opts?: { character?: string; signalType?: SignalType; limit?: number }): OutcomeEvent[] {
  let events = readOutcomes();
  if (opts?.character) events = events.filter(e => e.character === opts.character);
  if (opts?.signalType) events = events.filter(e => e.signalType === opts.signalType);
  if (opts?.limit) events = events.slice(0, opts.limit);
  return events;
}

export function pruneOutcomes() {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const events = readOutcomes().filter(e => e.timestamp > cutoff);
  writeOutcomes(events);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npx vitest run tests/lib/outcome-tracker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/keremozanbayraktar/Projects/ground-control
git add lib/outcome-tracker.ts tests/lib/outcome-tracker.test.ts
git commit -m "feat: add outcome event storage with rolling 90-day retention"
```

---

## Task 2: Draft Outcome Checker (`lib/draft-checker.ts`)

**Files:**
- Create: `lib/draft-checker.ts`
- Create: `tests/lib/draft-checker.test.ts`
- Modify: `lib/gmail.ts` (add `listDraftIds`, `getSentMessageByThread` inside the file, adjacent to existing `searchDrafts`)

- [ ] **Step 1: Write failing tests for edit distance and outcome classification**

```typescript
// tests/lib/draft-checker.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const tmpDir = path.join(os.tmpdir(), `gc-test-drafts-${Date.now()}`);

describe('draft-checker', () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    process.env.__TEST_DATA_DIR = tmpDir;
  });

  it('computes edit distance ratio correctly', async () => {
    const { editDistanceRatio } = await import('@/lib/draft-checker');
    expect(editDistanceRatio('hello world', 'hello world')).toBe(0);
    expect(editDistanceRatio('abc', 'xyz')).toBeGreaterThan(0.9);
    expect(editDistanceRatio('hello world', 'hello World')).toBeLessThan(0.2);
  });

  it('classifies outcomes from edit distance', async () => {
    const { classifyDraftOutcome } = await import('@/lib/draft-checker');
    expect(classifyDraftOutcome(0)).toBe('sent-clean');
    expect(classifyDraftOutcome(0.1)).toBe('sent-light-edit');
    expect(classifyDraftOutcome(0.6)).toBe('sent-heavy-edit');
  });

  it('reads and writes draft tracking entries', async () => {
    const { trackDraft, getPendingDrafts } = await import('@/lib/draft-checker');
    trackDraft({
      draftId: 'test-draft-1',
      account: 'personal',
      character: 'postman',
      recipient: 'someone@example.com',
      threadId: 'thread-123',
      subject: 'Test',
      originalBody: 'Hello this is a test email body',
      bodyHash: 'abc123',
    });
    const pending = getPendingDrafts();
    expect(pending.some(d => d.draftId === 'test-draft-1')).toBe(true);
  });

  it('does not double-track the same draft', async () => {
    const { trackDraft, getPendingDrafts } = await import('@/lib/draft-checker');
    const opts = {
      draftId: 'test-draft-dup',
      account: 'personal',
      character: 'postman',
      recipient: 'someone@example.com',
      threadId: 'thread-456',
      subject: 'Test',
      originalBody: 'body',
      bodyHash: 'def456',
    };
    trackDraft(opts);
    trackDraft(opts);
    const pending = getPendingDrafts().filter(d => d.draftId === 'test-draft-dup');
    expect(pending).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npx vitest run tests/lib/draft-checker.test.ts`
Expected: FAIL

- [ ] **Step 3: Add Gmail helper functions inside `lib/gmail.ts`**

Add these functions after the existing `searchDrafts` function (around line 440), inside the same file so they can access the private `gmailFetch`:

```typescript
/** List all draft IDs for an account */
export async function listDraftIds(account: string): Promise<string[]> {
  const data = await gmailFetch('/drafts?maxResults=100', account);
  return (data.drafts || []).map((d: { id: string }) => d.id);
}

/** Find the most recent sent message body in a thread */
export async function getSentMessageByThread(account: string, threadId: string): Promise<{ id: string; body: string } | null> {
  try {
    const data = await gmailFetch(`/threads/${threadId}?format=full`, account);
    const messages = (data.messages || []) as Record<string, unknown>[];

    for (const msg of messages.reverse()) {
      const labels = (msg.labelIds || []) as string[];
      if (!labels.includes('SENT')) continue;

      const payload = msg.payload as Record<string, unknown>;
      if (!payload) continue;

      // Reuse the same body extraction pattern from getEmailBody
      function findPlain(part: Record<string, unknown>): string | null {
        if (part.mimeType === 'text/plain' && part.body) {
          const d = (part.body as Record<string, unknown>).data as string | undefined;
          if (d) return Buffer.from(d, 'base64url').toString('utf-8');
        }
        const parts = part.parts as Record<string, unknown>[] | undefined;
        if (parts) { for (const p of parts) { const r = findPlain(p); if (r) return r; } }
        return null;
      }

      const body = findPlain(payload) || (msg.snippet as string) || '';
      return { id: msg.id as string, body };
    }
  } catch {}
  return null;
}
```

- [ ] **Step 4: Implement draft-checker.ts**

Stores the full original body for accurate comparison. Uses body hash as fast-path (if hash matches sent body hash, it was sent clean without computing edit distance).

```typescript
// lib/draft-checker.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { listDraftIds, getSentMessageByThread } from './gmail';
import { recordOutcome } from './outcome-tracker';
import { GMAIL_ACCOUNTS } from './config';

const DATA_DIR = process.env.__TEST_DATA_DIR || path.join(process.cwd(), 'data');
const DRAFTS_PATH = path.join(DATA_DIR, 'draft-outcomes.json');
const MAX_AGE_DAYS = 90;
const STALE_HOURS = 48;

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
  try { return JSON.parse(fs.readFileSync(DRAFTS_PATH, 'utf-8')); }
  catch { return []; }
}

function writeDrafts(drafts: DraftOutcome[]) {
  fs.mkdirSync(path.dirname(DRAFTS_PATH), { recursive: true });
  fs.writeFileSync(DRAFTS_PATH, JSON.stringify(drafts, null, 2));
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

  // Get current draft IDs per account
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
      // Draft is gone. Check if a sent message exists in the same thread.
      try {
        const sent = await getSentMessageByThread(draft.account, draft.threadId);
        if (sent) {
          // Fast path: compare body hashes
          const sentHash = hashBody(sent.body);
          if (sentHash === draft.bodyHash) {
            draft.status = 'sent-clean';
            draft.editDistance = 0;
          } else {
            // Full comparison on complete bodies
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
      // Draft still exists. Check if stale (>48 hours).
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

  // Prune old resolved entries (>90 days)
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const pruned = drafts.filter(d => d.createdAt > cutoff);
  writeDrafts(pruned);

  return { checked: pending.length, resolved };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npx vitest run tests/lib/draft-checker.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/keremozanbayraktar/Projects/ground-control
git add lib/draft-checker.ts lib/gmail.ts tests/lib/draft-checker.test.ts
git commit -m "feat: add draft outcome checker with edit distance classification"
```

---

## Task 3: Wire Draft Tracking into Gmail Pipeline

**Files:**
- Modify: `lib/gmail-pipeline.ts:439-445`

- [ ] **Step 1: Add draft tracking import and call**

At top of `lib/gmail-pipeline.ts`, add import:

```typescript
import { trackDraft, hashBody } from './draft-checker';
```

After the `createDraft` call (line ~445, where `details.push(\`draft created: ${draftId}\`)`) add:

```typescript
// Track draft for outcome monitoring
trackDraft({
  draftId,
  account: email.account,
  character: action.character || 'postman',
  recipient: fromEmail,
  threadId: email.threadId,
  subject: email.subject,
  originalBody: replyText,
  bodyHash: hashBody(replyText),
});
```

- [ ] **Step 2: Verify the pipeline still compiles**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/keremozanbayraktar/Projects/ground-control
git add lib/gmail-pipeline.ts
git commit -m "feat: track draft creation metadata for outcome monitoring"
```

---

## Task 4: Draft Check Cron Endpoint

**Files:**
- Create: `app/api/outcomes/check-drafts/route.ts`

- [ ] **Step 1: Create the cron endpoint**

```typescript
// app/api/outcomes/check-drafts/route.ts
export const runtime = 'nodejs';
import { checkDraftOutcomes } from '@/lib/draft-checker';
import { apiOk, apiError } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

/** GET: cron-triggered draft outcome check (every 2 hours) */
export async function GET() {
  try {
    const result = await checkDraftOutcomes();
    return apiOk(result);
  } catch (err) {
    captureError('outcomes/check-drafts', err);
    return apiError(500, String(err));
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/keremozanbayraktar/Projects/ground-control
git add app/api/outcomes/check-drafts/route.ts
git commit -m "feat: add cron endpoint for draft outcome checking"
```

---

## Task 5: Lesson Extractor (`lib/lesson-extractor.ts`)

**Files:**
- Create: `lib/lesson-extractor.ts`
- Create: `tests/lib/lesson-extractor.test.ts`

- [ ] **Step 1: Write failing tests for pattern grouping**

```typescript
// tests/lib/lesson-extractor.test.ts
import { describe, it, expect } from 'vitest';
import type { OutcomeEvent } from '@/lib/outcome-tracker';

describe('lesson-extractor', () => {
  it('groups outcomes by character', async () => {
    const { groupByCharacter } = await import('@/lib/lesson-extractor');
    const events: OutcomeEvent[] = [
      { timestamp: '2026-03-20', character: 'scholar', signalType: 'draft-outcome', outcome: 'negative', details: {} },
      { timestamp: '2026-03-21', character: 'scholar', signalType: 'draft-outcome', outcome: 'negative', details: {} },
      { timestamp: '2026-03-22', character: 'clerk', signalType: 'draft-outcome', outcome: 'positive', details: {} },
    ];
    const grouped = groupByCharacter(events);
    expect(grouped.scholar).toHaveLength(2);
    expect(grouped.clerk).toHaveLength(1);
  });

  it('detects repeated negative patterns', async () => {
    const { detectPatterns } = await import('@/lib/lesson-extractor');
    const events: OutcomeEvent[] = [
      { timestamp: '2026-03-20', character: 'curator', signalType: 'draft-outcome', outcome: 'negative', details: { status: 'sent-heavy-edit', recipient: 'gallery@example.com' } },
      { timestamp: '2026-03-21', character: 'curator', signalType: 'draft-outcome', outcome: 'negative', details: { status: 'sent-heavy-edit', recipient: 'gallery@example.com' } },
      { timestamp: '2026-03-22', character: 'curator', signalType: 'draft-outcome', outcome: 'negative', details: { status: 'sent-heavy-edit', recipient: 'other@example.com' } },
    ];
    const patterns = detectPatterns(events);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].type).toBe('repeated-negative');
  });

  it('detects recipient-specific divergence', async () => {
    const { detectPatterns } = await import('@/lib/lesson-extractor');
    const events: OutcomeEvent[] = [
      { timestamp: '2026-03-20', character: 'curator', signalType: 'draft-outcome', outcome: 'negative', details: { recipient: 'gallery@art.com' } },
      { timestamp: '2026-03-21', character: 'curator', signalType: 'draft-outcome', outcome: 'strong-negative', details: { recipient: 'gallery@art.com' } },
      { timestamp: '2026-03-22', character: 'curator', signalType: 'draft-outcome', outcome: 'positive', details: { recipient: 'uni@edu.tr' } },
    ];
    const patterns = detectPatterns(events);
    const recipientPattern = patterns.find(p => p.type === 'recipient-divergence');
    expect(recipientPattern).toBeDefined();
  });

  it('formats a lesson prompt correctly', async () => {
    const { buildLessonPrompt } = await import('@/lib/lesson-extractor');
    const patterns = [
      { type: 'repeated-negative' as const, count: 4, summary: '4 of 6 email drafts deleted' },
    ];
    const prompt = buildLessonPrompt('postman', patterns);
    expect(prompt).toContain('postman');
    expect(prompt).toContain('4 of 6');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npx vitest run tests/lib/lesson-extractor.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement lesson-extractor.ts**

Uses hash-based deduplication for memory writing (hashes the lesson text without date prefix, compares against existing memory line hashes).

```typescript
// lib/lesson-extractor.ts
import crypto from 'crypto';
import { getOutcomes, type OutcomeEvent } from './outcome-tracker';
import { spawnOnce } from './spawn';
import fs from 'fs';
import path from 'path';
import { CHARACTERS_DIR } from './config';

export type Pattern = {
  type: 'repeated-negative' | 'repeated-positive' | 'recipient-divergence' | 'engagement-drop';
  count: number;
  summary: string;
  details?: Record<string, unknown>;
};

export function groupByCharacter(events: OutcomeEvent[]): Record<string, OutcomeEvent[]> {
  const groups: Record<string, OutcomeEvent[]> = {};
  for (const e of events) {
    (groups[e.character] ||= []).push(e);
  }
  return groups;
}

export function detectPatterns(events: OutcomeEvent[]): Pattern[] {
  const patterns: Pattern[] = [];
  const negatives = events.filter(e => e.outcome === 'negative' || e.outcome === 'strong-negative');
  const positives = events.filter(e => e.outcome === 'positive');
  const total = events.length;

  if (negatives.length >= 3) {
    patterns.push({
      type: 'repeated-negative',
      count: negatives.length,
      summary: `${negatives.length} of ${total} outcomes were negative`,
      details: { negativeRate: Math.round((negatives.length / total) * 100) },
    });
  }

  if (positives.length >= 5 && positives.length / total > 0.7) {
    patterns.push({
      type: 'repeated-positive',
      count: positives.length,
      summary: `${positives.length} of ${total} outcomes were positive`,
    });
  }

  // Recipient-specific divergence (draft outcomes only)
  const draftEvents = events.filter(e => e.signalType === 'draft-outcome');
  const byRecipient: Record<string, OutcomeEvent[]> = {};
  for (const e of draftEvents) {
    const r = (e.details.recipient as string) || 'unknown';
    (byRecipient[r] ||= []).push(e);
  }
  for (const [recipient, rEvents] of Object.entries(byRecipient)) {
    const rNeg = rEvents.filter(e => e.outcome === 'negative' || e.outcome === 'strong-negative');
    if (rNeg.length >= 2 && rNeg.length / rEvents.length > 0.5) {
      patterns.push({
        type: 'recipient-divergence',
        count: rNeg.length,
        summary: `${rNeg.length} of ${rEvents.length} drafts to ${recipient} were edited/deleted`,
        details: { recipient },
      });
    }
  }

  return patterns;
}

export function buildLessonPrompt(character: string, patterns: Pattern[]): string {
  const patternText = patterns.map(p =>
    `- ${p.type}: ${p.summary}${p.details ? ` (${JSON.stringify(p.details)})` : ''}`
  ).join('\n');

  return `You are analyzing behavioral patterns for the "${character}" character in an agent system.

Based on these observed patterns from the last 2 weeks:
${patternText}

Write 1-3 concise behavioral lessons for the character's memory file. Each lesson should:
- Start with [+] for positive reinforcement or [-] for corrections
- Include today's date (${new Date().toISOString().split('T')[0]})
- Be actionable and specific (not generic advice)
- Be under 120 characters

Example format:
[-] 2026-03-24: Drafts to gallery contacts get heavily edited. Use less formal tone for art world emails.
[+] 2026-03-24: University admin drafts sent as-is. Current formal tone works for institutional emails.

Output only the lesson lines, nothing else.`;
}

/** Hash a lesson line (without date) for deduplication */
function lessonHash(line: string): string {
  // Strip date prefix and leading markers like [+], [-], [!]
  const normalized = line.replace(/^\[.\]\s*\d{4}-\d{2}-\d{2}:\s*/, '').trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

/** Extract lessons for a single character. Returns lessons written. */
export async function extractLessons(character: string): Promise<string[]> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const allEvents = getOutcomes({ character });
  const recentEvents = allEvents.filter(e => e.timestamp > cutoff);

  if (recentEvents.length < 3) return [];

  const patterns = detectPatterns(recentEvents);
  if (patterns.length === 0) return [];

  const prompt = buildLessonPrompt(character, patterns);
  const rawLessons = await spawnOnce({ prompt, model: 'sonnet' });

  const lessons = rawLessons
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('[+]') || l.startsWith('[-]') || l.startsWith('[!]'));

  if (lessons.length === 0) return [];

  const memoryPath = findMemoryPath(character);
  if (!memoryPath) return [];

  let existing = '';
  try { existing = fs.readFileSync(memoryPath, 'utf-8'); } catch {}

  // Deduplicate via hash comparison
  const existingHashes = new Set(
    existing.split('\n')
      .filter(l => l.startsWith('['))
      .map(l => lessonHash(l))
  );
  const newLessons = lessons.filter(l => !existingHashes.has(lessonHash(l)));

  if (newLessons.length === 0) return [];

  // Append under auto-generated section, respect 100-line cap
  const lines = existing.split('\n').filter(l => l.trim());
  const autoHeader = '# Self-learning (auto-generated)';
  if (!lines.includes(autoHeader)) lines.push('', autoHeader);
  lines.push(...newLessons);

  // If over 100 lines, trim oldest auto-generated entries
  if (lines.length > 100) {
    const autoIdx = lines.indexOf(autoHeader);
    if (autoIdx >= 0) {
      const manualLines = lines.slice(0, autoIdx);
      const autoLines = lines.slice(autoIdx);
      const budget = 100 - manualLines.length;
      const trimmed = [...manualLines, ...autoLines.slice(-budget)];
      fs.writeFileSync(memoryPath, trimmed.join('\n') + '\n');
    }
  } else {
    fs.writeFileSync(memoryPath, lines.join('\n') + '\n');
  }

  return newLessons;
}

function findMemoryPath(character: string): string | null {
  for (const tier of ['core', 'meta', 'stationed']) {
    const memPath = path.join(CHARACTERS_DIR, tier, `${character}.memory.md`);
    if (fs.existsSync(memPath)) return memPath;
    // Check character config for custom memory file name
    const configPath = path.join(CHARACTERS_DIR, tier, `${character}.json`);
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.memoryFile) {
        const customPath = path.join(CHARACTERS_DIR, tier, config.memoryFile);
        if (fs.existsSync(customPath)) return customPath;
      }
    } catch {}
  }
  return null;
}

/** Extract lessons for all characters. Returns summary. */
export async function extractAllLessons(): Promise<Record<string, string[]>> {
  const allEvents = getOutcomes();
  const grouped = groupByCharacter(allEvents);
  const results: Record<string, string[]> = {};

  for (const character of Object.keys(grouped)) {
    try {
      const lessons = await extractLessons(character);
      if (lessons.length > 0) results[character] = lessons;
    } catch {}
  }

  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npx vitest run tests/lib/lesson-extractor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/keremozanbayraktar/Projects/ground-control
git add lib/lesson-extractor.ts tests/lib/lesson-extractor.test.ts
git commit -m "feat: add lesson extractor with pattern detection and memory writing"
```

---

## Task 6: Lesson Extraction API Endpoint

**Files:**
- Create: `app/api/outcomes/extract-lessons/route.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
// app/api/outcomes/extract-lessons/route.ts
export const runtime = 'nodejs';
import { extractLessons, extractAllLessons } from '@/lib/lesson-extractor';
import { apiOk, apiError } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

/** POST: trigger lesson extraction. Body: { character?: string } */
export async function POST(req: Request) {
  try {
    const body = await req.json() as { character?: string };

    if (body.character) {
      const lessons = await extractLessons(body.character);
      return apiOk({ character: body.character, lessons });
    }

    const results = await extractAllLessons();
    return apiOk({ results });
  } catch (err) {
    captureError('outcomes/extract-lessons', err);
    return apiError(500, String(err));
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/keremozanbayraktar/Projects/ground-control
git add app/api/outcomes/extract-lessons/route.ts
git commit -m "feat: add lesson extraction API endpoint"
```

---

## Task 7: Usage Analytics and Outcomes API

**Files:**
- Create: `lib/usage-analytics.ts`
- Create: `app/api/outcomes/route.ts`

- [ ] **Step 1: Implement usage-analytics.ts**

Pruning runs separately (not on every write) to keep high-frequency writes fast.

```typescript
// lib/usage-analytics.ts
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.__TEST_DATA_DIR || path.join(process.cwd(), 'data');
const ANALYTICS_PATH = path.join(DATA_DIR, 'usage-analytics.json');
const MAX_AGE_DAYS = 30;

export type UsageEventType = 'panel-open' | 'action-click' | 'chat-start' | 'chat-end' | 'job-view';

export type UsageEvent = {
  timestamp: string;
  type: UsageEventType;
  character: string;
  details?: Record<string, unknown>;
};

function readEvents(): UsageEvent[] {
  try { return JSON.parse(fs.readFileSync(ANALYTICS_PATH, 'utf-8')); }
  catch { return []; }
}

function writeEvents(events: UsageEvent[]) {
  fs.mkdirSync(path.dirname(ANALYTICS_PATH), { recursive: true });
  fs.writeFileSync(ANALYTICS_PATH, JSON.stringify(events, null, 2));
}

export function recordUsage(event: Omit<UsageEvent, 'timestamp'>) {
  const existing = readEvents();
  existing.unshift({ timestamp: new Date().toISOString(), ...event });
  writeEvents(existing);
}

export function pruneUsageEvents() {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const events = readEvents().filter(e => e.timestamp > cutoff);
  writeEvents(events);
}

export function getUsageSummary(): Record<string, { total: number; byType: Record<string, number> }> {
  const events = readEvents();
  const summary: Record<string, { total: number; byType: Record<string, number> }> = {};
  for (const e of events) {
    if (!summary[e.character]) summary[e.character] = { total: 0, byType: {} };
    summary[e.character].total++;
    summary[e.character].byType[e.type] = (summary[e.character].byType[e.type] || 0) + 1;
  }
  return summary;
}
```

- [ ] **Step 2: Create the outcomes API route**

```typescript
// app/api/outcomes/route.ts
export const runtime = 'nodejs';
import { getOutcomes } from '@/lib/outcome-tracker';
import { getUsageSummary, recordUsage, type UsageEventType } from '@/lib/usage-analytics';
import { apiOk, apiError } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

/** GET: return outcome summary + usage analytics */
export async function GET() {
  try {
    const outcomes = getOutcomes({ limit: 50 });
    const usage = getUsageSummary();
    return apiOk({ outcomes, usage });
  } catch (err) {
    captureError('outcomes/get', err);
    return apiError(500, String(err));
  }
}

/** POST: record a usage event from the dashboard */
export async function POST(req: Request) {
  try {
    const body = await req.json() as { type: UsageEventType; character: string; details?: Record<string, unknown> };
    if (!body.type || !body.character) {
      return apiError(400, 'type and character required');
    }
    recordUsage({
      type: body.type,
      character: body.character,
      details: body.details,
    });
    return apiOk({ recorded: true });
  } catch (err) {
    captureError('outcomes/post', err);
    return apiError(400, String(err));
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/keremozanbayraktar/Projects/ground-control
git add lib/usage-analytics.ts app/api/outcomes/route.ts
git commit -m "feat: add usage analytics tracking and outcomes API"
```

---

## Task 8: Wire Chat Correction Detection

**Files:**
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: Add correction detection**

At the top of `app/api/chat/route.ts`, add imports:

```typescript
import { recordOutcome } from '@/lib/outcome-tracker';
import { recordUsage } from '@/lib/usage-analytics';
```

Add a correction detection helper after the imports:

```typescript
const CORRECTION_PATTERNS = [
  /^no[,.\s]/i, /^wrong/i, /^not that/i, /^instead[,.\s]/i,
  /^make it/i, /^change (it|this|that) to/i,
  /I (said|already told|asked)/i, /^don't /i, /^stop /i,
];

function detectCorrection(userMsg: string): boolean {
  return CORRECTION_PATTERNS.some(p => p.test(userMsg.trim()));
}
```

Inside the POST handler, before `return apiStream(stream)`, add usage tracking:

```typescript
recordUsage({ type: 'chat-start', character: characterId });
```

After building `taskContent` (around line 68), add correction detection:

```typescript
if (history && history.length >= 2) {
  if (detectCorrection(message)) {
    const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant');
    recordOutcome({
      character: characterId,
      signalType: 'chat-correction',
      outcome: 'negative',
      details: {
        correction: message.slice(0, 200),
        assistantSaid: lastAssistantMsg?.content?.slice(0, 200) || '',
      },
    });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/keremozanbayraktar/Projects/ground-control
git add app/api/chat/route.ts
git commit -m "feat: detect chat corrections and record as outcome events"
```

---

## Task 9: Wire Job Outcome Tracking

**Files:**
- Modify: `app/api/schedule/run/route.ts`

- [ ] **Step 1: Add outcome recording after job completion**

At top of `app/api/schedule/run/route.ts`, add:

```typescript
import { recordOutcome } from '@/lib/outcome-tracker';
```

After `markJobRun(jobId, 'success')` (around line 206), add:

```typescript
recordOutcome({
  character: charName,
  signalType: 'usage',
  outcome: 'completed',
  details: { jobId, durationMs: result.durationMs, label },
});
```

After `markJobRun(jobId, 'error')` (around line 211), add:

```typescript
recordOutcome({
  character: charName,
  signalType: 'usage',
  outcome: 'error',
  details: { jobId, error: String(err), label },
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/keremozanbayraktar/Projects/ground-control
git add app/api/schedule/run/route.ts
git commit -m "feat: record job completion outcomes for character tracking"
```

---

## Task 10: Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Type check the entire project**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Start dev server and verify endpoints respond**

Run: `cd /Users/keremozanbayraktar/Projects/ground-control && npm run dev` (in background)

Then test:
- `curl http://localhost:3000/api/outcomes` should return `{ outcomes: [], usage: {} }`
- `curl http://localhost:3000/api/outcomes/check-drafts` should return `{ checked: 0, resolved: 0 }`
- `curl -X POST http://localhost:3000/api/outcomes -H 'Content-Type: application/json' -d '{"type":"panel-open","character":"scholar"}'` should return `{ recorded: true }`

- [ ] **Step 4: Final commit if any fixes needed**

```bash
cd /Users/keremozanbayraktar/Projects/ground-control
git add -A && git commit -m "fix: integration fixes for self-learning system"
```

---

## Summary

| Task | What it builds | Spec phase |
|------|---------------|------------|
| 1 | Outcome event storage | Foundation |
| 2 | Draft fate checker with edit distance | Phase 2 |
| 3 | Pipeline -> draft tracking wiring | Phase 2 |
| 4 | Draft check cron endpoint | Phase 2 |
| 5 | Lesson extractor (pattern -> memory) | Phase 5 |
| 6 | Lesson extraction API | Phase 5 |
| 7 | Usage analytics + outcomes API | Phase 3 |
| 8 | Chat correction detection | Phase 1 |
| 9 | Job outcome tracking | Phase 3 |
| 10 | Integration verification | All |

**Deferred:** Phase 4 (Tana outcome tracking) requires extending Archivist's nightly skill, which is a skill modification gated by Architect review per SYSTEM-MANIFEST. The infrastructure here (outcome-tracker, lesson-extractor) supports it with zero code changes when ready.

**Scheduling note:** The draft checker cron (`/api/outcomes/check-drafts`) and weekly lesson extraction (`/api/outcomes/extract-lessons`) need cron entries added to the scheduler config. The draft checker should run every 2 hours. Lesson extraction should run weekly (Sunday night). These are config-only changes in `ground-control.config.ts` after the code is deployed.
