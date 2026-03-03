export const runtime = 'nodejs';
import { readTasks, createTask, deleteTask } from '@/lib/scheduled-tasks';

export async function GET() {
  const tasks = readTasks().sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );
  return Response.json({ tasks });
}

export async function POST(req: Request) {
  const body = await req.json() as {
    charName?: string;
    seedPrompt?: string;
    label?: string;
    scheduledAt?: string;
  };

  if (!body.charName || !body.seedPrompt || !body.label || !body.scheduledAt) {
    return Response.json(
      { error: 'Missing required fields: charName, seedPrompt, label, scheduledAt' },
      { status: 400 }
    );
  }

  const task = createTask({
    charName: body.charName,
    seedPrompt: body.seedPrompt,
    label: body.label,
    scheduledAt: body.scheduledAt,
  });

  return Response.json({ task }, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return Response.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  const found = deleteTask(id);
  if (!found) {
    return Response.json({ error: 'Task not found' }, { status: 404 });
  }

  return Response.json({ ok: true });
}
