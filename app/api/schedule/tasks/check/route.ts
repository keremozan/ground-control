export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { claimOverdueTasks } from '@/lib/scheduled-tasks';
import { buildCharacterPrompt } from '@/lib/prompt';
import { getCharacters } from '@/lib/characters';
import { spawnAndCollect } from '@/lib/spawn';
import type { JobResult } from '@/lib/scheduler';
import { JOB_RESULTS_PATH, MAX_JOB_RESULTS } from '@/lib/config';
import { apiOk } from '@/lib/api-helpers';

const SCHEDULED_AUTONOMY = `
CRITICAL: This is an AUTOMATED scheduled task. You are running unattended — there is no human to answer questions.

RULES:
- NEVER ask the user to choose, confirm, or answer anything. Just do it.
- Execute ALL non-destructive operations autonomously.
- NEVER send emails or messages directly — only create drafts.
- At the end, produce a brief summary report of what you did.
`.trim();

function readResults(): JobResult[] {
  try {
    return JSON.parse(fs.readFileSync(JOB_RESULTS_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function writeResults(results: JobResult[]) {
  const dir = path.dirname(JOB_RESULTS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(JOB_RESULTS_PATH, JSON.stringify(results.slice(0, MAX_JOB_RESULTS), null, 2));
}

export async function POST() {
  const overdue = claimOverdueTasks();
  if (overdue.length === 0) {
    return apiOk({ ran: 0, tasks: [] });
  }

  const characters = getCharacters();
  const ranLabels: string[] = [];

  for (const task of overdue) {
    const char = characters[task.charName];
    if (!char) continue;

    const displayName = task.charName.charAt(0).toUpperCase() + task.charName.slice(1);
    const taskContent = `${task.seedPrompt}\n\n---\n\n${SCHEDULED_AUTONOMY}`;
    const prompt = buildCharacterPrompt(task.charName, taskContent);
    const model = char.defaultModel || 'sonnet';

    try {
      const { response, durationMs } = await spawnAndCollect({
        prompt,
        model,
        maxTurns: 20,
        label: task.label,
        characterId: task.charName,
      });

      const result: JobResult = {
        jobId: `scheduled-${task.id}`,
        charName: task.charName,
        displayName,
        timestamp: new Date().toISOString(),
        response,
        durationMs,
      };

      const existing = readResults();
      writeResults([result, ...existing]);
      ranLabels.push(task.label);
    } catch {
      // Log failure as a result too
      const result: JobResult = {
        jobId: `scheduled-${task.id}`,
        charName: task.charName,
        displayName,
        timestamp: new Date().toISOString(),
        response: `Scheduled task failed: ${task.label}`,
        durationMs: 0,
      };
      const existing = readResults();
      writeResults([result, ...existing]);
    }

  }

  return apiOk({ ran: ranLabels.length, tasks: ranLabels });
}
