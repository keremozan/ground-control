export const runtime = 'nodejs';
import { buildCharacterPrompt } from '@/lib/prompt';
import { getCharacters } from '@/lib/characters';
import { spawnAndCollect } from '@/lib/spawn';
import { SCHEDULE_JOBS, type JobResult } from '@/lib/scheduler';
import { getTanaTasks, resolveCharacter } from '@/lib/tana';
import {
  JOB_RESULTS_PATH, MAX_JOB_RESULTS,
  TASK_CHARACTERS as TASK_CHAR_LIST, SKIP_TRACK_PATTERN,
} from '@/lib/config';
import { markJobRun, markJobStarted } from '@/lib/job-state';
import fs from 'fs';
import path from 'path';

const RESULTS_FILE = JOB_RESULTS_PATH;
const MAX_RESULTS = MAX_JOB_RESULTS;

const SCHEDULED_AUTONOMY = `
CRITICAL: This is an AUTOMATED scheduled job. You are running unattended — there is no human to answer questions.

RULES:
- NEVER ask the user to choose, confirm, or answer anything. Just do it.
- Execute ALL non-destructive operations autonomously: create tasks, classify, route, organize.
- Create Tana tasks for ALL actionable items you find. The user can delete unwanted tasks later.
- NEVER send emails or messages directly. Use the #outbox in Tana (see CLAUDE.md OUTBOX RULE).
- NEVER create Gmail drafts directly. Write #outbox nodes to Tana Inbox instead. Postman-deliver handles dedup and actual draft creation.
- SKIP items where the deadline has already passed — do not create tasks for expired deadlines.
- At the end, produce a brief summary report of what you did.
- Tana Paste: NEVER use !! heading syntax in node names. Just plain nodes and children. No bold in node names either.

DUPLICATE PREVENTION (MANDATORY):
Before creating ANY task, you MUST search Tana first to check if it already exists:
1. Use tana_semantic_search with the task name as query (limit: 10, minSimilarity: 0.4). This finds conceptually similar tasks even with different wording.
2. Read through the results — if ANY existing task covers the same action/topic, SKIP creating it.
3. "Similar" means same intent, not exact wording. "Send weekly report" and "Email the weekly status report" are duplicates.
4. In your report, list tasks you SKIPPED as duplicates with the existing task name you found.
5. When in doubt, DO NOT create the task. It is much worse to create duplicates than to miss one task.

CHANNEL RULE (MANDATORY):
- If a task originated from WhatsApp (source contains "WhatsApp"), set channel to "whatsapp" in the outbox. Do not use email.
- Creating an outbox item does NOT mean the task is done. Only mark a task as done when the actual action is complete (email sent, form submitted, document signed). Outbox items are intermediate steps. Leave the task status as-is.
`.trim();

// Dedup guard: tracks in-flight jobs to prevent double-spawn from rapid crontab firing
const IN_FLIGHT = new Map<string, number>();
const DEDUP_WINDOW_MS = 10_000;

function readResults(): JobResult[] {
  try {
    return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeResults(results: JobResult[]) {
  const dir = path.dirname(RESULTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results.slice(0, MAX_RESULTS), null, 2));
}

export async function POST(req: Request) {
  const body = await req.json() as {
    jobId?: string;
    // Ad-hoc autonomous job (crew buttons)
    charName?: string;
    seedPrompt?: string;
    label?: string;
    maxTurns?: number;
  };

  const characters = getCharacters();

  // Resolve job source: registered schedule OR ad-hoc
  let charName: string;
  let displayName: string;
  let seedPrompt: string;
  let jobId: string;
  let label: string;
  let mode: string | undefined;

  if (body.jobId) {
    const job = SCHEDULE_JOBS.find(j => j.id === body.jobId);
    if (!job) {
      return Response.json({ ok: false, error: 'Job not found' }, { status: 404 });
    }
    charName = job.charName;
    displayName = job.displayName;
    // Check for user-edited seedPrompt override
    let overrides: Record<string, string> = {};
    try {
      overrides = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'job-overrides.json'), 'utf-8'));
    } catch { /* no overrides file yet */ }
    seedPrompt = overrides[job.id] ?? job.seedPrompt;
    jobId = job.id;
    label = job.label;
    mode = job.mode;
  } else if (body.charName && body.seedPrompt) {
    charName = body.charName;
    displayName = charName.charAt(0).toUpperCase() + charName.slice(1);
    seedPrompt = body.seedPrompt;
    jobId = `adhoc-${charName}-${Date.now()}`;
    label = body.label || `${displayName} ad-hoc`;
    mode = undefined;
  } else {
    return Response.json({ ok: false, error: 'Provide jobId or charName+seedPrompt' }, { status: 400 });
  }

  // ── dedup guard: reject if same jobId started within DEDUP_WINDOW_MS ──
  const now = Date.now();
  const lastStarted = IN_FLIGHT.get(jobId);
  if (lastStarted && now - lastStarted < DEDUP_WINDOW_MS) {
    return Response.json({ ok: false, error: 'duplicate: job already running' }, { status: 409 });
  }
  IN_FLIGHT.set(jobId, now);
  // clean up stale entries
  for (const [key, ts] of IN_FLIGHT) {
    if (now - ts > DEDUP_WINDOW_MS * 2) IN_FLIGHT.delete(key);
  }

  // Persist start time to job-state.json so catch-up skips in-progress jobs
  // (works across process restarts / hot reloads unlike the in-memory IN_FLIGHT map)
  if (body.jobId) markJobStarted(jobId);

  // ── process-tasks: multi-character task processing ──
  const job = body.jobId ? SCHEDULE_JOBS.find(j => j.id === body.jobId) : undefined;
  if (job?.type === 'process-tasks') {
    try {
      return await handleProcessTasks(jobId, label, characters);
    } finally {
      IN_FLIGHT.delete(jobId);
    }
  }

  const char = characters[charName];
  if (!char) {
    return Response.json({ ok: false, error: 'Character not found' }, { status: 404 });
  }

  const taskContent = `${seedPrompt}\n\n---\n\n${SCHEDULED_AUTONOMY}`;
  const prompt = buildCharacterPrompt(charName, taskContent);
  const model = char.defaultModel || 'sonnet';
  const maxTurns = body.maxTurns ?? job?.maxTurns ?? (mode === 'full' ? 30 : mode === 'light' ? 15 : 20);

  try {
    const { response, durationMs } = await spawnAndCollect({
      prompt,
      model,
      maxTurns,
      label,
      characterId: charName,
    });

    const result: JobResult = {
      jobId,
      charName,
      displayName,
      timestamp: new Date().toISOString(),
      response,
      durationMs,
    };

    // Append to results file
    const existing = readResults();
    writeResults([result, ...existing]);

    markJobRun(jobId, 'success');
    IN_FLIGHT.delete(jobId);

    return Response.json({ ok: true, result });
  } catch (err) {
    markJobRun(jobId, 'error');
    IN_FLIGHT.delete(jobId);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// Characters that do task work (not review/strategic)
const TASK_CHARACTERS = new Set(TASK_CHAR_LIST);

// Tracks that require browser automation — skip in automated spawns
const SKIP_TRACKS = SKIP_TRACK_PATTERN;

async function handleProcessTasks(
  jobId: string,
  label: string,
  characters: Record<string, { defaultModel?: string }>,
) {
  const start = Date.now();

  // Fetch pending tasks and group by character
  let charTasks: Record<string, { id: string; name: string; status: string; track: string }[]> = {};
  try {
    const raw = await getTanaTasks();
    const tasks = raw.map(t => ({
      ...t,
      assigned: resolveCharacter(t.assigned, t.track, t.name),
    }));
    const pending = tasks.filter(t => t.status !== 'done' && (!SKIP_TRACKS || !SKIP_TRACKS.test(t.track)));

    for (const task of pending) {
      const char = (task.assigned || '').toLowerCase();
      if (TASK_CHARACTERS.has(char)) {
        (charTasks[char] ||= []).push(task);
      }
    }
  } catch (err) {
    return Response.json({ ok: false, error: `Task fetch failed: ${err}` }, { status: 500 });
  }

  const chars = Object.entries(charTasks);
  if (chars.length === 0) {
    const result: JobResult = {
      jobId,
      charName: 'system',
      displayName: 'Crew',
      timestamp: new Date().toISOString(),
      response: 'No characters have pending tasks.',
      durationMs: Date.now() - start,
    };
    const existing = readResults();
    writeResults([result, ...existing]);
    return Response.json({ ok: true, result });
  }

  // Spawn each character sequentially
  const summaryParts: string[] = [];
  const charResults: JobResult[] = [];

  for (const [cn, tasks] of chars) {
    const dn = cn.charAt(0).toUpperCase() + cn.slice(1);
    const char = characters[cn];
    if (!char) continue;

    const taskList = tasks.map(t => `- [${t.id}] ${t.name} (${t.status}, ${t.track})`).join('\n');
    const seedPrompt = [
      `IMPORTANT: This is task processing, NOT a report or review. Do NOT send any email summaries. The REPORT EMAIL RULE does not apply here. Work silently and log results to Tana only.`,
      ``,
      `You have ${tasks.length} pending task(s) assigned to you.`,
      ``,
      `For EACH task below:`,
      `1. Use read_node with the node ID in brackets to read the full task content`,
      `2. Understand what needs to be done`,
      `3. Do the work (create drafts, update Tana, research, etc.)`,
      `4. When finished, use check_node with the task's node ID to mark it done (checkbox drives status)`,
      `5. If you cannot complete a task, leave it as-is and note why in your report`,
      ``,
      `REPORT FORMAT — Your report must focus on WHAT YOU DID, not what's pending:`,
      `- "Completed" section: tasks you finished and how (drafted email, updated Tana, created document, etc.)`,
      `- "In progress" section: tasks you partially completed and what remains`,
      `- "Blocked" section: tasks you could not act on and why (needs physical action, browser required, waiting for input)`,
      `- Do NOT list pending tasks as a to-do list. Postman already does that. Your report is about work done.`,
      ``,
      `Tasks:`,
      taskList,
    ].join('\n');

    const taskContent = `${seedPrompt}\n\n---\n\n${SCHEDULED_AUTONOMY}`;
    const prompt = buildCharacterPrompt(cn, taskContent);
    const model = char.defaultModel || 'sonnet';

    try {
      const { response, durationMs } = await spawnAndCollect({
        prompt,
        model,
        maxTurns: 20,
        label: `${dn} tasks`,
        characterId: cn,
      });

      const charResult: JobResult = {
        jobId: `${jobId}-${cn}`,
        charName: cn,
        displayName: dn,
        timestamp: new Date().toISOString(),
        response,
        durationMs,
      };
      charResults.push(charResult);
      summaryParts.push(`${dn}: ${tasks.length} tasks (${Math.round(durationMs / 1000)}s)`);
    } catch {
      summaryParts.push(`${dn}: failed`);
    }
  }

  // Store all results
  const existing = readResults();
  const mainResult: JobResult = {
    jobId,
    charName: 'system',
    displayName: 'Crew',
    timestamp: new Date().toISOString(),
    response: summaryParts.join('\n'),
    durationMs: Date.now() - start,
  };
  writeResults([mainResult, ...charResults, ...existing]);

  return Response.json({ ok: true, result: mainResult });
}
