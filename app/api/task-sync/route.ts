export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { syncTasks } from '@/lib/task-sync';

export async function POST() {
  try {
    const report = await syncTasks();
    return Response.json({ ok: true, report });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
