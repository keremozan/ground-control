export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { listProcesses } from '@/lib/process-registry';

export async function GET() {
  return Response.json({ processes: listProcesses() });
}
