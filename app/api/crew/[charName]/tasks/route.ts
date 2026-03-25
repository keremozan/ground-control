export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { getTanaTasks, resolveCharacter } from '@/lib/tana';
import { apiOk, apiError } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

export async function POST(req: Request, { params }: { params: Promise<{ charName: string }> }) {
  const { charName } = await params;

  try {
    const raw = await getTanaTasks();
    const tasks = raw
      .map(t => ({ ...t, assigned: resolveCharacter(t.assigned, t.track, t.name) }))
      .filter(t => t.status !== 'done' && (t.assigned || '').toLowerCase() === charName.toLowerCase());

    if (tasks.length === 0) {
      return apiOk({ message: `${charName}: no pending tasks`, count: 0 });
    }

    const taskList = tasks.map(t => `- [${t.id}] ${t.name} (${t.status}, ${t.track})`).join('\n');
    const seedPrompt = [
      `IMPORTANT: This is task processing, NOT a report or review. Do NOT send any email summaries. The REPORT EMAIL RULE does not apply here. Work silently and log results to Tana only.`,
      ``,
      `You have ${tasks.length} pending task(s) assigned to you.`,
      ``,
      `For EACH task below:`,
      `1. Use read_node with the node ID in brackets to read the full task content`,
      `2. Understand what needs to be done`,
      `3. Do the work (code changes, skill edits, config updates, etc.)`,
      `4. When finished, use check_node with the task's node ID to mark it done`,
      `5. If you cannot complete a task, leave it as-is and note why`,
      ``,
      `Tasks:`,
      taskList,
    ].join('\n');

    const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
    const res = await fetch(`${baseUrl}/api/schedule/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ charName, seedPrompt, label: `${charName} tasks`, maxTurns: 100 }),
    });
    const data = await res.json();
    return apiOk({ message: `Spawned ${charName} for ${tasks.length} task(s)`, count: tasks.length, result: data?.data?.result ?? data });
  } catch (err) {
    captureError(`crew/${charName}/tasks`, err);
    return apiError(500, String(err));
  }
}
