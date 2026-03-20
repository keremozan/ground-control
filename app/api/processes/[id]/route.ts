export const runtime = 'nodejs';
import { killProcess } from '@/lib/process-registry';
import { apiOk, apiError } from '@/lib/api-helpers';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const killed = killProcess(id);
  if (!killed) {
    return apiError(404, 'Process not found');
  }
  return apiOk();
}
