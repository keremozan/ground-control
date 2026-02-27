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
- NEVER send emails or messages directly — only create drafts.
- SKIP items where the deadline has already passed — do not create tasks for expired deadlines.
- When creating Gmail drafts as replies, MUST set both threadId AND inReplyTo.
- At the end, produce a brief summary report of what you did.
- Tana Paste: NEVER use !! heading syntax in node names. Just plain nodes and children. No bold in node names either.

DUPLICATE PREVENTION (MANDATORY):
Before creating ANY task, you MUST search Tana first to check if it already exists:
1. Use tana_semantic_search with the task name as query (limit: 10, minSimilarity: 0.4). This finds conceptually similar tasks even with different wording.
2. Read through the results — if ANY existing task covers the same action/topic, SKIP creating it.
3. "Similar" means same intent, not exact wording. "Send weekly report" and "Email the weekly status report" are duplicates.
4. In your report, list tasks you SKIPPED as duplicates with the existing task name you found.
5. When in doubt, DO NOT create the task. It is much worse to create duplicates than to miss one task.
`.trim();

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
    seedPrompt = job.seedPrompt;
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

  // ── process-tasks: multi-character task processing ──
  const job = body.jobId ? SCHEDULE_JOBS.find(j => j.id === body.jobId) : undefined;
  if (job?.type === 'process-tasks') {
    return handleProcessTasks(jobId, label, characters);
  }

  const char = characters[charName];
  if (!char) {
    return Response.json({ ok: false, error: 'Character not found' }, { status: 404 });
  }

  const taskContent = `${seedPrompt}\n\n---\n\n${SCHEDULED_AUTONOMY}`;
  const prompt = buildCharacterPrompt(charName, taskContent);
  const model = char.defaultModel || 'sonnet';
  const maxTurns = mode === 'full' ? 30 : mode === 'light' ? 15 : 20;

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

    return Response.json({ ok: true, result });
  } catch (err) {
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
      `You have ${tasks.length} pending task(s) assigned to you.`,
      ``,
      `For EACH task below:`,
      `1. Use read_node with the node ID in brackets to read the full task content`,
      `2. Understand what needs to be done`,
      `3. Do the work (create drafts, update Tana, research, etc.)`,
      `4. When finished, set the task status to done using set_field_option`,
      `5. If you cannot complete a task, leave it as-is and note why in your report`,
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
