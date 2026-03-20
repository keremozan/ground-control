export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { listProcesses } from '@/lib/process-registry';
import { apiOk } from '@/lib/api-helpers';

export async function GET() {
  return apiOk({ processes: listProcesses() });
}
