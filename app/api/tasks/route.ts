export const runtime = 'nodejs';
import { TASKS } from '@/lib/tasks';
import { apiOk } from '@/lib/api-helpers';

export function GET() {
  const tasks = Object.entries(TASKS).map(([id, t]) => ({
    id,
    label: t.label,
    description: t.description,
    category: t.category,
    character: t.character,
    model: t.model,
  }));
  return apiOk({ tasks });
}
