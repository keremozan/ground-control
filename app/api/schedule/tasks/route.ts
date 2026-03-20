export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { readTasks, createTask, deleteTask } from '@/lib/scheduled-tasks';
import { apiOk, apiError, requireFields } from '@/lib/api-helpers';

export async function GET() {
  const tasks = readTasks().sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );
  return apiOk({ tasks });
}

export async function POST(req: Request) {
  const body = await req.json() as {
    charName?: string;
    seedPrompt?: string;
    label?: string;
    scheduledAt?: string;
  };

  const missing = requireFields(body, ['charName', 'seedPrompt', 'label', 'scheduledAt']);
  if (missing) return apiError(400, missing);

  const task = createTask({
    charName: body.charName!,
    seedPrompt: body.seedPrompt!,
    label: body.label!,
    scheduledAt: body.scheduledAt!,
  });

  return apiOk({ task }, 201);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return apiError(400, 'Missing id parameter');
  }

  const found = deleteTask(id);
  if (!found) {
    return apiError(404, 'Task not found');
  }

  return apiOk();
}
