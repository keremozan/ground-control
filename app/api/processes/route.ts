export const runtime = 'nodejs';
import { listProcesses } from '@/lib/process-registry';

export async function GET() {
  return Response.json({ processes: listProcesses() });
}
