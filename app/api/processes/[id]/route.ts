export const runtime = 'nodejs';
import { killProcess } from '@/lib/process-registry';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const killed = killProcess(id);
  if (!killed) {
    return Response.json({ ok: false, error: 'Process not found' }, { status: 404 });
  }
  return Response.json({ ok: true });
}
