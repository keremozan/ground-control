import { getMessage, getEmailBody, searchSentTo, searchDrafts, createDraft, archiveEmail } from './gmail';
import { quickFilter } from './email-filters';
import { geminiJSON } from './gemini';
import { logPipelineEntry, isMessageProcessed, type StageResult, type PipelineEntry } from './pipeline-log';
import { spawnOnce } from './spawn';
import { mcpCall } from './tana';
import { TANA_INBOX_ID } from './config';
import { GEMINI_API_KEY } from './config';

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
  type: 'create_task' | 'create_event' | 'draft_reply' | 'escalate' | 'archive';
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
    return {
      messageId: email.id, threadId: email.threadId,
      from: email.from, subject: email.subject, account: email.account,
      receivedAt: email.date, stages: [], totalMs: 0,
      finalAction: 'skipped (already processed)',
    };
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
    const body = await getEmailBody(email.account, email.id);
    const prompt = ROUTE_PROMPT
      .replace('{{from}}', email.fromRaw)
      .replace('{{subject}}', email.subject)
      .replace('{{body}}', body.slice(0, 2000))
      .replace('{{date}}', new Date().toISOString().split('T')[0]);
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

        case 'create_task': {
          // Dedup: check Tana for existing similar tasks
          try {
            const searchResult = await mcpCall('tools/call', {
              name: 'semantic_search',
              arguments: { query: action.title, limit: 5, minSimilarity: 0.3 },
            });
            const matches = Array.isArray(searchResult) ? searchResult : [];
            const duplicate = matches.find((m: { name?: string; score?: number }) =>
              (m.score || 0) >= 0.5 || (m.name && action.title && m.name.toLowerCase().includes(action.title.toLowerCase().slice(0, 20)))
            );
            if (duplicate) {
              details.push(`task skipped (duplicate): "${(duplicate as { name?: string }).name || 'unknown'}"`);
              break;
            }
          } catch {} // If search fails, proceed with creation (better to duplicate than miss)

          // Map character name to Tana assigned option ID
          const assignedMap: Record<string, string> = {
            postman: 'NqMuiXnJ8NEg', scholar: '7Xoa3mdCTK1t', proctor: 'QQkKqejpmGyv',
            clerk: 'SrqWi1I529WC', coach: 'cK-0HFGW1odT', curator: 'oaQx18xu9GD4',
            architect: '6mku-XrMqemu', steward: 'oPQV0ekG2UyK', doctor: 'doctor',
            archivist: 'tpuD7FytFy9d',
          };
          const priorityMap: Record<string, string> = {
            high: 'dybSAOXOLRVn', medium: 'AZJRnhlWG_OJ', low: 'vb2-NBem7wRe',
          };
          const assignedId = assignedMap[action.character || 'postman'] || assignedMap.postman;
          const priorityId = priorityMap[action.priority || 'medium'] || priorityMap.medium;
          const lines = [
            `- ${action.title} #[[^tuoCgN5Y6sn9]]`,
            `  - [[^wRd8g4jr7Nqr]]:: [[^TQt9EnvCFbPW]]`,
            `  - [[^kOYlKvF3ddrT]]:: [[^${assignedId}]]`,
            `  - [[^C5ObhnBmyHvm]]:: [[^${priorityId}]]`,
          ];
          if (action.due) lines.push(`  - [[^8EVxOhX0Tnc4]]:: ${action.due}`);
          if (action.track) lines.push(`  - Source: ${action.track}`);
          lines.push(`  - Pipeline: from ${email.from}, ${email.subject}`);

          await mcpCall('tools/call', {
            name: 'import_tana_paste',
            arguments: { content: lines.join('\n'), parentNodeId: TANA_INBOX_ID },
          });
          details.push(`task created: "${action.title}" -> ${action.character}`);
          break;
        }

        case 'create_event':
          // TODO: Wire up Google Calendar event creation
          details.push(`event queued: "${action.title}" on ${action.date} at ${action.time}`);
          break;

        case 'draft_reply': {
          const fromEmail = email.fromRaw.match(/<([^>]+)>/)?.[1] || email.fromRaw;
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
