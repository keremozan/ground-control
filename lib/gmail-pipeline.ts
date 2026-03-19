import fs from 'fs';
import { getMessage, getEmailBody, searchSentTo, searchDrafts, createDraft, archiveEmail } from './gmail';
import { quickFilter } from './email-filters';
import { geminiJSON } from './gemini';
import { logPipelineEntry, isMessageProcessed, getPipelineLog, type StageResult, type PipelineEntry } from './pipeline-log';
import { spawnOnce } from './spawn';
import { mcpCall } from './tana';
import { semanticSearch } from './semantic-search';
import { TANA_INBOX_ID, GEMINI_API_KEY, SHARED_DIR } from './config';

// ── Types ──

export type EmailInput = {
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
  type: 'create_task' | 'create_opportunity' | 'create_event' | 'draft_reply' | 'escalate' | 'archive';
  title?: string;
  character?: string;
  track?: string;
  priority?: string;
  due?: string;
  intent?: string;
  reason?: string;
  date?: string;
  time?: string;
  duration?: number;
};

type ClassifyResult = { actionable: boolean; reason: string };
type RouteResult = { actions: RouteAction[] };

// ── Character reply detection ──

const CHARACTER_SUBJECT_PATTERNS: { pattern: RegExp; character: string; taskTitle: string }[] = [
  { pattern: /\[Tutor Test\]/i, character: 'tutor', taskTitle: 'Score test reply' },
  { pattern: /\[Tutor\]/i, character: 'tutor', taskTitle: 'Process lesson feedback' },
  { pattern: /\[Coach\]/i, character: 'coach', taskTitle: 'Process check-in reply' },
  { pattern: /\[Doctor\]/i, character: 'doctor', taskTitle: 'Process health reply' },
  { pattern: /\[Scholar\]/i, character: 'scholar', taskTitle: 'Process research reply' },
  { pattern: /\[Curator\]/i, character: 'curator', taskTitle: 'Process exhibition reply' },
  { pattern: /\[Proctor\]/i, character: 'proctor', taskTitle: 'Process teaching reply' },
  { pattern: /\[Clerk\]/i, character: 'clerk', taskTitle: 'Process admin reply' },
  { pattern: /\[Postman\]/i, character: 'postman', taskTitle: 'Process communication reply' },
];

function detectCharacterReply(subject: string): { character: string; taskTitle: string } | null {
  // Only detect replies, not original outgoing emails
  if (!/^Re:/i.test(subject)) return null;
  for (const { pattern, character, taskTitle } of CHARACTER_SUBJECT_PATTERNS) {
    if (pattern.test(subject)) return { character, taskTitle };
  }
  return null;
}

// ── Self-sent system email detection ──

const SYSTEM_SUBJECT_PATTERNS = [
  /Morning Brief/i,
  /\[Tutor\]/i,
  /\[Coach\]/i,
  /\[Doctor\]/i,
  /\[Scholar\]/i,
  /\[Watcher\]/i,
  /\[Kybernetes\]/i,
  /\[Oracle\]/i,
];

function isSelfSentSystemEmail(email: EmailInput): boolean {
  // Emails from Kerem to Kerem with system subject patterns (reports, lessons, etc.)
  const fromSelf = email.fromRaw.includes('kerem.ozan@gmail.com') || email.fromRaw.includes('keremozan.bayraktar@');
  if (!fromSelf) return false;
  // Replies to system emails (Re: [Tutor]...) should NOT be skipped -- they go to Stage 1.5
  if (/^Re:/i.test(email.subject)) return false;
  return SYSTEM_SUBJECT_PATTERNS.some(p => p.test(email.subject));
}

// ── Load routing table ──

function loadRoutingContext(): string {
  try {
    const content = fs.readFileSync(`${SHARED_DIR}/routing-table.md`, 'utf-8');
    // Extract the Source -> Character and Content Keywords sections
    const sourceSection = content.match(/## Source -> Character[\s\S]*?(?=##|$)/)?.[0] || '';
    return sourceSection.trim();
  } catch {
    return '';
  }
}

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
- { "type": "create_opportunity", "title": "...", "character": "...", "track": "...", "due": "YYYY-MM-DD or null" }
- { "type": "create_event", "title": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "duration": minutes }
- { "type": "draft_reply", "intent": "what the reply should convey" }
- { "type": "escalate", "character": "...", "reason": "why this needs full character session" }
- { "type": "archive", "reason": "..." }

An email can have multiple actions (e.g., reply + create task).

Use create_opportunity (not create_task) for: conference CFPs, exhibition open calls, residency programs, fellowship announcements, grant opportunities, journal calls for papers. These are opportunities to evaluate, not tasks to do.

Character routing:
- clerk: university admin, KAF forms, grants, petitions, student advising, HR, finance
- proctor: teaching, courses, SUCourse, assignments, student content questions
- curator: art, exhibitions, galleries, artist communications
- scholar: research, academic papers, conferences, brainstorming, CFPs
- coach: personal, wellbeing
- doctor: health, medical
- steward: calendar, scheduling, meetings
- postman: general communications that don't fit above

{{routingContext}}

Track examples: "Sabanci Office Jobs", "Cambridge Plant Workshop", "Mondial Exhibition", "VA 204", "VA 315"

Escalate when: attachments need review, complex multi-step admin, thesis evaluation, anything requiring deep context.

Today's date: {{date}}

Email:
From: {{from}}
Subject: {{subject}}
Body: {{body}}`;

// ── Tana task creation helper ──

const ASSIGNED_MAP: Record<string, string> = {
  postman: 'NqMuiXnJ8NEg', scholar: '7Xoa3mdCTK1t', proctor: 'QQkKqejpmGyv',
  clerk: 'SrqWi1I529WC', coach: 'cK-0HFGW1odT', curator: 'oaQx18xu9GD4',
  architect: '6mku-XrMqemu', steward: 'oPQV0ekG2UyK',
  archivist: 'tpuD7FytFy9d',
  doctor: 'pHBzKcvvxCN5',
  tutor: 'Xl4WjK42NXgp',
};

const PRIORITY_MAP: Record<string, string> = {
  high: 'dybSAOXOLRVn', medium: 'AZJRnhlWG_OJ', low: 'vb2-NBem7wRe',
};

async function createTanaTask(opts: {
  title: string;
  character: string;
  priority?: string;
  due?: string;
  track?: string;
  source?: string;
  threadId?: string;
}): Promise<void> {
  const assignedId = ASSIGNED_MAP[opts.character] || ASSIGNED_MAP.postman;
  const priorityId = PRIORITY_MAP[opts.priority || 'medium'] || PRIORITY_MAP.medium;
  const lines = [
    `- ${opts.title} #[[^tuoCgN5Y6sn9]]`,
    `  - [[^wRd8g4jr7Nqr]]:: [[^TQt9EnvCFbPW]]`,
    `  - [[^kOYlKvF3ddrT]]:: [[^${assignedId}]]`,
    `  - [[^C5ObhnBmyHvm]]:: [[^${priorityId}]]`,
  ];
  if (opts.due) lines.push(`  - [[^8EVxOhX0Tnc4]]:: ${opts.due}`);
  if (opts.track) lines.push(`  - Source: ${opts.track}`);
  if (opts.source) lines.push(`  - Pipeline: ${opts.source}`);
  if (opts.threadId) lines.push(`  - Thread: ${opts.threadId}`);

  await mcpCall('tools/call', {
    name: 'import_tana_paste',
    arguments: { content: lines.join('\n'), parentNodeId: TANA_INBOX_ID },
  });
}

// ── Pipeline ──

export async function processEmail(email: EmailInput): Promise<PipelineEntry> {
  const stages: StageResult[] = [];
  const startTotal = Date.now();
  let finalAction = 'unknown';

  // Skip if already processed
  if (isMessageProcessed(email.id)) {
    return {
      messageId: email.id, threadId: email.threadId,
      from: email.from, subject: email.subject, account: email.account,
      receivedAt: email.date, stages: [], totalMs: 0,
      finalAction: 'skipped (already processed)',
    };
  }

  // ── Stage 0.5: Skip self-sent system emails ──
  if (isSelfSentSystemEmail(email)) {
    stages.push({ stage: 0, name: 'self-sent', result: 'skipped', reason: 'system-generated email from self', ms: 0 });
    finalAction = 'skipped (self-sent system email)';
    const entry: PipelineEntry = {
      messageId: email.id, threadId: email.threadId,
      from: email.from, subject: email.subject, account: email.account,
      receivedAt: email.date, stages, totalMs: Date.now() - startTotal, finalAction,
    };
    logPipelineEntry(entry);
    return entry;
  }

  // ── Stage 1: Quick Filter ──
  const s1Start = Date.now();
  const filterResult = quickFilter(email);
  stages.push({
    stage: 1, name: 'filter',
    result: filterResult.action === 'archive' ? 'skipped' : 'passed',
    reason: filterResult.action === 'archive' ? filterResult.reason : 'passed to classifier',
    ms: Date.now() - s1Start,
  });

  if (filterResult.action === 'archive') {
    finalAction = 'skipped (filter)';
    const entry: PipelineEntry = {
      messageId: email.id, threadId: email.threadId,
      from: email.from, subject: email.subject, account: email.account,
      receivedAt: email.date, stages, totalMs: Date.now() - startTotal, finalAction,
    };
    logPipelineEntry(entry);
    return entry;
  }

  // ── Stage 1.5: Character reply detection ──
  // If the subject contains [Tutor], [Coach], etc., this is a reply to a character email.
  // Route directly to the originating character. Skip classification + routing.
  const charReply = detectCharacterReply(email.subject);
  if (charReply) {
    const s15Start = Date.now();
    try {
      await createTanaTask({
        title: `${charReply.taskTitle} -- ${email.subject}`,
        character: charReply.character,
        priority: 'high',
        source: `from ${email.from}, ${email.subject}`,
        threadId: email.threadId,
      });
      stages.push({
        stage: 1, name: 'character-reply',
        result: 'routed to character',
        reason: `subject matches [${charReply.character}] pattern`,
        details: [`task created: "${charReply.taskTitle}" -> ${charReply.character}`],
        ms: Date.now() - s15Start,
      });
      finalAction = `character reply -> ${charReply.character}`;
    } catch (err) {
      stages.push({
        stage: 1, name: 'character-reply',
        result: 'error',
        reason: `failed to create task: ${err}`,
        ms: Date.now() - s15Start,
      });
      finalAction = 'character reply (error)';
    }
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
    finalAction = 'skipped (classifier)';
    const entry: PipelineEntry = {
      messageId: email.id, threadId: email.threadId,
      from: email.from, subject: email.subject, account: email.account,
      receivedAt: email.date, stages, totalMs: Date.now() - startTotal, finalAction,
    };
    logPipelineEntry(entry);
    return entry;
  }

  // ── Stage 3: Route (Gemini Flash) ──
  const s3Start = Date.now();
  let actions: RouteAction[] = [];
  try {
    const body = await getEmailBody(email.account, email.id);
    const routingContext = loadRoutingContext();
    const prompt = ROUTE_PROMPT
      .replace('{{from}}', email.fromRaw)
      .replace('{{subject}}', email.subject)
      .replace('{{body}}', body.slice(0, 2000))
      .replace('{{date}}', new Date().toISOString().split('T')[0])
      .replace('{{routingContext}}', routingContext);
    const result = await geminiJSON<RouteResult>({
      model: 'gemini-2.5-flash',
      prompt,
      apiKey: GEMINI_API_KEY,
    });
    actions = result.actions || [];
  } catch (err) {
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
        case 'create_opportunity': {
          // Check 1: Did we already create a task from this email thread?
          const priorEntry = getPipelineLog(200).find(e =>
            e.threadId === email.threadId && e.messageId !== email.id &&
            (e.finalAction.includes('create_task') || e.finalAction.includes('create_opportunity')) &&
            e.stages.some(s => s.details?.some(d => d.startsWith('task created:') || d.startsWith('opportunity created:')))
          );

          if (priorEntry) {
            details.push(`thread update: "${action.title}" (prior item exists from ${priorEntry.subject})`);
            break;
          }

          // Check 2: Semantic search for existing similar tasks
          const searchTitle = action.title || '';
          if (searchTitle) {
            const matches = semanticSearch(searchTitle, { limit: 5, minSimilarity: 0.5 });
            const duplicate = matches.find(m => m.tags.includes('task') || m.tags.includes('opportunity'));
            if (duplicate) {
              details.push(`${action.type} skipped (duplicate, ${Math.round(duplicate.similarity * 100)}%): "${duplicate.name}"`);
              break;
            }
          }

          // Create the task/opportunity
          await createTanaTask({
            title: action.title || email.subject,
            character: action.character || 'postman',
            priority: action.priority,
            due: action.due,
            track: action.track,
            source: `from ${email.from}, ${email.subject}`,
            threadId: email.threadId,
          });
          const label = action.type === 'create_opportunity' ? 'opportunity' : 'task';
          details.push(`${label} created: "${action.title}" -> ${action.character}`);
          break;
        }

        case 'create_event':
          // TODO: Wire up Google Calendar event creation
          details.push(`event queued: "${action.title}" on ${action.date} at ${action.time}`);
          break;

        case 'draft_reply': {
          // Extract email address: "Name <user@example.com>" -> "user@example.com"
          const fromEmail = email.fromRaw.match(/<([^>]+)>/)?.[1]
            || (email.fromRaw.includes('@') ? email.fromRaw.trim() : null);
          if (!fromEmail) {
            details.push('draft skipped: could not extract sender email');
            break;
          }
          // Dedup: already replied in this thread?
          const sentResults = await searchSentTo(email.account, fromEmail, 3);
          if (sentResults.some(s => s.threadId === email.threadId)) {
            details.push('draft skipped: already replied in thread');
            break;
          }
          // Dedup: existing draft for this recipient?
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
