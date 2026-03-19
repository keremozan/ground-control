export const runtime = 'nodejs';
import { getPipelineLog } from '@/lib/pipeline-log';

export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get('limit') || '50');
  return Response.json({ entries: getPipelineLog(limit) });
}
