export const runtime = 'nodejs';
import { TASKS } from '@/lib/tasks';
import { spawnSSEStream } from '@/lib/spawn';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = TASKS[taskId];
  if (!task) {
    return new Response('Task not found', { status: 404 });
  }

  const stream = spawnSSEStream({
    prompt: task.prompt(),
    model: task.model,
    maxTurns: task.maxTurns,
    label: task.label,
    characterId: task.character,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
