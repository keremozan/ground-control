export const runtime = 'nodejs';
import { TASKS } from '@/lib/tasks';

export function GET() {
  const tasks = Object.entries(TASKS).map(([id, t]) => ({
    id,
    label: t.label,
    description: t.description,
    category: t.category,
    character: t.character,
    model: t.model,
  }));
  return Response.json({ tasks });
}
