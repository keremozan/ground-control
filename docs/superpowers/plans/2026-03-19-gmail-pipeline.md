# Gmail Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 3 daily Postman email scan sessions with an event-driven pipeline that receives Gmail push notifications, classifies emails with Gemini (free), and executes actions (archive, create task, draft reply, escalate) directly from Ground Control.

**Architecture:** Gmail push notifications (via Google Pub/Sub + Cloudflare Tunnel) trigger a webhook in GC. Each email flows through 5 discrete stages: fetch → quick filter → classify (Gemini Flash-Lite) → route (Gemini Pro) → execute actions. Each stage logs its result to a pipeline log for dashboard visibility. Claude is only called for reply drafting and complex escalation.

**Tech Stack:** Next.js API routes, Google Gmail API (history.list, messages.get, users.watch), Google Pub/Sub, Gemini API (generativelanguage.googleapis.com), Cloudflare Tunnel, existing gmail.ts + google-auth.ts.

**Spec:** `docs/superpowers/specs/2026-03-19-gmail-pipeline-design.md`

---

### Task 1: Gemini API Client

**Files:**
- Create: `lib/gemini.ts`

A minimal client that calls the Gemini API with a prompt and returns structured JSON. Used by Stage 2 (Flash-Lite classification) and Stage 3 (Pro routing).

- [ ] **Step 1: Create the Gemini client**

```typescript
// lib/gemini.ts
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';

export type GeminiModel = 'gemini-2.5-flash-lite' | 'gemini-2.5-pro';

export async function geminiCall(opts: {
  model: GeminiModel;
  prompt: string;
  apiKey: string;
  jsonMode?: boolean;
}): Promise<string> {
  const { model, prompt, apiKey, jsonMode } = opts;
  const url = `${GEMINI_API}/${model}:generateContent?key=${apiKey}`;

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (jsonMode) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

export async function geminiJSON<T>(opts: {
  model: GeminiModel;
  prompt: string;
  apiKey: string;
}): Promise<T> {
  const text = await geminiCall({ ...opts, jsonMode: true });
  return JSON.parse(text) as T;
}
```

- [ ] **Step 2: Add Gemini API key to config**

Add to `ground-control.config.example.ts` after the calendar section:

```typescript
  gemini: {
    apiKey: "YOUR_GEMINI_API_KEY", // from https://aistudio.google.com/apikey
  },
```

Add to `lib/config.ts`:

```typescript
// ── Gemini ──────────────────────────────────────
export const GEMINI_API_KEY = (userConfig as Record<string, unknown> & { gemini?: { apiKey?: string } }).gemini?.apiKey || '';
```

- [ ] **Step 3: Add the API key to the real config file**

Add the `gemini` block to `ground-control.config.ts` with the actual API key from https://aistudio.google.com/apikey.

- [ ] **Step 4: Verify build**

Run: `cd ~/Projects/ground-control && npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/ground-control
git add lib/gemini.ts lib/config.ts ground-control.config.example.ts
git commit -m "feat: add Gemini API client for email classification"
```

---

### Task 2: Pipeline Log System

**Files:**
- Create: `lib/pipeline-log.ts`
- Create: `app/api/pipeline/log/route.ts`

The pipeline log records every email's journey through stages. This must exist before the pipeline stages so they can log to it.

- [ ] **Step 1: Create the pipeline log module**

```typescript
// lib/pipeline-log.ts
import fs from 'fs';
import path from 'path';

const LOG_PATH = path.join(process.cwd(), 'data', 'pipeline-log.json');
const MAX_ENTRIES = 500;

export type StageResult = {
  stage: number;
  name: string;
  result: string;
  reason?: string;
  actions?: string[];
  details?: string[];
  ms: number;
};

export type PipelineEntry = {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  account: string;
  receivedAt: string;
  stages: StageResult[];
  totalMs: number;
  finalAction: string;
};

function readLog(): PipelineEntry[] {
  try { return JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8')); }
  catch { return []; }
}

function writeLog(entries: PipelineEntry[]) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(entries.slice(0, MAX_ENTRIES), null, 2));
}

export function logPipelineEntry(entry: PipelineEntry) {
  const existing = readLog();
  writeLog([entry, ...existing]);
}

export function getPipelineLog(limit = 50): PipelineEntry[] {
  return readLog().slice(0, limit);
}

export function isMessageProcessed(messageId: string): boolean {
  const log = readLog();
  return log.some(e => e.messageId === messageId);
}
```

- [ ] **Step 2: Create the API route**

```typescript
// app/api/pipeline/log/route.ts
export const runtime = 'nodejs';
import { getPipelineLog } from '@/lib/pipeline-log';

export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get('limit') || '50');
  return Response.json({ entries: getPipelineLog(limit) });
}
```

- [ ] **Step 3: Verify build**

Run: `cd ~/Projects/ground-control && npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/ground-control
git add lib/pipeline-log.ts app/api/pipeline/log/
git commit -m "feat: add pipeline log system for email processing visibility"
```

---

### Task 3: Gmail History API Functions

**Files:**
- Modify: `lib/gmail.ts`
- Modify: `lib/job-state.ts`

Add the Gmail API functions needed for push notifications: history.list, messages.get (full), users.watch, draft creation, and sent-mail search.

- [ ] **Step 1: Add history.list function to gmail.ts**

Append to `lib/gmail.ts`:

```typescript
/** Get changes since a historyId. Returns new message IDs. */
export async function getHistoryChanges(account: string, startHistoryId: string): Promise<{
  messageIds: string[];
  newHistoryId: string;
}> {
  const messageIds: string[] = [];
  let pageToken: string | undefined;
  let latestHistoryId = startHistoryId;

  do {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: 'messageAdded',
      labelId: 'INBOX',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const data = await gmailFetch(`/history?${params}`, account);
    latestHistoryId = data.historyId || latestHistoryId;

    for (const record of data.history || []) {
      for (const added of record.messagesAdded || []) {
        const msg = added.message;
        if (msg?.id && msg.labelIds?.includes('INBOX')) {
          messageIds.push(msg.id);
        }
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return { messageIds: [...new Set(messageIds)], newHistoryId: latestHistoryId };
}

/** Get a single message with full metadata + snippet */
export async function getMessage(account: string, messageId: string): Promise<{
  id: string;
  threadId: string;
  from: string;
  fromRaw: string;
  subject: string;
  snippet: string;
  date: string;
  labels: string[];
}> {
  const msg = await gmailFetch(`/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, account);
  const headers = (msg.payload?.headers || []) as { name: string; value: string }[];
  const fromRaw = parseHeader(headers, 'From');
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: parseFrom(fromRaw),
    fromRaw,
    subject: parseHeader(headers, 'Subject') || '(no subject)',
    snippet: msg.snippet || '',
    date: parseHeader(headers, 'Date'),
    labels: (msg.labelIds || []) as string[],
  };
}

/** Set up Gmail push notifications. Returns expiration timestamp. */
export async function watchInbox(account: string, topicName: string): Promise<number> {
  const data = await gmailFetch('/watch', account, {
    method: 'POST',
    body: JSON.stringify({
      topicName,
      labelIds: ['INBOX'],
      labelFilterBehavior: 'include',
    }),
  });
  return Number(data.expiration);
}

/** Get current historyId for an account (used for initial checkpoint) */
export async function getProfile(account: string): Promise<{ historyId: string; emailAddress: string }> {
  const data = await gmailFetch('', account);
  return { historyId: data.historyId, emailAddress: data.emailAddress };
}

/** Search sent mail for recent replies to a specific email address */
export async function searchSentTo(account: string, toEmail: string, maxResults = 5): Promise<{ id: string; threadId: string; subject: string }[]> {
  const q = `in:sent to:${toEmail} newer_than:7d`;
  const data = await gmailFetch(`/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}`, account);
  if (!data.messages?.length) return [];
  const results = [];
  for (const m of data.messages.slice(0, maxResults)) {
    try {
      const msg = await gmailFetch(`/messages/${m.id}?format=metadata&metadataHeaders=Subject`, account);
      const headers = (msg.payload?.headers || []) as { name: string; value: string }[];
      results.push({ id: m.id, threadId: msg.threadId, subject: parseHeader(headers, 'Subject') });
    } catch {}
  }
  return results;
}

/** Search existing drafts for a recipient + topic */
export async function searchDrafts(account: string, toEmail: string): Promise<{ id: string; subject: string }[]> {
  const data = await gmailFetch('/drafts?maxResults=10', account);
  if (!data.drafts?.length) return [];
  const results = [];
  for (const d of data.drafts.slice(0, 10)) {
    try {
      const draft = await gmailFetch(`/drafts/${d.id}`, account);
      const headers = (draft.message?.payload?.headers || []) as { name: string; value: string }[];
      const to = parseHeader(headers, 'To');
      if (to.toLowerCase().includes(toEmail.toLowerCase())) {
        results.push({ id: d.id, subject: parseHeader(headers, 'Subject') });
      }
    } catch {}
  }
  return results;
}

/** Create a Gmail draft */
export async function createDraft(account: string, opts: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
}): Promise<string> {
  const { to, subject, body, threadId, inReplyTo } = opts;
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
  ];
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`);
  const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`).toString('base64url');

  const reqBody: Record<string, unknown> = { message: { raw } };
  if (threadId) reqBody.message = { ...reqBody.message as object, threadId };

  const data = await gmailFetch('/drafts', account, {
    method: 'POST',
    body: JSON.stringify(reqBody),
  });
  return data.id;
}
```

- [ ] **Step 2: Add historyId tracking to job-state.ts**

Add to `lib/job-state.ts`:

```typescript
export type HistoryState = Record<string, string>; // account -> historyId

const HISTORY_FILE = path.join(process.cwd(), 'data', 'gmail-history.json');

export function readHistoryState(): HistoryState {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')); }
  catch { return {}; }
}

export function writeHistoryId(account: string, historyId: string) {
  const state = readHistoryState();
  state[account] = historyId;
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(state, null, 2));
}
```

- [ ] **Step 3: Verify build**

Run: `cd ~/Projects/ground-control && npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/ground-control
git add lib/gmail.ts lib/job-state.ts
git commit -m "feat: add Gmail history API, watch, draft creation, and historyId tracking"
```

---

### Task 4: Email Filter (Stage 1 — Deterministic)

**Files:**
- Create: `lib/email-filters.ts`
- Create: `data/email-filters.json`

Stage 1 filters out newsletters, notifications, and promotions without any LLM call.

- [ ] **Step 1: Create the seed filter data**

```json
// data/email-filters.json
{
  "newsletterPatterns": [
    "noreply@",
    "notification@",
    "notifications@",
    "no-reply@",
    "mailer-daemon@",
    "postmaster@",
    "newsletter@",
    "digest@",
    "updates@",
    "info@substack.com",
    "sent@mailchimp.com",
    "bounce@",
    "@marketing.",
    "@promo."
  ],
  "archiveSubjectPatterns": [
    "unsubscribe",
    "your receipt",
    "order confirmation",
    "shipping notification",
    "delivery notification"
  ]
}
```

- [ ] **Step 2: Create the filter module**

```typescript
// lib/email-filters.ts
import fs from 'fs';
import path from 'path';

const FILTERS_PATH = path.join(process.cwd(), 'data', 'email-filters.json');

type Filters = {
  newsletterPatterns: string[];
  archiveSubjectPatterns: string[];
};

function loadFilters(): Filters {
  try { return JSON.parse(fs.readFileSync(FILTERS_PATH, 'utf-8')); }
  catch { return { newsletterPatterns: [], archiveSubjectPatterns: [] }; }
}

export type FilterResult =
  | { action: 'archive'; reason: string }
  | { action: 'classify'; flags: { newContact?: boolean } };

export function quickFilter(email: {
  from: string;
  fromRaw: string;
  subject: string;
  labels: string[];
}): FilterResult {
  const { fromRaw, subject, labels } = email;
  const fromLower = fromRaw.toLowerCase();
  const subjectLower = subject.toLowerCase();
  const filters = loadFilters();

  // Gmail category labels
  const autoArchiveLabels = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'];
  if (labels.some(l => autoArchiveLabels.includes(l))) {
    return { action: 'archive', reason: `gmail category: ${labels.find(l => autoArchiveLabels.includes(l))}` };
  }

  // Newsletter/notification sender patterns
  for (const pattern of filters.newsletterPatterns) {
    if (fromLower.includes(pattern.toLowerCase())) {
      return { action: 'archive', reason: `sender matches pattern: ${pattern}` };
    }
  }

  // Subject patterns
  for (const pattern of filters.archiveSubjectPatterns) {
    if (subjectLower.includes(pattern.toLowerCase())) {
      return { action: 'archive', reason: `subject matches pattern: ${pattern}` };
    }
  }

  return { action: 'classify', flags: {} };
}
```

- [ ] **Step 3: Verify build**

Run: `cd ~/Projects/ground-control && npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/ground-control
git add lib/email-filters.ts data/email-filters.json
git commit -m "feat: add deterministic email filter (pipeline stage 1)"
```

---

### Task 5: Gmail Pipeline Engine (Stages 0-4)

**Files:**
- Create: `lib/gmail-pipeline.ts`

The core pipeline engine. Orchestrates all stages for a single email and logs results.

- [ ] **Step 1: Create the pipeline engine**

```typescript
// lib/gmail-pipeline.ts
import { getMessage, getEmailBody, searchSentTo, searchDrafts, createDraft, archiveEmail } from './gmail';
import { quickFilter } from './email-filters';
import { geminiJSON } from './gemini';
import { logPipelineEntry, isMessageProcessed, type StageResult, type PipelineEntry } from './pipeline-log';
import { spawnOnce } from './spawn';
import { GEMINI_API_KEY } from './config';

// ── Types ──

type EmailInput = {
  id: string;
  threadId: string;
  from: string;
  fromRaw: string;
  subject: string;
  snippet: string;
  date: string;
  labels: string[];
  account: string;
};

type RouteAction = {
  type: 'create_task' | 'create_event' | 'draft_reply' | 'escalate' | 'archive';
  title?: string;
  character?: string;
  track?: string;
  priority?: string;
  due?: string;
  intent?: string;
  reason?: string;
  // calendar
  date?: string;
  time?: string;
  duration?: number;
};

type ClassifyResult = { actionable: boolean; reason: string };
type RouteResult = { actions: RouteAction[] };

// ── Prompts ──

const CLASSIFY_PROMPT = `You are an email filter. Given an email, decide if it requires human action.

Return JSON: { "actionable": boolean, "reason": "brief explanation" }

Actionable means: someone needs to respond, do something, or make a decision.
NOT actionable: newsletters, automated notifications, receipts, FYI-only forwards, marketing.

Email:
From: {{from}}
Subject: {{subject}}
Preview: {{snippet}}`;

const ROUTE_PROMPT = `You are an email router for an academic at Sabanci University (Turkey).

Given this email, return a JSON object with an "actions" array. Each action is one of:
- { "type": "create_task", "title": "...", "character": "...", "track": "...", "priority": "low|medium|high", "due": "YYYY-MM-DD or null" }
- { "type": "create_event", "title": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "duration": minutes }
- { "type": "draft_reply", "intent": "what the reply should convey" }
- { "type": "escalate", "character": "...", "reason": "why this needs full character session" }
- { "type": "archive", "reason": "..." }

An email can have multiple actions (e.g., reply + create task).

Character routing:
- clerk: university admin, KAF forms, grants, petitions, student advising
- proctor: teaching, courses, SUCourse, assignments, student content questions
- curator: art, exhibitions, galleries, artist communications
- scholar: research, academic papers, conferences, brainstorming
- coach: personal, wellbeing
- doctor: health, medical
- steward: calendar, scheduling, meetings
- postman: general communications that don't fit above

Track examples: "Sabanci Office Jobs", "Cambridge Plant Workshop", "Mondial Exhibition", "VA 204", "VA 315"

Escalate when: attachments need review, complex multi-step admin, thesis evaluation, anything requiring deep context.

Today's date: {{date}}

Email:
From: {{from}}
Subject: {{subject}}
Body: {{body}}`;

// ── Pipeline ──

export async function processEmail(email: EmailInput): Promise<PipelineEntry> {
  const stages: StageResult[] = [];
  const startTotal = Date.now();
  let finalAction = 'unknown';

  // Skip if already processed
  if (isMessageProcessed(email.id)) {
    finalAction = 'skipped (already processed)';
    const entry: PipelineEntry = {
      messageId: email.id, threadId: email.threadId,
      from: email.from, subject: email.subject, account: email.account,
      receivedAt: email.date, stages: [], totalMs: 0, finalAction,
    };
    return entry;
  }

  // ── Stage 1: Quick Filter ──
  const s1Start = Date.now();
  const filterResult = quickFilter(email);
  stages.push({
    stage: 1, name: 'filter',
    result: filterResult.action === 'archive' ? 'archived' : 'passed',
    reason: filterResult.action === 'archive' ? filterResult.reason : 'passed to classifier',
    ms: Date.now() - s1Start,
  });

  if (filterResult.action === 'archive') {
    try { await archiveEmail(email.account, email.threadId); } catch {}
    finalAction = 'archived (filter)';
    const entry: PipelineEntry = {
      messageId: email.id, threadId: email.threadId,
      from: email.from, subject: email.subject, account: email.account,
      receivedAt: email.date, stages, totalMs: Date.now() - startTotal, finalAction,
    };
    logPipelineEntry(entry);
    return entry;
  }

  // ── Stage 2: Classify (Gemini Flash-Lite) ──
  const s2Start = Date.now();
  let actionable = true;
  let classifyReason = '';
  try {
    const prompt = CLASSIFY_PROMPT
      .replace('{{from}}', email.fromRaw)
      .replace('{{subject}}', email.subject)
      .replace('{{snippet}}', email.snippet);
    const result = await geminiJSON<ClassifyResult>({
      model: 'gemini-2.5-flash-lite',
      prompt,
      apiKey: GEMINI_API_KEY,
    });
    actionable = result.actionable;
    classifyReason = result.reason;
  } catch (err) {
    classifyReason = `classifier error: ${err}`;
    actionable = true; // on error, pass through to be safe
  }
  stages.push({
    stage: 2, name: 'classify',
    result: actionable ? 'actionable' : 'not actionable',
    reason: classifyReason,
    ms: Date.now() - s2Start,
  });

  if (!actionable) {
    try { await archiveEmail(email.account, email.threadId); } catch {}
    finalAction = 'archived (classifier)';
    const entry: PipelineEntry = {
      messageId: email.id, threadId: email.threadId,
      from: email.from, subject: email.subject, account: email.account,
      receivedAt: email.date, stages, totalMs: Date.now() - startTotal, finalAction,
    };
    logPipelineEntry(entry);
    return entry;
  }

  // ── Stage 3: Route (Gemini Pro) ──
  const s3Start = Date.now();
  let actions: RouteAction[] = [];
  try {
    // Fetch full body for routing (need more context than snippet)
    const body = await getEmailBody(email.account, email.id);
    const prompt = ROUTE_PROMPT
      .replace('{{from}}', email.fromRaw)
      .replace('{{subject}}', email.subject)
      .replace('{{body}}', body.slice(0, 2000))
      .replace('{{date}}', new Date().toISOString().split('T')[0]);
    const result = await geminiJSON<RouteResult>({
      model: 'gemini-2.5-pro',
      prompt,
      apiKey: GEMINI_API_KEY,
    });
    actions = result.actions || [];
  } catch (err) {
    // On routing error, escalate to postman
    actions = [{ type: 'escalate', character: 'postman', reason: `routing error: ${err}` }];
  }
  stages.push({
    stage: 3, name: 'route',
    result: 'routed',
    actions: actions.map(a => a.type),
    ms: Date.now() - s3Start,
  });

  // ── Stage 4: Execute Actions ──
  const s4Start = Date.now();
  const details: string[] = [];

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'archive':
          await archiveEmail(email.account, email.threadId);
          details.push('archived');
          break;

        case 'create_task':
          // TODO: Create Tana task via MCP (requires mcpCall from lib/tana.ts)
          // For now, log the intent
          details.push(`task: "${action.title}" → ${action.character} [${action.track}]`);
          break;

        case 'create_event':
          // TODO: Create Google Calendar event
          details.push(`event: "${action.title}" on ${action.date} at ${action.time}`);
          break;

        case 'draft_reply': {
          // Dedup check: already replied?
          const fromEmail = email.fromRaw.match(/<([^>]+)>/)?.[1] || email.fromRaw;
          const sentResults = await searchSentTo(email.account, fromEmail, 3);
          const threadReplied = sentResults.some(s => s.threadId === email.threadId);
          if (threadReplied) {
            details.push('draft skipped: already replied in thread');
            break;
          }
          // Dedup check: existing draft?
          const existingDrafts = await searchDrafts(email.account, fromEmail);
          if (existingDrafts.length > 0) {
            details.push(`draft skipped: existing draft found for ${fromEmail}`);
            break;
          }
          // Generate reply with Claude (single turn)
          const body = await getEmailBody(email.account, email.id);
          const replyText = await spawnOnce({
            prompt: `Draft a brief, professional email reply.\n\nOriginal email from ${email.from}:\nSubject: ${email.subject}\n\n${body.slice(0, 1500)}\n\nReply intent: ${action.intent}\n\nWrite only the reply body, no subject line, no greeting analysis. Be direct and concise. Match the language of the original email (Turkish or English).`,
            model: 'sonnet',
          });
          const draftId = await createDraft(email.account, {
            to: fromEmail,
            subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
            body: replyText,
            threadId: email.threadId,
          });
          details.push(`draft created: ${draftId}`);
          break;
        }

        case 'escalate':
          // TODO: Spawn character session via /api/schedule/run
          details.push(`escalated to ${action.character}: ${action.reason}`);
          break;
      }
    } catch (err) {
      details.push(`${action.type} failed: ${err}`);
    }
  }

  stages.push({
    stage: 4, name: 'execute',
    result: 'done',
    details,
    ms: Date.now() - s4Start,
  });

  finalAction = actions.map(a => a.type).join(', ');
  const entry: PipelineEntry = {
    messageId: email.id, threadId: email.threadId,
    from: email.from, subject: email.subject, account: email.account,
    receivedAt: email.date, stages, totalMs: Date.now() - startTotal, finalAction,
  };
  logPipelineEntry(entry);
  return entry;
}
```

Note: `create_task` and `create_event` have TODO markers. These use existing `lib/tana.ts` and `lib/google-calendar.ts` functions. They can be wired up in a follow-up task after the pipeline is working end-to-end with archive + draft_reply + escalate.

- [ ] **Step 2: Verify build**

Run: `cd ~/Projects/ground-control && npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/ground-control
git add lib/gmail-pipeline.ts
git commit -m "feat: gmail pipeline engine with 4-stage email processing"
```

---

### Task 6: Webhook Receiver + Catch-Up

**Files:**
- Create: `app/api/webhooks/gmail/route.ts`

Receives Gmail push notifications, debounces them, fetches new messages, and runs each through the pipeline. Also provides a catch-up endpoint for Mac wake scenarios.

- [ ] **Step 1: Create the webhook route**

```typescript
// app/api/webhooks/gmail/route.ts
export const runtime = 'nodejs';
import { getHistoryChanges, getMessage, getProfile, watchInbox } from '@/lib/gmail';
import { readHistoryState, writeHistoryId } from '@/lib/job-state';
import { processEmail } from '@/lib/gmail-pipeline';
import { GMAIL_ACCOUNTS } from '@/lib/config';

// Debounce: collect notifications for 2 seconds before processing
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const pendingAccounts = new Set<string>();

async function processPendingAccounts() {
  const accounts = [...pendingAccounts];
  pendingAccounts.clear();

  for (const account of accounts) {
    try {
      const historyState = readHistoryState();
      let startHistoryId = historyState[account];

      // If no checkpoint, get current historyId (first run)
      if (!startHistoryId) {
        const profile = await getProfile(account);
        writeHistoryId(account, profile.historyId);
        continue; // Nothing to process on first run, just set checkpoint
      }

      const { messageIds, newHistoryId } = await getHistoryChanges(account, startHistoryId);
      writeHistoryId(account, newHistoryId);

      for (const msgId of messageIds) {
        try {
          const email = await getMessage(account, msgId);
          // Skip sent messages (from self)
          if (email.labels.includes('SENT')) continue;
          await processEmail({ ...email, account });
        } catch {}
      }
    } catch (err) {
      console.error(`Pipeline error for ${account}:`, err);
    }
  }
}

// POST: Gmail push notification
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = JSON.parse(Buffer.from(body.message?.data || '', 'base64url').toString());
    const emailAddress = data.emailAddress;

    // Find which account this is
    const account = GMAIL_ACCOUNTS.find(a => {
      // Match by checking if we know this email address
      return true; // Will be refined when we have email→account mapping
    });

    if (account) {
      pendingAccounts.add(account);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(processPendingAccounts, 2000);
    }
  } catch {}

  // Always return 200 to acknowledge (Pub/Sub retries on non-200)
  return Response.json({ ok: true });
}

// GET: Manual catch-up (called on startup or by dashboard)
export async function GET() {
  const results: { account: string; processed: number; error?: string }[] = [];

  for (const account of GMAIL_ACCOUNTS) {
    try {
      const historyState = readHistoryState();
      let startHistoryId = historyState[account];

      if (!startHistoryId) {
        const profile = await getProfile(account);
        writeHistoryId(account, profile.historyId);
        results.push({ account, processed: 0 });
        continue;
      }

      const { messageIds, newHistoryId } = await getHistoryChanges(account, startHistoryId);
      writeHistoryId(account, newHistoryId);

      let processed = 0;
      for (const msgId of messageIds) {
        try {
          const email = await getMessage(account, msgId);
          if (email.labels.includes('SENT')) continue;
          await processEmail({ ...email, account });
          processed++;
        } catch {}
      }
      results.push({ account, processed });
    } catch (err) {
      results.push({ account, processed: 0, error: String(err) });
    }
  }

  return Response.json({ ok: true, results });
}
```

- [ ] **Step 2: Verify build**

Run: `cd ~/Projects/ground-control && npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/ground-control
git add app/api/webhooks/gmail/
git commit -m "feat: Gmail webhook receiver with debounce and catch-up endpoint"
```

---

### Task 7: Infrastructure Setup (Manual)

This task is not code -- it's infrastructure configuration that the user does once.

- [ ] **Step 1: Install Cloudflare Tunnel**

```bash
brew install cloudflared
```

- [ ] **Step 2: Create tunnel**

```bash
cloudflared tunnel login
cloudflared tunnel create ground-control
```

- [ ] **Step 3: Configure tunnel to point to localhost:3000**

Create `~/.cloudflared/config.yml`:
```yaml
tunnel: ground-control
credentials-file: /Users/keremozanbayraktar/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: gc.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

Or use quick tunnel for testing (no domain needed):
```bash
cloudflared tunnel --url http://localhost:3000
```

- [ ] **Step 4: Create Google Cloud Pub/Sub topic**

In Google Cloud Console (console.cloud.google.com):
1. Enable Pub/Sub API
2. Create topic: `gmail-notifications`
3. Grant `gmail-api-push@system.gserviceaccount.com` the **Pub/Sub Publisher** role on the topic
4. Create push subscription pointing to: `https://<your-tunnel-url>/api/webhooks/gmail`

- [ ] **Step 5: Set up Gmail watch**

Test the watch setup by calling the catch-up endpoint:
```bash
curl http://localhost:3000/api/webhooks/gmail
```

This initializes historyId checkpoints. Then set up the watch programmatically (can be added as a GC startup task or cron renewal).

- [ ] **Step 6: Test end-to-end**

1. Send yourself a test email
2. Watch the pipeline log: `curl http://localhost:3000/api/pipeline/log`
3. Verify the email went through stages 1-4
4. Check if the correct action was taken (archive, task, draft, escalate)

---

### Task 8: Wire Up Tana Task Creation (Stage 4)

**Files:**
- Modify: `lib/gmail-pipeline.ts`

Replace the TODO for `create_task` with actual Tana MCP calls using existing `lib/tana.ts`.

- [ ] **Step 1: Add Tana task creation import and implementation**

At the top of `lib/gmail-pipeline.ts`, add:
```typescript
import { mcpCall } from './tana'; // needs to be exported from tana.ts
import { TANA } from './tana-schema';
```

Note: `mcpCall` is currently not exported from `lib/tana.ts`. Add `export` to its declaration in `lib/tana.ts` (line 61: change `async function mcpCall` to `export async function mcpCall`).

Replace the `create_task` case in Stage 4:
```typescript
        case 'create_task': {
          const charMap: Record<string, string> = {
            clerk: 'SrqWi1I529WC', scholar: 'nBPGR1KZOOWM', proctor: 'JLzp0cJv7hMM',
            curator: 'oaQx18xu9GD4', coach: 'K5OAZZ2Wphky', postman: 'JdKNM14s6giG',
            steward: 'steward_id', doctor: 'doctor_id',
          };
          const assignedId = charMap[action.character || 'postman'] || charMap.postman;
          const trackLine = action.track ? `\n  - Track: ${action.track}` : '';
          const dueLine = action.due ? `\n  - Due: ${action.due}` : '';
          const paste = `- ${action.title} #[[^tuoCgN5Y6sn9]]\n  - [[^wRd8g4jr7Nqr]]:: [[^TQt9EnvCFbPW]]\n  - [[^kOYlKvF3ddrT]]:: [[^${assignedId}]]${trackLine}${dueLine}`;
          await mcpCall('tools/call', {
            name: 'import_tana_paste',
            arguments: { tanaPaste: paste, targetNodeId: 'Ozi-tyUuWLfR_CAPTURE_INBOX' },
          });
          details.push(`task created: "${action.title}" → ${action.character}`);
          break;
        }
```

- [ ] **Step 2: Export mcpCall from tana.ts**

In `lib/tana.ts` line 61, change:
```typescript
async function mcpCall(method: string, params: Record<string, unknown>) {
```
to:
```typescript
export async function mcpCall(method: string, params: Record<string, unknown>) {
```

- [ ] **Step 3: Verify build**

Run: `cd ~/Projects/ground-control && npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/ground-control
git add lib/gmail-pipeline.ts lib/tana.ts
git commit -m "feat: wire up Tana task creation in gmail pipeline stage 4"
```
