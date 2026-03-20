export const runtime = 'nodejs';
import { TASKS } from '@/lib/tasks';
import { spawnSSEStream } from '@/lib/spawn';
import { apiError, apiStream } from '@/lib/api-helpers';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = TASKS[taskId];
  if (!task) {
    return apiError(404, 'Task not found');
  }

  const stream = spawnSSEStream({
    prompt: task.prompt(),
    model: task.model,
    maxTurns: task.maxTurns,
    label: task.label,
    characterId: task.character,
  });

  return apiStream(stream);
}
